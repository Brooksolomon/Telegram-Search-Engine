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

export interface TimelinePoint {
  week: string;
  count: number;
}

export interface ConnectionOut {
  channel_id: number | null;
  title: string | null;
  username: string | null;
  weight: number;
}

export interface ChannelAnalytics {
  total_messages: number;
  image_pct: number;
  link_pct: number;
  avg_length: number;
  posts_per_week: number | null;
  first_post: string | null;
  last_post: string | null;
  top_weekday: number | null;
  top_hour: number | null;
  timeline: TimelinePoint[];
  in_degree: number;
  out_degree: number;
  pagerank_rank: number | null;
  cluster_id: number | null;
  references: ConnectionOut[];
  referenced_by: ConnectionOut[];
}

export interface ChannelDetail extends ChannelSummary {
  tone: string | null;
  typical_content: string | null;
  confidence: number | null;
  activity_score: number | null;
  quality_score: number | null;
  freshness_score: number | null;
  influence_score: number | null;
  discovered_by_keyword: string | null;
  first_seen_at: string | null;
  last_crawled_at: string | null;
  sample_messages: MessageOut[];
  analytics: ChannelAnalytics | null;
}

export interface CategoryOut {
  category: string;
  channel_count: number;
}

export interface GraphNode {
  id: number;
  username: string | null;
  title: string;
  category: string | null;
  member_count: number | null;
  pagerank: number | null;
  in_degree: number | null;
  betweenness: number | null;
  cluster_id: number | null;
}

export interface GraphEdge {
  source_id: number;
  target_id: number;
  weight: number;
}

export interface GraphOut {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface HubOut {
  id: number;
  username: string | null;
  title: string;
  category: string | null;
  pagerank: number | null;
  in_degree: number | null;
  betweenness: number | null;
  cluster_id: number | null;
}

export interface ClusterOut {
  cluster_id: number;
  size: number;
  top_category: string | null;
  top_titles: string[];
}

export interface StatsOut {
  total_channels: number;
  analyzed: number;
  pending_analysis: number;
  total_messages: number;
  marketplace: number;
  spam: number;
  crawled_24h: number;
  frontier_pending: number;
  frontier_done: number;
  frontier_failed: number;
  frontier_skipped: number;
  keywords_tracked: number;
  categories: CategoryOut[];
}
