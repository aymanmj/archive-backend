// src/timeline/dto/timeline-item.dto.ts

export class TimelineItemDto {
  id: number;
  at: string; // ISO string
  eventType: string;
  actorId: number | null;
  actorName: string | null;
  details: any;
}
