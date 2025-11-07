-- Extensions (idempotent, ignore if not allowed by your DB role)
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===== Full-Text Search functions & triggers =====

-- 1) دالة بناء الناقل من عدة مصادر
CREATE OR REPLACE FUNCTION doc_build_search_vector(doc_id bigint)
RETURNS tsvector
LANGUAGE sql STABLE AS $$
WITH
  d AS (
    SELECT
      COALESCE(unaccent(lower("title")), '')   AS t,
      COALESCE(unaccent(lower("summary")), '') AS s
    FROM "Document" WHERE id = doc_id
  ),
  md AS (
    SELECT COALESCE(string_agg(unaccent(lower(m."metaValue")), ' '), '')
    FROM "DocumentMetadata" m
    WHERE m."documentId" = doc_id AND m."isSearchable" = true
  ),
  tg AS (
    SELECT COALESCE(string_agg(unaccent(lower(t."tagName")), ' '), '')
    FROM "DocumentTagLink" l
    JOIN "DocumentTag" t ON t.id = l."tagId"
    WHERE l."documentId" = doc_id
  ),
  ocr AS (
    SELECT COALESCE(string_agg(unaccent(lower(o."textContent")), ' '), '')
    FROM "OCRText" o
    WHERE o."documentId" = doc_id
  ),
  ext AS (
    SELECT COALESCE(unaccent(lower(ep."name")), '')
    FROM "IncomingRecord" ir
    JOIN "ExternalParty" ep ON ep.id = ir."externalPartyId"
    WHERE ir."documentId" = doc_id
    LIMIT 1
  )
SELECT
  setweight(to_tsvector('simple', (SELECT t FROM d)), 'A') ||
  setweight(to_tsvector('simple', (SELECT s FROM d)), 'B') ||
  setweight(to_tsvector('simple', (SELECT * FROM md)), 'C') ||
  setweight(to_tsvector('simple', (SELECT * FROM tg)), 'C') ||
  setweight(to_tsvector('simple', (SELECT * FROM ocr)), 'D') ||
  setweight(to_tsvector('simple', (SELECT * FROM ext)), 'B');
$$;

-- 2) تريغر تحديث الناقل
CREATE OR REPLACE FUNCTION doc_update_search_vector()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  _doc_id bigint;
BEGIN
  _doc_id :=
    COALESCE(
      CASE WHEN TG_TABLE_NAME = 'Document' THEN COALESCE(NEW.id, OLD.id) END,
      COALESCE(NEW."documentId", OLD."documentId")
    );

  IF _doc_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE "Document"
     SET "searchVector" = doc_build_search_vector(_doc_id)
   WHERE id = _doc_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3) التريغرز على الجداول المؤثرة
DROP TRIGGER IF EXISTS trg_doc_update_searchvector ON "Document";
CREATE TRIGGER trg_doc_update_searchvector
AFTER INSERT OR UPDATE OF "title","summary" ON "Document"
FOR EACH ROW EXECUTE FUNCTION doc_update_search_vector();

DROP TRIGGER IF EXISTS trg_md_update_searchvector ON "DocumentMetadata";
CREATE TRIGGER trg_md_update_searchvector
AFTER INSERT OR UPDATE OR DELETE ON "DocumentMetadata"
FOR EACH ROW EXECUTE FUNCTION doc_update_search_vector();

DROP TRIGGER IF EXISTS trg_tag_update_searchvector ON "DocumentTagLink";
CREATE TRIGGER trg_tag_update_searchvector
AFTER INSERT OR UPDATE OR DELETE ON "DocumentTagLink"
FOR EACH ROW EXECUTE FUNCTION doc_update_search_vector();

DROP TRIGGER IF EXISTS trg_ocr_update_searchvector ON "OCRText";
CREATE TRIGGER trg_ocr_update_searchvector
AFTER INSERT OR UPDATE OR DELETE ON "OCRText"
FOR EACH ROW EXECUTE FUNCTION doc_update_search_vector();

DROP TRIGGER IF EXISTS trg_incoming_update_searchvector ON "IncomingRecord";
CREATE TRIGGER trg_incoming_update_searchvector
AFTER INSERT OR UPDATE OR DELETE ON "IncomingRecord"
FOR EACH ROW EXECUTE FUNCTION doc_update_search_vector();

-- 4) تعبئة أولية للناقل للموجود حاليًا
UPDATE "Document" SET "searchVector" = doc_build_search_vector(id);
