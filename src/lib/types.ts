import type { Timestamp } from "firebase/firestore";

export type Role = "owner" | "collaborator" | "viewer";

export interface WisherList {
  id: string;
  name: string;
  description?: string;
  eventDate?: string | Timestamp | null;
  owner: string;
  collaborators: string[]; // emails
  viewers?: string[];
  isPublic?: boolean;
  ordered?: boolean;
  collaboratorShareAccess?: boolean;
  geminiApiKey?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  role?: Role;
  accessRole?: Role;
  viewedAt?: Timestamp;
}

export interface WisherItem {
  id: string;
  name: string;
  url?: string;
  description?: string;
  imageUrl?: string;
  position: number;
  bought: boolean;
  buyerName?: string;
  buyerEmail?: string;
  buyerNote?: string;
  datePurchased?: Timestamp;
  groupId?: string | null;
  conditionalVisibility?: boolean;
  triggerItemId?: string | null;
  comments?: Comment[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  // runtime
  _triggerBought?: boolean;
}

export interface WisherGroup {
  id: string;
  name: string;
  imageUrl?: string | null;
  description?: string | null;
  position?: number;
  displayOrder?: number;
  conditionalVisibility?: boolean;
  triggerItemId?: string | null;
  autoBuy?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Comment {
  id: string;
  text: string;
  authorEmail: string;
  authorName: string;
  timestamp: Timestamp;
  editedAt?: Timestamp;
}
