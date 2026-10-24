export interface ArticleBrief {
  id: number;
  title: string;
  summary: string;
  status: 'draft' | 'published';
  pinned: 0 | 1;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author_id: number;
  author_name: string;
  author_name_color: string | null;
  author_avatar: string | null;
}

export interface Article extends Omit<ArticleBrief, 'author_id' | 'author_avatar'> {
  content: string;
  author_id: number;
  author_name: string;
  author_name_color: string | null;
  author_avatar: string | null;
}
