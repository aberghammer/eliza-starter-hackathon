export type TwitterProfile = {
  id: string;
  username: string;
  screenName: string;
  bio: string;
  nicknames: string[];
};

export type CookieTweet = {
  authorUsername: string;
  createdAt: string;
  engagementsCount: number;
  impressionsCount: number;
  isQuote: boolean;
  isReply: boolean;
  likesCount: number;
  quotesCount: number;
  repliesCount: number;
  retweetsCount: number;
  smartEngagementPoints: number;
  text: string;
  matchingScore: number;
};

export type CookieTweetResponse = {
  ok: CookieTweet[];
  success: boolean;
  error: string | null;
};
