export type PostSearchDoc = {
  id: string;
  userId: string;
  body: string;
  createdAtTs: number;
};

export type UserSearchDoc = {
  id: string;
  displayName: string;
};

export type SearchPage = {
  ids: string[];
  estimatedTotal: number;
};

export interface SearchProvider {
  readonly name: 'meili' | 'pg';
  init(): Promise<void>;
  indexPost(doc: PostSearchDoc): Promise<void>;
  deletePost(postId: string): Promise<void>;
  indexUser(doc: UserSearchDoc): Promise<void>;
  searchPosts(q: string, page: { offset: number; limit: number }): Promise<SearchPage>;
  searchUsers(q: string, page: { offset: number; limit: number }): Promise<SearchPage>;
  clearAll(): Promise<void>;
}

export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');
