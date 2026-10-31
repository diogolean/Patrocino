import type {
  CommentDto,
  CreatorDto,
  DiscoveryQuery,
  MimeluxGateway,
  Paginated,
  PostDto,
  ReviewDto,
} from "@mimelux/core";
import {
  categories,
  conversations,
  creators,
  creatorLikeTotal,
  dashboardMetrics,
  notifications,
  plans,
  posts,
  reviews,
  seedComments,
} from "./fixtures";

class MockGateway implements MimeluxGateway {
  readonly mode = "mock" as const;
  readonly creators = creators;
  readonly posts = posts;
  readonly conversations = conversations;
  readonly categories = categories;
  readonly plans = plans;
  readonly notifications = notifications;
  readonly dashboardMetrics = dashboardMetrics;

  async listCreators(query: DiscoveryQuery = {}): Promise<Paginated<CreatorDto>> {
    const search = query.search?.trim().toLocaleLowerCase("pt-BR");
    const category = query.category?.toLocaleLowerCase("pt-BR");
    const filtered = this.creators.filter((creator) => {
      const matchesSearch =
        !search ||
        `${creator.name} ${creator.username} ${creator.category}`
          .toLocaleLowerCase("pt-BR")
          .includes(search);
      const matchesCategory =
        !category ||
        category === "todos" ||
        creator.category.toLocaleLowerCase("pt-BR") === category;
      return matchesSearch && matchesCategory;
    });
    return {
      items: filtered.map(toCreatorDto),
      nextCursor: null,
    };
  }

  async getCreator(username: string): Promise<CreatorDto | null> {
    const creator = this.creators.find((item) => item.username === username);
    return creator ? toCreatorDto(creator) : null;
  }

  async listFeed(_cursor?: string): Promise<Paginated<PostDto>> {
    void _cursor;
    return {
      items: this.posts.map((post) => ({
        id: post.id,
        creatorId: post.creatorId,
        mediaUrl: post.image,
        caption: post.mediaType === "video" ? "" : post.caption,
        visibility: post.visibility,
        mediaType: post.mediaType,
        priceCents: post.price,
        likeCount: post.likes,
        publishedAtLabel: post.time,
        demo: post.demo,
      })),
      nextCursor: null,
    };
  }

  async listConversations() {
    return this.conversations.map((conversation) => ({
      id: conversation.id,
      creatorId: conversation.creatorId,
      preview: conversation.preview,
      timeLabel: conversation.time,
      unreadCount: conversation.unread,
    }));
  }

  async listReviews(creatorId: string): Promise<ReviewDto[]> {
    return reviews
      .filter((review) => review.creatorId === creatorId)
      .map((review) => ({ ...review }));
  }

  async listComments(postId: string): Promise<CommentDto[]> {
    return seedComments
      .filter((comment) => comment.postId === postId)
      .map((comment) => ({ ...comment }));
  }

  async simulateSubscription(_creatorId?: string, _planId?: string) {
    void _creatorId;
    void _planId;
    return Promise.resolve();
  }

  async simulatePurchase(_contentId?: string) {
    void _contentId;
    return Promise.resolve();
  }
}

class ApiGateway implements MimeluxGateway {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) throw new Error(`API request failed with ${response.status}`);
    return response.json() as Promise<T>;
  }

  listCreators(query: DiscoveryQuery = {}) {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    if (query.category) params.set("category", query.category);
    return this.request<Paginated<CreatorDto>>(`/creators?${params}`);
  }

  getCreator(username: string) {
    return this.request<CreatorDto | null>(`/creators/${username}`);
  }

  listFeed(cursor?: string) {
    return this.request<Paginated<PostDto>>(`/feed${cursor ? `?cursor=${cursor}` : ""}`);
  }

  listConversations() {
    return this.request<Awaited<ReturnType<MimeluxGateway["listConversations"]>>>(
      "/conversations",
    );
  }

  listReviews(creatorId: string) {
    return this.request<{ items: ReviewDto[] }>(`/reviews?creatorId=${encodeURIComponent(creatorId)}`).then(
      (payload) => payload.items ?? [],
    );
  }

  listComments(postId: string) {
    return this.request<{ items: CommentDto[] }>(`/posts/${encodeURIComponent(postId)}/comments`).then(
      (payload) => payload.items ?? [],
    );
  }

  async simulateSubscription(creatorId: string, planId: string) {
    await this.request("/subscriptions/checkout", {
      method: "POST",
      body: JSON.stringify({ creatorId, planId, mode: "demo" }),
    });
  }

  async simulatePurchase(contentId: string) {
    await this.request(`/purchases/${contentId}/checkout`, {
      method: "POST",
      body: JSON.stringify({ mode: "demo" }),
    });
  }
}

function toCreatorDto(creator: (typeof creators)[number]): CreatorDto {
  return {
    id: creator.id,
    name: creator.name,
    username: creator.username,
    avatarUrl: creator.avatar,
    coverUrl: creator.cover,
    category: creator.category,
    bio: creator.bio,
    city: creator.city,
    verified: creator.verified,
    isFree: creator.free,
    monthlyPriceCents: creator.price,
    subscriberCount: creator.subscribers,
    postCount: creator.posts,
    likeCount: creatorLikeTotal(creator.id),
    fictitious: creator.fictitious,
    aiGenerated: creator.aiGenerated,
  };
}

export const mockGateway = new MockGateway();
export const apiGateway = new ApiGateway(
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3334/v1",
);

class FallbackGateway implements MimeluxGateway {
  private async fallback<T>(api: () => Promise<T>, mock: () => Promise<T>) {
    try {
      return await api();
    } catch {
      return mock();
    }
  }

  listCreators(query: DiscoveryQuery = {}) {
    return this.fallback(
      () => apiGateway.listCreators(query),
      () => mockGateway.listCreators(query),
    );
  }
  getCreator(username: string) {
    return this.fallback(
      () => apiGateway.getCreator(username),
      () => mockGateway.getCreator(username),
    );
  }
  listFeed(cursor?: string) {
    return this.fallback(
      () => apiGateway.listFeed(cursor),
      () => mockGateway.listFeed(cursor),
    );
  }
  listConversations() {
    return this.fallback(
      () => apiGateway.listConversations(),
      () => mockGateway.listConversations(),
    );
  }
  listReviews(creatorId: string) {
    return this.fallback(
      () => apiGateway.listReviews(creatorId),
      () => mockGateway.listReviews(creatorId),
    );
  }
  listComments(postId: string) {
    return this.fallback(
      () => apiGateway.listComments(postId),
      () => mockGateway.listComments(postId),
    );
  }
  simulateSubscription(creatorId: string, planId: string) {
    return this.fallback(
      () => apiGateway.simulateSubscription(creatorId, planId),
      () => mockGateway.simulateSubscription(creatorId, planId),
    );
  }
  simulatePurchase(contentId: string) {
    return this.fallback(
      () => apiGateway.simulatePurchase(contentId),
      () => mockGateway.simulatePurchase(contentId),
    );
  }
}

/** API-first adapter with a transparent local fallback for offline demos. */
export const gateway = new FallbackGateway();

export {
  categories,
  conversations,
  creators,
  creatorLikeTotal,
  dashboardMetrics,
  notifications,
  plans,
  posts,
  reviews,
  reviewsFor,
  postsForCreator,
  seedComments,
  brl,
  compact,
} from "./fixtures";
export type { Creator, Post } from "./fixtures";
