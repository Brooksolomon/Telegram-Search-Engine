// Mirrors the FastAPI Pydantic response models.

export interface ChannelSummary {
  id: number;
  username: string | null;
  title: string;
  member_count: number | null;
  category: string | null;
  is_marketplace: boolean | null;
  summary: string | null;
  why_recommended: string | null;
  final_score: number | null;
  tg_link: string | null;
}

export interface MessageOut {
  tg_message_id: number;
  text: string | null;
  has_image: boolean;
  has_link: boolean;
  posted_at: string | null;
  channel_username: string | null;
  tg_url: string | null;
}

export interface ChannelDetail extends ChannelSummary {
  tone: string | null;
  typical_content: string | null;
  confidence: number | null;
  activity_score: number | null;
  quality_score: number | null;
  freshness_score: number | null;
  discovered_by_keyword: string | null;
  first_seen_at: string | null;
  last_crawled_at: string | null;
  sample_messages: MessageOut[];
}

export interface CategoryOut {
  category: string;
  channel_count: number;
}
