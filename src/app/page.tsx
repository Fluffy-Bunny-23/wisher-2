"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendEmailVerification,
} from "firebase/auth";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  writeBatch,
} from "firebase/firestore";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Menu,
  Plus,
  ShoppingCart,
  Search,
  Filter,
  X,
  Moon,
  Sun,
  HelpCircle,
  Settings,
  Share2,
  LogOut,
  Trash2,
  Pencil,
  Info,
  ExternalLink,
  GripVertical,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Sparkles,
  FolderPlus,
  Link2,
  QrCode,
  Mail,
  Copy,
  Upload,
  Eye,
  Layers,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";

import { auth, db, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { WisherList, WisherItem, WisherGroup, Comment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// ───────────────── helpers ─────────────────
function formatDate(v: unknown): string {
  if (!v) return "";
  try {
    // Firestore Timestamp
    const maybeTs = v as { toDate?: () => Date };
    if (maybeTs.toDate) return maybeTs.toDate().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const d = v instanceof Date ? v : new Date(v as string);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return String(v ?? "");
  }
}
function formatDateInput(v: unknown): string {
  if (!v) return "";
  const maybeTs = v as { toDate?: () => Date };
  let d: Date | null = null;
  if (maybeTs.toDate) { try { d = maybeTs.toDate(); } catch { return ""; } }
  else if (v instanceof Date) d = v;
  else if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    d = new Date(v);
  }
  if (!d || isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function canEdit(list: WisherList | null, email?: string | null): boolean {
  if (!list || !email) return false;
  if (list.owner === email) return true;
  const c = list.collaborators ?? [];
  if (Array.isArray(c)) return c.includes(email);
  if (typeof c === "object" && c !== null) return Object.values(c as Record<string, string>).includes(email);
  return false;
}
function isOwner(list: WisherList | null, email?: string | null): boolean {
  return !!list && !!email && list.owner === email;
}
function validateUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "mailto:" + s;
  try {
    const u = new URL(s);
    if (["http:", "https:", "mailto:", "tel:", "sms:", "mms:", "facetime:", "skype:", "geo:", "maps:"].includes(u.protocol)) return s;
    return "";
  } catch {
    try {
      const withHttps = new URL("https://" + s);
      if (withHttps.hostname.includes(".") || withHttps.hostname === "localhost") return "https://" + s;
    } catch {}
    return "";
  }
}
function shareUrl(listId: string, role: "viewer" | "collaborator"): string {
  const base = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  return `${base}?list=${encodeURIComponent(listId)}&role=${encodeURIComponent(role)}`;
}

// ───────── sortable wrappers ─────────
function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}>
      <div className="relative group">{children}<button {...attributes} {...listeners} className="absolute right-2 top-2 hidden group-hover:flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent" aria-label="Drag"><GripVertical className="h-4 w-4" /></button></div>
    </div>
  );
}
function SortableGroup({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">{children}</div>
    </div>
  );
}

// ───────────────── main page ─────────────────
export default function WisherPage() {
  const { user, loading: authLoading } = useAuth();

  // theme
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const saved = (localStorage.getItem("wisher-theme") as "light" | "dark" | null) || (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);
  const toggleTheme = useCallback(() => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("wisher-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }, [theme]);

  // navigation
  const [screen, setScreen] = useState<"auth" | "lists" | "wishlist">("auth");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // auth form
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // lists
  const [lists, setLists] = useState<WisherList[]>([]);
  const [viewedLists, setViewedLists] = useState<WisherList[]>([]);
  const [currentList, setCurrentList] = useState<WisherList | null>(null);
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [currentListRole, setCurrentListRole] = useState<string | null>(null);
  const [listsLoading, setListsLoading] = useState(false);

  // wishlist data
  const [items, setItems] = useState<WisherItem[]>([]);
  const [groups, setGroups] = useState<Record<string, WisherGroup>>({});
  const [search, setSearch] = useState("");
  const [showBought, setShowBought] = useState(false);
  const [showAsViewer, setShowAsViewer] = useState(false);
  const [sortBy, setSortBy] = useState<"creators" | "alphabetical">("creators");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterAvailable, setFilterAvailable] = useState(true);
  const [filterBought, setFilterBought] = useState(false);
  const [showMoveButtons, setShowMoveButtons] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState("");

  // modals
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareQr, setShareQr] = useState<string | null>(null);
  const [shareQrRole, setShareQrRole] = useState<"viewer" | "collaborator">("viewer");
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [infoItem, setInfoItem] = useState<WisherItem | null>(null);
  const [buyItem, setBuyItem] = useState<WisherItem | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerNote, setBuyerNote] = useState("");
  const [editListOpen, setEditListOpen] = useState(false);
  const [editListForm, setEditListForm] = useState({ name: "", description: "", eventDate: "", isPublic: false, ordered: true });
  const [newCollabEmail, setNewCollabEmail] = useState("");
  const [newViewerEmail, setNewViewerEmail] = useState("");
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WisherItem | null>(null);
  const [itemForm, setItemForm] = useState({ name: "", url: "", description: "", imageUrl: "", position: "", groupId: "", conditional: false, triggerItemId: "" });
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<WisherGroup | null>(null);
  const [groupForm, setGroupForm] = useState({ name: "", imageUrl: "", description: "", position: "", conditional: false, triggerItemId: "", autoBuy: false });
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importUseAi, setImportUseAi] = useState(false);
  const [importApiKey, setImportApiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [editingComment, setEditingComment] = useState<{ itemId: string; commentId: string; text: string } | null>(null);

  const effectiveCanEdit = useMemo(() => !!currentList && canEdit(currentList, user?.email) && !showAsViewer, [currentList, user?.email, showAsViewer]);
  const isListOwner = useMemo(() => isOwner(currentList, user?.email), [currentList, user?.email]);

  // read URL on mount
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const list = sp.get("list");
    const role = sp.get("role");
    if (list) {
      setCurrentListId(list);
      localStorage.setItem("pendingSharedListId", list);
      if (role) { setCurrentListRole(role); localStorage.setItem("pendingSharedListRole", role); }
    } else {
      const pending = localStorage.getItem("pendingSharedListId");
      const pendingRole = localStorage.getItem("pendingSharedListRole");
      if (pending) setCurrentListId(pending);
      if (pendingRole) setCurrentListRole(pendingRole);
    }
  }, []);

  // auth-driven routing
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setScreen("auth"); return; }
    if (currentListId) {
      void loadList(currentListId);
    } else {
      setScreen("lists");
      void loadUserLists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // keep email draft for buyer
  useEffect(() => {
    if (buyItem && user?.email) { setBuyerEmail(user.email); setBuyerName(user.displayName || user.email.split("@")[0]); }
  }, [buyItem, user]);

  // load collapsed groups from localStorage
  useEffect(() => {
    if (!currentListId) return;
    try {
      const raw = localStorage.getItem("collapsedGroups");
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, Record<string, boolean>>;
        setCollapsedGroups(parsed[currentListId] ?? {});
      }
    } catch {}
  }, [currentListId]);

  const persistCollapsed = useCallback((next: Record<string, boolean>) => {
    if (!currentListId) return;
    setCollapsedGroups(next);
    try {
      const raw = localStorage.getItem("collapsedGroups");
      const parsed = raw ? (JSON.parse(raw) as Record<string, Record<string, boolean>>) : {};
      parsed[currentListId] = next;
      localStorage.setItem("collapsedGroups", JSON.stringify(parsed));
    } catch {}
  }, [currentListId]);

  // ── Firestore helpers ──
  const loadUserLists = useCallback(async () => {
    if (!user?.email) return;
    setListsLoading(true);
    try {
      const ownedQ = query(collection(db, "lists"), where("owner", "==", user.email));
      const collabQ = query(collection(db, "lists"), where("collaborators", "array-contains", user.email));
      const [ownedSnap, collabSnap] = await Promise.all([getDocs(ownedQ), getDocs(collabQ)]);
      const seen = new Set<string>();
      const all: WisherList[] = [];
      ownedSnap.forEach((d) => { seen.add(d.id); all.push({ id: d.id, ...(d.data() as Omit<WisherList, "id">), role: "owner" }); });
      collabSnap.forEach((d) => { if (!seen.has(d.id)) all.push({ id: d.id, ...(d.data() as Omit<WisherList, "id">), role: "collaborator" }); });
      setLists(all);
      // viewed
      try {
        const vSnap = await getDocs(query(collection(db, "users", user.uid, "viewedLists"), orderBy("viewedAt", "desc")));
        const ids: string[] = [];
        vSnap.forEach((d) => ids.push((d.data() as { listId: string }).listId));
        const docs = await Promise.all(ids.slice(0, 10).map((id) => getDoc(doc(db, "lists", id))));
        const viewed: WisherList[] = [];
        docs.forEach((d, i) => { if (d.exists()) viewed.push({ id: d.id, ...(d.data() as Omit<WisherList, "id">), viewedAt: (vSnap.docs[i]?.data() as { viewedAt?: WisherList["viewedAt"] })?.viewedAt, accessRole: "viewer" }); });
        setViewedLists(viewed);
      } catch {}
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load lists");
    } finally { setListsLoading(false); }
  }, [user]);

  const loadList = useCallback(async (listId: string) => {
    if (!listId) return;
    setSyncing(true);
    try {
      const snap = await getDoc(doc(db, "lists", listId));
      if (!snap.exists()) { toast.error("List not found"); setScreen("lists"); return; }
      const data = { id: snap.id, ...(snap.data() as Omit<WisherList, "id">) } as WisherList;
      setCurrentList(data);
      setCurrentListId(listId);
      setGeminiKey(data.geminiApiKey ?? "");
      setSortBy("creators");
      // handle share role
      if (currentListRole) {
        const email = user?.email;
        if (email) {
          const collabs: string[] = Array.isArray(data.collaborators) ? data.collaborators : data.collaborators ? Object.values(data.collaborators as unknown as Record<string, string>) : [];
          const viewers: string[] = Array.isArray(data.viewers) ? (data.viewers as string[]) : data.viewers ? Object.values(data.viewers as unknown as Record<string, string>) : [];
          if (currentListRole === "collaborator" && !collabs.includes(email)) {
            await updateDoc(doc(db, "lists", listId), { collaborators: arrayUnion(email) });
            toast.success("Added as collaborator");
          } else if (currentListRole === "viewer" && !viewers.includes(email)) {
            await updateDoc(doc(db, "lists", listId), { viewers: arrayUnion(email) });
            toast.success("Added as viewer");
          }
        }
        localStorage.removeItem("pendingSharedListId");
        localStorage.removeItem("pendingSharedListRole");
      }
      const url = new URL(window.location.href);
      url.searchParams.set("list", listId);
      window.history.replaceState({}, "", url.toString());
      // viewer auto
      const canEditNow = canEdit(data, user?.email);
      if (!canEditNow && user) { setShowAsViewer(true); setShowBought(true); }
      setScreen("wishlist");
      await loadListItems(listId);
      // save viewed if viewer
      if (user && !canEditNow) {
        try { await updateDoc(doc(db, "users", user.uid, "viewedLists", listId), { listId, viewedAt: serverTimestamp(), accessRole: "viewer" } as never); } catch { const { setDoc } = await import("firebase/firestore"); await setDoc(doc(db, "users", user.uid, "viewedLists", listId), { listId, viewedAt: serverTimestamp(), accessRole: "viewer" }); }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load list");
    } finally { setSyncing(false); }
  }, [user, currentListRole]);

  const loadListItems = useCallback(async (listId: string) => {
    try {
      const [itemsSnap, groupsSnap] = await Promise.all([
        getDocs(query(collection(db, "lists", listId, "items"), orderBy("position", "asc"))),
        getDocs(collection(db, "lists", listId, "groups")),
      ]);
      const listItems: WisherItem[] = [];
      itemsSnap.forEach((d) => {
        const data = d.data() as Omit<WisherItem, "id">;
        if (!data.comments) (data as WisherItem).comments = [];
        // legacy cleanup: strip notes field locally
        if ((data as unknown as { notes?: string }).notes) delete (data as unknown as { notes?: string }).notes;
        listItems.push({ id: d.id, ...(data as Omit<WisherItem, "id">) });
      });
      const gmap: Record<string, WisherGroup> = {};
      groupsSnap.forEach((d) => { gmap[d.id] = { id: d.id, ...(d.data() as Omit<WisherGroup, "id">) }; });
      setItems(listItems);
      setGroups(gmap);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load items");
    }
  }, []);

  // ── auth actions ──
  async function doGoogle() {
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success("Signed in with Google");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Google sign-in failed");
    }
  }
  async function doEmailSignIn() {
    if (!email || !password) { toast.error("Enter email and password"); return; }
    try { await signInWithEmailAndPassword(auth, email, password); toast.success("Signed in"); } catch (e) { toast.error(e instanceof Error ? e.message : "Sign-in failed"); }
  }
  async function doSignUp() {
    if (!email || !password) { toast.error("Enter email and password"); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      try { await sendEmailVerification(cred.user); toast.success("Account created — check your email to verify"); } catch { toast.success("Account created"); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Sign-up failed"); }
  }
  async function doSignOut() {
    await fbSignOut(auth);
    setCurrentList(null); setCurrentListId(null); setItems([]); setGroups({}); setScreen("auth");
    const url = new URL(window.location.href); url.searchParams.delete("list"); url.searchParams.delete("role"); window.history.replaceState({}, "", url.toString());
  }

  // ── lists ──
  async function createList() {
    const name = window.prompt("Enter list name:");
    if (!name) return;
    const eventDate = window.prompt("Enter event date (YYYY-MM-DD) — optional:") ?? "";
    const description = window.prompt("Enter description — optional:") ?? "";
    try {
      const ref = await addDoc(collection(db, "lists"), {
        name, description, eventDate: eventDate ? new Date(eventDate).toISOString() : null,
        owner: user!.email, collaborators: [], viewers: [], isPublic: false, ordered: true, collaboratorShareAccess: true,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      toast.success("List created");
      await loadUserLists();
      await loadList(ref.id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Create failed"); }
  }

  // ── items / groups CRUD ──
  function openAddItem() {
    setEditingItem(null);
    setItemForm({ name: "", url: "", description: "", imageUrl: "", position: "", groupId: "", conditional: false, triggerItemId: "" });
    setItemModalOpen(true);
  }
  function openEditItem(it: WisherItem) {
    setEditingItem(it);
    setItemForm({ name: it.name, url: it.url ?? "", description: it.description ?? "", imageUrl: it.imageUrl ?? "", position: String(it.position ?? ""), groupId: it.groupId ?? "", conditional: !!it.conditionalVisibility, triggerItemId: it.triggerItemId ?? "" });
    setItemModalOpen(true);
  }
  async function saveItem() {
    if (!currentListId) return;
    if (!itemForm.name.trim()) { toast.error("Item name is required"); return; }
    const validated = itemForm.url ? validateUrl(itemForm.url) : "";
    if (itemForm.url && !validated) { toast.error("Please enter a valid URL / email"); return; }
    if (itemForm.conditional && !itemForm.triggerItemId) { toast.error("Pick a trigger item"); return; }
    try {
      setSyncing(true);
      const itemsRef = collection(db, "lists", currentListId, "items");
      // resolve position like original: absolute or composite G.I
      let position: number | undefined = undefined;
      if (itemForm.position.trim()) {
        const raw = itemForm.position.trim();
        if (/^\d+$/.test(raw)) position = Math.max(1, parseInt(raw, 10));
        else if (/^\d+\.\d+$/.test(raw)) {
          // composite — place at end for now and let reordering fix it; simplest: append
          const snap = await getDocs(itemsRef);
          position = snap.size + 1;
        } else position = undefined;
      }
      if (editingItem) {
        const payload: Record<string, unknown> = {
          name: itemForm.name.trim(), url: validated, description: itemForm.description.trim(), imageUrl: itemForm.imageUrl.trim() || null,
          groupId: itemForm.groupId || null, conditionalVisibility: itemForm.conditional, triggerItemId: itemForm.conditional ? itemForm.triggerItemId : null,
          updatedAt: serverTimestamp(),
        };
        if (position !== undefined) payload.position = position;
        await updateDoc(doc(db, "lists", currentListId, "items", editingItem.id), payload as never);
        toast.success("Item updated");
      } else {
        const snap = await getDocs(itemsRef);
        const pos = position ?? snap.size + 1;
        await addDoc(itemsRef, {
          name: itemForm.name.trim(), url: validated, description: itemForm.description.trim(), imageUrl: itemForm.imageUrl.trim() || null,
          position: pos, bought: false, groupId: itemForm.groupId || null,
          conditionalVisibility: itemForm.conditional, triggerItemId: itemForm.conditional ? itemForm.triggerItemId : null,
          comments: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        toast.success("Item added");
      }
      setItemModalOpen(false);
      await loadListItems(currentListId);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setSyncing(false); }
  }
  async function deleteItem(id: string, name: string) {
    if (!currentListId || !effectiveCanEdit) { toast.error("Not allowed"); return; }
    if (!window.confirm(`Delete "${name}"?`)) return;
    await deleteDoc(doc(db, "lists", currentListId, "items", id));
    toast.success("Deleted");
    await loadListItems(currentListId);
  }

  function openAddGroup() {
    setEditingGroup(null);
    setGroupForm({ name: "", imageUrl: "", description: "", position: "", conditional: false, triggerItemId: "", autoBuy: false });
    setGroupModalOpen(true);
  }
  function openEditGroup(g: WisherGroup) {
    setEditingGroup(g);
    setGroupForm({ name: g.name, imageUrl: g.imageUrl ?? "", description: g.description ?? "", position: String(g.position ?? ""), conditional: !!g.conditionalVisibility, triggerItemId: g.triggerItemId ?? "", autoBuy: !!g.autoBuy });
    setGroupModalOpen(true);
  }
  async function saveGroup() {
    if (!currentListId) return;
    if (!groupForm.name.trim()) { toast.error("Group name required"); return; }
    if (groupForm.conditional && !groupForm.triggerItemId) { toast.error("Pick a trigger item"); return; }
    try {
      setSyncing(true);
      const col = collection(db, "lists", currentListId, "groups");
      if (editingGroup) {
        await updateDoc(doc(col, editingGroup.id), {
          name: groupForm.name.trim(), imageUrl: groupForm.imageUrl.trim() || null, description: groupForm.description.trim() || null,
          conditionalVisibility: groupForm.conditional, triggerItemId: groupForm.conditional ? groupForm.triggerItemId : null, autoBuy: groupForm.autoBuy, updatedAt: serverTimestamp(),
        } as never);
        toast.success("Group updated");
      } else {
        await addDoc(col, {
          name: groupForm.name.trim(), imageUrl: groupForm.imageUrl.trim() || null, description: groupForm.description.trim() || null,
          conditionalVisibility: groupForm.conditional, triggerItemId: groupForm.conditional ? groupForm.triggerItemId : null, autoBuy: groupForm.autoBuy,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        toast.success("Group added");
      }
      setGroupModalOpen(false);
      await loadListItems(currentListId);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setSyncing(false); }
  }
  async function deleteGroup(id: string, name: string) {
    if (!currentListId) return;
    if (!window.confirm(`Delete group "${name}"? Items will become ungrouped.`)) return;
    const batch = writeBatch(db);
    const itemsSnap = await getDocs(query(collection(db, "lists", currentListId, "items"), where("groupId", "==", id)));
    itemsSnap.forEach((d) => batch.update(d.ref, { groupId: null, updatedAt: serverTimestamp() } as never));
    batch.delete(doc(db, "lists", currentListId, "groups", id));
    await batch.commit();
    toast.success("Group deleted");
    await loadListItems(currentListId);
  }

  // bought
  function openBuy(it: WisherItem) { setBuyItem(it); setBuyerName(user?.displayName ?? user?.email?.split("@")[0] ?? ""); setBuyerEmail(user?.email ?? ""); setBuyerNote(""); }
  async function confirmBuy() {
    if (!buyItem || !currentListId) return;
    if (!buyerName.trim()) { toast.error("Enter your name"); return; }
    try {
      setSyncing(true);
      const itemRef = doc(db, "lists", currentListId, "items", buyItem.id);
      await updateDoc(itemRef, { bought: true, buyerName: buyerName.trim(), buyerEmail: buyerEmail.trim(), buyerNote: buyerNote.trim(), datePurchased: serverTimestamp() } as never);
      // autoBuy groups
      if (buyItem.groupId) {
        const g = groups[buyItem.groupId];
        if (g?.autoBuy) {
          const snap = await getDocs(query(collection(db, "lists", currentListId, "items"), where("groupId", "==", buyItem.groupId), where("bought", "==", false)));
          const batch = writeBatch(db);
          snap.forEach((d) => {
            if (d.id !== buyItem.id) batch.update(d.ref, { bought: true, buyerName: buyerName.trim() + " (auto-buy)", buyerEmail: buyerEmail.trim(), buyerNote: "Auto-bought via group setting", datePurchased: serverTimestamp() } as never);
          });
          await batch.commit();
        }
      }
      toast.success("Marked as bought");
      setBuyItem(null);
      await loadListItems(currentListId);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Buy failed"); } finally { setSyncing(false); }
  }
  async function unmarkBought(it: WisherItem) {
    if (!currentListId) return;
    if (!window.confirm("Unmark as bought? Purchase data will be erased.")) return;
    await updateDoc(doc(db, "lists", currentListId, "items", it.id), { bought: false, buyerName: deleteField(), buyerEmail: deleteField(), buyerNote: deleteField(), datePurchased: deleteField() } as never);
    toast.success("Unmarked");
    await loadListItems(currentListId);
  }
  // firestore deleteField helper (modular: use deleteField import) — lazy to avoid top import cycle
  function deleteField() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { deleteField: df } = require("firebase/firestore") as { deleteField: () => unknown };
    return df() as never;
  }

  // comments
  async function addComment(itemId: string) {
    const text = (commentDrafts[itemId] ?? "").trim();
    if (!text) { toast.error("Enter a comment"); return; }
    if (!user) { toast.error("Sign in to comment"); return; }
    if (!currentListId) return;
    const ref = doc(db, "lists", currentListId, "items", itemId);
    const snap = await getDoc(ref);
    if (!snap.exists()) { toast.error("Item not found"); return; }
    const data = snap.data() as WisherItem;
    const comments = (data.comments ?? []) as Comment[];
    const newComment: Comment = { id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, authorEmail: user.email!, authorName: user.displayName ?? user.email!, timestamp: serverTimestamp() as unknown as Comment["timestamp"] };
    await updateDoc(ref, { comments: [...comments, newComment] } as never);
    setCommentDrafts((m) => ({ ...m, [itemId]: "" }));
    toast.success("Comment added");
    await loadListItems(currentListId);
  }
  async function saveEditedComment(itemId: string, commentId: string, newText: string) {
    if (!currentListId) return;
    const ref = doc(db, "lists", currentListId, "items", itemId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as WisherItem;
    const comments = [...(data.comments ?? [])];
    const idx = comments.findIndex((c) => c.id === commentId);
    if (idx === -1) return;
    if (comments[idx].authorEmail !== user?.email) { toast.error("Only your own comments"); return; }
    comments[idx] = { ...comments[idx], text: newText, editedAt: serverTimestamp() as unknown as Comment["timestamp"] };
    await updateDoc(ref, { comments } as never);
    setEditingComment(null);
    await loadListItems(currentListId);
  }
  async function removeComment(itemId: string, commentId: string) {
    if (!currentListId) return;
    if (!window.confirm("Delete this comment?")) return;
    const ref = doc(db, "lists", currentListId, "items", itemId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as WisherItem;
    const comments = (data.comments ?? []).filter((c) => c.id !== commentId);
    await updateDoc(ref, { comments } as never);
    await loadListItems(currentListId);
  }

  // edit list
  function openEditList() {
    if (!currentList) return;
    setEditListForm({ name: currentList.name, description: currentList.description ?? "", eventDate: formatDateInput(currentList.eventDate), isPublic: !!currentList.isPublic, ordered: currentList.ordered !== false });
    setEditListOpen(true);
  }
  async function saveListEdit() {
    if (!currentListId || !currentList) return;
    if (!editListForm.name.trim()) { toast.error("Name required"); return; }
    await updateDoc(doc(db, "lists", currentListId), { name: editListForm.name.trim(), description: editListForm.description.trim(), eventDate: editListForm.eventDate || null, isPublic: editListForm.isPublic, ordered: editListForm.ordered, updatedAt: serverTimestamp() } as never);
    toast.success("List updated");
    setEditListOpen(false);
    await loadList(currentListId);
    await loadUserLists();
  }
  async function addCollab() {
    const emailToAdd = newCollabEmail.trim();
    if (!emailToAdd || !currentListId) { toast.error("Enter an email"); return; }
    await updateDoc(doc(db, "lists", currentListId), { collaborators: arrayUnion(emailToAdd) } as never);
    setNewCollabEmail("");
    toast.success("Collaborator added");
    await loadList(currentListId);
  }
  async function addViewer() {
    const emailToAdd = newViewerEmail.trim();
    if (!emailToAdd || !currentListId) { toast.error("Enter an email"); return; }
    await updateDoc(doc(db, "lists", currentListId), { viewers: arrayUnion(emailToAdd) } as never);
    setNewViewerEmail("");
    toast.success("Viewer added");
    await loadList(currentListId);
  }
  async function removeCollab(emailToRemove: string) { if (!currentListId) return; await updateDoc(doc(db, "lists", currentListId), { collaborators: arrayRemove(emailToRemove) } as never); toast.success("Removed"); await loadList(currentListId); }
  async function removeViewer(emailToRemove: string) { if (!currentListId) return; await updateDoc(doc(db, "lists", currentListId), { viewers: arrayRemove(emailToRemove) } as never); toast.success("Removed"); await loadList(currentListId); }

  // import
  async function doImport() {
    if (!importFile || !currentListId) { toast.error("Pick a JSON file"); return; }
    try {
      setSyncing(true);
      const text = await importFile.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Expected an array of items");
      const col = collection(db, "lists", currentListId, "items");
      const existing = await getDocs(col);
      let pos = existing.size + 1;
      for (const raw of parsed) {
        const name = (raw.name as string) ?? "Untitled";
        // optional AI: if enabled but no key, skip
        let description = (raw.description as string) ?? "";
        if (importUseAi && importApiKey) {
          try {
            const prompt = `Generate info for item. Example: Item Name: Insta360 X5 / Description: The newest 360 Camera from Insta360. Similar to GoPro, but records all angles. Now generate for: "${name}" — reply as JSON {"name":"...","description":"..."}`;
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${importApiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
            const data = await resp.json() as { candidates?: Array<{ content: { parts: Array<{ text: string }> } }> };
            const txt = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            const m = txt.match(/\{[\s\S]*\}/);
            if (m) { const j = JSON.parse(m[0]) as { name?: string; description?: string }; if (j.name) description = j.description ?? description; }
          } catch {}
        }
        await addDoc(col, { name, description, url: (raw.link as string) ?? "", imageUrl: (raw.imageUrl as string) ?? "", position: pos++, bought: false, comments: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      toast.success(`Imported ${parsed.length} items`);
      setImportOpen(false); setImportFile(null);
      await loadListItems(currentListId);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Import failed"); } finally { setSyncing(false); }
  }

  // save gemini key
  async function saveGeminiKey() {
    if (!currentListId || !isListOwner) { toast.error("Only owner can save"); return; }
    await updateDoc(doc(db, "lists", currentListId), { geminiApiKey: geminiKey, updatedAt: serverTimestamp() } as never);
    setCurrentList((c) => c ? { ...c, geminiApiKey: geminiKey } : c);
    toast.success("API key saved to this list");
    setSettingsOpen(false);
  }

  // multi-select
  function toggleSelect(id: string, e?: React.MouseEvent) {
    const ctrl = !!(e?.ctrlKey || e?.metaKey);
    const shift = !!e?.shiftKey;
    const visibleIds = filteredAndSorted.flatMap((entry) => entry.kind === "group" ? entry.items.map((it) => it.id) : [entry.item.id]);
    if (shift && selectedIds.length) {
      const last = selectedIds[selectedIds.length - 1];
      const a = visibleIds.indexOf(last);
      const b = visibleIds.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [s, e2] = [Math.min(a, b), Math.max(a, b)];
        const range = visibleIds.slice(s, e2 + 1);
        const next = ctrl ? Array.from(new Set([...selectedIds, ...range])) : range;
        setSelectedIds(next);
        return;
      }
    }
    if (ctrl) setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    else setSelectedIds((prev) => prev.length === 1 && prev[0] === id ? [] : [id]);
  }
  async function deleteSelected() {
    if (!selectedIds.length || !currentListId) return;
    if (!effectiveCanEdit) { toast.error("Not allowed"); return; }
    if (!window.confirm(`Delete ${selectedIds.length} selected item(s)?`)) return;
    const batch = writeBatch(db);
    selectedIds.forEach((id) => batch.delete(doc(db, "lists", currentListId, "items", id)));
    await batch.commit();
    setSelectedIds([]);
    toast.success("Deleted");
    await loadListItems(currentListId);
  }
  async function moveSelectedTo() {
    if (!moveTarget.trim() || !selectedIds.length || !currentListId) { toast.error("Enter a position"); return; }
    const raw = moveTarget.trim();
    let targetPos: number;
    if (/^\d+$/.test(raw)) targetPos = parseInt(raw, 10);
    else if (/^\d+\.\d+$/.test(raw)) {
      // composite G.I — map group display number to group
      const [gStr, iStr] = raw.split(".");
      const gNum = parseInt(gStr, 10), iNum = parseInt(iStr, 10);
      const groupEntries = filteredAndSorted.filter((e) => e.kind === "group") as Array<{ kind: "group"; group: WisherGroup; items: WisherItem[]; displayNumber: number }>;
      const targetGroup = groupEntries.find((g) => g.displayNumber === gNum);
      if (!targetGroup) { toast.error("Group not found for composite position"); return; }
      const snap = await getDocs(query(collection(db, "lists", currentListId, "items"), orderBy("position", "asc")));
      const all: WisherItem[] = []; snap.forEach((d) => all.push({ id: d.id, ...(d.data() as Omit<WisherItem, "id">) }));
      const groupIds = new Set(targetGroup.items.map((x) => x.id));
      const others = all.filter((x) => !groupIds.has(x.id));
      // find insertion index inside target group
      targetPos = all.length + 1;
      // simplistic: place at group's position + iNum
      const groupPos = targetGroup.group.position ?? all.length;
      targetPos = Math.min(all.length + 1, (groupPos as number) + iNum);
      const _ = others; // keep for later shape
    } else { toast.error("Use a number like 3 or 2.1"); return; }
    // rebuild order: move selected block to targetPos
    const snap = await getDocs(query(collection(db, "lists", currentListId, "items"), orderBy("position", "asc")));
    const all: WisherItem[] = []; snap.forEach((d) => all.push({ id: d.id, ...(d.data() as Omit<WisherItem, "id">) }));
    const selSet = new Set(selectedIds);
    const selectedOrdered = all.filter((x) => selSet.has(x.id));
    const others2 = all.filter((x) => !selSet.has(x.id));
    const idx = Math.max(0, Math.min(targetPos - 1, others2.length));
    const newOrder = [...others2.slice(0, idx), ...selectedOrdered, ...others2.slice(idx)];
    const batch = writeBatch(db);
    newOrder.forEach((it, i) => batch.update(doc(db, "lists", currentListId, "items", it.id), { position: i + 1, updatedAt: serverTimestamp() } as never));
    await batch.commit();
    setSelectedIds([]); setMoveTarget("");
    toast.success("Moved");
    await loadListItems(currentListId);
  }

  // drag end
  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id || !currentListId) return;
    // only reorder items within the flat filtered list; persist via batch
    const flatIds = filteredAndSorted.flatMap((entry) => entry.kind === "group" ? entry.items.map((it) => it.id) : [entry.item.id]);
    const oldIndex = flatIds.indexOf(String(active.id));
    const newIndex = flatIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(flatIds, oldIndex, newIndex);
    // write positions in background
    setSyncing(true);
    try {
      const snap = await getDocs(query(collection(db, "lists", currentListId, "items"), orderBy("position", "asc")));
      const map = new Map<string, WisherItem>();
      snap.forEach((d) => map.set(d.id, { id: d.id, ...(d.data() as Omit<WisherItem, "id">) }));
      // reordered contains only visible items; for hidden (filtered/bought) keep their relative order at end
      const hiddenIds = Array.from(map.keys()).filter((id) => !flatIds.includes(id));
      const finalOrder = [...reordered, ...hiddenIds];
      const batch = writeBatch(db);
      finalOrder.forEach((id, i) => { const ref = doc(db, "lists", currentListId, "items", id); batch.update(ref, { position: i + 1, updatedAt: serverTimestamp() } as never); });
      await batch.commit();
      toast.success("Order updated");
      await loadListItems(currentListId);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Reorder failed"); } finally { setSyncing(false); }
  }

  // ── computed display (search / filter / sort / groups) ──
  const filteredAndSorted: Array<{ kind: "item"; item: WisherItem; displayNumber: string } | { kind: "group"; group: WisherGroup; items: WisherItem[]; displayNumber: number; displayLabel: string }> = useMemo(() => {
    if (!items.length) return [];
    // filter by purchase status + search
    let filtered = items.filter((it) => {
      if (it.bought && !filterBought && !showBought) return false;
      if (!it.bought && !filterAvailable) return false;
      return true;
    });
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((it) => `${it.name} ${it.description ?? ""}`.toLowerCase().includes(q));
    }
    // conditional visibility for items: hide reliant if trigger not bought (for viewers)
    const canEditNow = currentList ? canEdit(currentList, user?.email) : false;
    filtered = filtered.filter((it) => {
      if (it.conditionalVisibility && it.triggerItemId) {
        const trigger = items.find((x) => x.id === it.triggerItemId);
        const bought = !!(trigger && trigger.bought);
        if (!canEditNow && !bought) return false;
      }
      return true;
    });

    // sort
    let sorted: WisherItem[];
    if (sortBy === "alphabetical") sorted = [...filtered].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    else sorted = [...filtered].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    // group map
    const byGroup: Record<string, WisherItem[]> = {};
    const ungrouped: WisherItem[] = [];
    sorted.forEach((it) => {
      const gid = it.groupId ?? "";
      if (!gid) ungrouped.push(it);
      else { (byGroup[gid] ??= []).push(it); }
    });
    // trigger -> groups
    const triggerToGroups: Record<string, string[]> = {};
    Object.entries(groups).forEach(([gid, g]) => {
      if (g.triggerItemId) (triggerToGroups[g.triggerItemId] ??= []).push(gid);
    });
    function isGroupVisible(g: WisherGroup | undefined): boolean {
      if (!g) return true;
      if (g.conditionalVisibility && g.triggerItemId) {
        const t = items.find((x) => x.id === g.triggerItemId);
        return !!(t && t.bought);
      }
      return true;
    }
    const result: typeof filteredAndSorted = [];
    const renderedGroups = new Set<string>();
    let displayCounter = 1;
    const groupDisplayNumbers: Record<string, number> = {};

    function renderGroup(gid: string) {
      if (renderedGroups.has(gid)) return;
      const g = groups[gid];
      if (!g) return;
      if (!isGroupVisible(g)) return;
      const gItems = byGroup[gid] ?? [];
      // even empty groups get a slot
      const num = displayCounter++;
      groupDisplayNumbers[gid] = num;
      // sort group items by position
      const sortedGItems = [...gItems].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      result.push({ kind: "group", group: g, items: sortedGItems, displayNumber: num, displayLabel: String(num) });
      renderedGroups.add(gid);
    }

    for (const it of ungrouped) {
      // reliant items are handled via ungrouped + conditional already; they appear inline here
      // For simplicity, reliant items are just regular ungrouped items that passed visibility check
      result.push({ kind: "item", item: it, displayNumber: String(displayCounter++) });
      const triggered = triggerToGroups[it.id] ?? [];
      for (const gid of triggered) {
        const g = groups[gid];
        if (!g || !g.conditionalVisibility || isGroupVisible(g)) renderGroup(gid);
      }
    }
    for (const gid of Object.keys(byGroup)) {
      if (renderedGroups.has(gid)) continue;
      const g = groups[gid];
      if (isGroupVisible(g)) renderGroup(gid);
    }
    return result;
  }, [items, groups, search, filterAvailable, filterBought, showBought, sortBy, currentList, user?.email]);

  // ── keyboard shortcuts ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); if (effectiveCanEdit) openAddItem(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); document.getElementById("wisher-search")?.focus(); }
      if (e.key === "Escape") { setHelpOpen(false); setSettingsOpen(false); setShareOpen(false); setItemModalOpen(false); setGroupModalOpen(false); setInfoItem(null); setBuyItem(null); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [effectiveCanEdit]);

  // ── render ──
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* App bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b bg-card/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/60 sm:px-4">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Menu">
          <Menu className="h-5 w-5" />
        </Button>
        <span className="text-lg font-semibold tracking-tight">Wisher</span>
        {syncing && <span className="ml-2 hidden items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground sm:inline-flex"><span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> Syncing</span>}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setHelpOpen(true)} aria-label="Help"><HelpCircle className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" onClick={() => { setGeminiKey(currentList?.geminiApiKey ?? ""); setSettingsOpen(true); }} aria-label="Settings"><Settings className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" onClick={() => { setShareQr(null); setShareOpen(true); }} aria-label="Share"><Share2 className="h-5 w-5" /></Button>
          {user ? (
            <Button variant="ghost" size="icon" onClick={() => setUserModalOpen(true)} aria-label="Account"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{(user.email?.[0] ?? "?").toUpperCase()}</span></Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setScreen("auth")}>Login</Button>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="flex w-[320px] flex-col p-0 sm:max-w-sm">
          <SheetHeader className="border-b p-4 text-left">
            <SheetTitle>Your Lists</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {lists.length === 0 && viewedLists.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No lists yet.</p>
            ) : (
              <div className="space-y-6">
                {lists.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">My Lists</p>
                    <ul className="space-y-1">
                      {lists.map((l) => (
                        <li key={l.id}>
                          <button onClick={() => { setSidebarOpen(false); void loadList(l.id); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-accent ${currentListId === l.id ? "bg-accent font-medium" : ""}`}>
                            <span className="truncate">{l.name}</span><Badge variant="secondary" className="ml-2 shrink-0 text-[10px]">{l.role ?? "owner"}</Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {viewedLists.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recently Viewed</p>
                    <ul className="space-y-1">
                      {viewedLists.map((l) => (
                        <li key={l.id}>
                          <button onClick={() => { setSidebarOpen(false); setShowAsViewer(true); setShowBought(true); void loadList(l.id); }} className="flex w-full items-center justify-between rounded-xl bg-muted px-3 py-2.5 text-left text-sm opacity-90 hover:bg-accent">
                            <span className="truncate">{l.name}</span><Badge variant="outline" className="ml-2 shrink-0 text-[10px]">viewer</Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="border-t p-4">
            <Button className="w-full rounded-full" onClick={() => { setSidebarOpen(false); void createList(); }}><Plus className="h-4 w-4" /> Create New List</Button>
          </div>
        </SheetContent>
      </Sheet>

      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6">
        {/* AUTH */}
        {screen === "auth" && !user && (
          <div className="flex min-h-[60vh] items-center justify-center">
            <Card className="w-full max-w-md shadow-lg">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Welcome to Wisher</CardTitle>
                <CardDescription>Sign in to create and manage your wishlists</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2">
                  <Button onClick={doGoogle} className="w-full rounded-full"><LogOut className="h-4 w-4 rotate-180" /> Sign in with Google</Button>
                  <Button variant="secondary" className="w-full rounded-full" onClick={() => setShowEmailForm((v) => !v)}><Mail className="h-4 w-4" /> Sign in with Email</Button>
                </div>
                {showEmailForm && (
                  <div className="space-y-3 rounded-2xl border bg-muted/30 p-4">
                    <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label htmlFor="password">Password</Label><Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                    <div className="flex gap-2"><Button className="flex-1 rounded-full" onClick={doEmailSignIn}>Sign In</Button><Button variant="ghost" className="flex-1 rounded-full" onClick={doSignUp}>Create Account</Button></div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* LISTS */}
        {screen === "lists" && user && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-semibold tracking-tight">Your Wishlists</h1>
              <Button onClick={createList} className="rounded-full"><Plus className="h-4 w-4" /> Create New List</Button>
            </div>
            {listsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => <Card key={i} className="h-40 animate-pulse bg-muted" />)}
              </div>
            ) : lists.length === 0 && viewedLists.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No lists found. Create your first wishlist!</CardContent></Card>
            ) : (
              <div className="space-y-8">
                {lists.length > 0 && (
                  <div>
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">My Lists</h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {lists.map((l) => (
                        <Card key={l.id} className="cursor-pointer transition hover:shadow-md hover:-translate-y-0.5" onClick={() => void loadList(l.id)}>
                          <CardHeader><CardTitle className="line-clamp-1 text-base">{l.name}</CardTitle><CardDescription className="line-clamp-2">{l.description || "No description"}</CardDescription></CardHeader>
                          <CardContent className="flex items-center justify-between text-xs text-muted-foreground"><Badge variant="secondary" className="capitalize">{l.role}</Badge><span>{formatDate(l.eventDate)}</span></CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
                {viewedLists.length > 0 && (
                  <div>
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recently Viewed</h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {viewedLists.map((l) => (
                        <Card key={l.id} className="cursor-pointer bg-muted/50 transition hover:shadow-md" onClick={() => { setShowAsViewer(true); setShowBought(true); void loadList(l.id); }}>
                          <CardHeader><CardTitle className="line-clamp-1 text-base">{l.name}</CardTitle><CardDescription className="line-clamp-2">{l.description || "No description"}</CardDescription></CardHeader>
                          <CardContent className="flex items-center justify-between text-xs text-muted-foreground"><Badge variant="outline">viewer</Badge><span>{formatDate(l.viewedAt)}</span></CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* WISHLIST */}
        {screen === "wishlist" && currentList && (
          <div>
            <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{currentList.name}</h1>
                <p className="text-sm text-muted-foreground">{currentList.eventDate ? `Event: ${formatDate(currentList.eventDate)}` : ""}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="wisher-search" placeholder="Search items and descriptions…" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-full pl-9 pr-9" />
                    {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-accent"><X className="h-4 w-4" /></button>}
                  </div>
                  <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setFilterOpen(true)}><Filter className="h-4 w-4" /> Filters {(filterBought || !filterAvailable) && <Badge className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">{(filterBought ? 1 : 0) + (!filterAvailable ? 1 : 0)}</Badge>}</Button>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Sort by</Label>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                      <SelectTrigger className="h-9 w-[160px] rounded-full"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="creators">Creator&apos;s Order</SelectItem><SelectItem value="alphabetical">Alphabetical</SelectItem></SelectContent>
                    </Select>
                  </div>
                  {effectiveCanEdit && (
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={showMoveButtons} onCheckedChange={setShowMoveButtons} /> <span className="text-xs">Move buttons</span>
                    </label>
                  )}
                  {canEdit(currentList, user?.email) && (
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={showAsViewer} onCheckedChange={(v) => { setShowAsViewer(v); setShowBought(v); if (currentListId) void loadListItems(currentListId); }} /> <span className="text-xs">Show as viewer</span>
                    </label>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {effectiveCanEdit && <Button onClick={openAddItem} className="rounded-full"><Plus className="h-4 w-4" /> Add Item</Button>}
                {effectiveCanEdit && <Button variant="secondary" onClick={openAddGroup} className="rounded-full"><FolderPlus className="h-4 w-4" /> Add Group</Button>}
                {isListOwner && !showAsViewer && <Button variant="outline" onClick={openEditList} className="rounded-full"><Pencil className="h-4 w-4" /> Manage List</Button>}
                {isListOwner && !showAsViewer && <Button variant="outline" onClick={() => setImportOpen(true)} className="rounded-full"><Upload className="h-4 w-4" /> Import</Button>}
              </div>
            </div>

            {/* selection bar */}
            {selectedIds.length > 0 && (
              <div className="sticky top-16 z-30 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-lg">
                <span className="text-sm font-medium">{selectedIds.length} selected</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" className="rounded-full bg-white text-primary hover:bg-white/90" onClick={() => setSelectedIds([])}>Deselect All</Button>
                  <div className="flex items-center gap-1">
                    <Input placeholder="Position (e.g. 3 or 2.1)" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} className="h-8 w-36 bg-white text-foreground placeholder:text-muted-foreground" onKeyDown={(e) => e.key === "Enter" && void moveSelectedTo()} />
                    <Button variant="secondary" size="sm" className="rounded-full bg-white text-primary hover:bg-white/90" onClick={moveSelectedTo}>Move To</Button>
                  </div>
                  <Button variant="destructive" size="sm" className="rounded-full" onClick={deleteSelected}><Trash2 className="h-4 w-4" /> Delete</Button>
                </div>
              </div>
            )}

            {/* items + groups */}
            {filteredAndSorted.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No items. {effectiveCanEdit ? "Add some to get started!" : "Nothing to show with current filters."}</CardContent></Card>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={filteredAndSorted.flatMap((e) => e.kind === "group" ? e.items.map((it) => it.id) : [e.item.id])} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-4">
                    {filteredAndSorted.map((entry) => {
                      if (entry.kind === "group") {
                        const g = entry.group;
                        const isCollapsed = !!collapsedGroups[g.id];
                        return (
                          <SortableGroup key={`g-${g.id}`} id={entry.items[0]?.id ?? `g-${g.id}`}>
                            <Card className="overflow-hidden">
                              <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => persistCollapsed({ ...collapsedGroups, [g.id]: !isCollapsed })} aria-label="Toggle">
                                  {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                </Button>
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{entry.displayLabel}.</div>
                                {g.imageUrl && <img src={g.imageUrl} alt="" className="h-8 w-8 rounded-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold leading-none">{g.name}</p>
                                  {g.description && <p className="truncate text-xs text-muted-foreground">{g.description}</p>}
                                </div>
                                <Badge variant="secondary" className="shrink-0 gap-1"><Layers className="h-3 w-3" /> {entry.items.length}</Badge>
                                <div className="flex shrink-0 items-center gap-1">
                                  {effectiveCanEdit && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditGroup(g)}><Pencil className="h-4 w-4" /></Button>}
                                  {effectiveCanEdit && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void deleteGroup(g.id, g.name)}><Trash2 className="h-4 w-4" /></Button>}
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toast.info(g.description ? `${g.name}: ${g.description}` : g.name)}><Info className="h-4 w-4" /></Button>
                                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </div>
                              {!isCollapsed && (
                                <div className="flex flex-col gap-3 bg-muted/10 p-3">
                                  {entry.items.length === 0 ? (
                                    <p className="py-2 text-center text-xs text-muted-foreground">Empty group</p>
                                  ) : (
                                    entry.items.map((it, idx) => (
                                      <SortableItem key={it.id} id={it.id}>
                                        <ItemCard
                                          item={it}
                                          position={`${entry.displayLabel}.${idx + 1}`}
                                          canEdit={effectiveCanEdit}
                                          showMoveButtons={showMoveButtons}
                                          isOwner={isListOwner}
                                          currentUserEmail={user?.email ?? null}
                                          selected={selectedIds.includes(it.id)}
                                          onToggleSelect={(e) => toggleSelect(it.id, e)}
                                          onEdit={() => openEditItem(it)}
                                          onDelete={() => void deleteItem(it.id, it.name)}
                                          onInfo={() => setInfoItem(it)}
                                          onBuy={() => openBuy(it)}
                                          onUnmark={() => void unmarkBought(it)}
                                          onMoveTop={async () => {
                                            const snap = await getDocs(query(collection(db, currentListId!, "items"), orderBy("position", "asc")));
                                            const all: WisherItem[] = []; snap.forEach((d) => all.push({ id: d.id, ...(d.data() as Omit<WisherItem, "id">) }));
                                            const others = all.filter((x) => x.id !== it.id);
                                            const newOrder = [it, ...others];
                                            const batch = writeBatch(db);
                                            newOrder.forEach((x, i) => batch.update(doc(db, currentListId!, "items", x.id), { position: i + 1 } as never));
                                            await batch.commit(); await loadListItems(currentListId!);
                                          }}
                                          onMoveBottom={async () => {
                                            const snap = await getDocs(query(collection(db, currentListId!, "items"), orderBy("position", "asc")));
                                            const all: WisherItem[] = []; snap.forEach((d) => all.push({ id: d.id, ...(d.data() as Omit<WisherItem, "id">) }));
                                            const others = all.filter((x) => x.id !== it.id);
                                            const newOrder = [...others, it];
                                            const batch = writeBatch(db);
                                            newOrder.forEach((x, i) => batch.update(doc(db, currentListId!, "items", x.id), { position: i + 1 } as never));
                                            await batch.commit(); await loadListItems(currentListId!);
                                          }}
                                          showAsViewer={showAsViewer}
                                          showBought={showBought}
                                          commentDraft={commentDrafts[it.id] ?? ""}
                                          onCommentDraft={(v) => setCommentDrafts((m) => ({ ...m, [it.id]: v }))}
                                          onAddComment={() => void addComment(it.id)}
                                          onEditComment={(cid, text) => setEditingComment({ itemId: it.id, commentId: cid, text })}
                                          editingComment={editingComment?.itemId === it.id ? editingComment : null}
                                          onSaveEditedComment={(cid, text) => void saveEditedComment(it.id, cid, text)}
                                          onCancelEditComment={() => setEditingComment(null)}
                                          onDeleteComment={(cid) => void removeComment(it.id, cid)}
                                          currentUser={user}
                                        />
                                      </SortableItem>
                                    ))
                                  )}
                                </div>
                              )}
                            </Card>
                          </SortableGroup>
                        );
                      }
                      const it = entry.item;
                      const isReliant = !!(it.conditionalVisibility && it.triggerItemId);
                      const trigger = isReliant ? items.find((x) => x.id === it.triggerItemId) : null;
                      const triggerBought = !!(trigger && trigger.bought);
                      return (
                        <SortableItem key={it.id} id={it.id}>
                          <div className={isReliant ? `ml-6 border-l-2 pl-3 ${triggerBought ? "border-primary/40 bg-primary/5" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"} rounded-xl` : ""}>
                            <ItemCard
                              item={it}
                              position={entry.displayNumber}
                              canEdit={effectiveCanEdit}
                              showMoveButtons={showMoveButtons}
                              isOwner={isListOwner}
                              currentUserEmail={user?.email ?? null}
                              selected={selectedIds.includes(it.id)}
                              onToggleSelect={(e) => toggleSelect(it.id, e)}
                              onEdit={() => openEditItem(it)}
                              onDelete={() => void deleteItem(it.id, it.name)}
                              onInfo={() => setInfoItem(it)}
                              onBuy={() => openBuy(it)}
                              onUnmark={() => void unmarkBought(it)}
                              onMoveTop={async () => {
                                const snap = await getDocs(query(collection(db, currentListId!, "items"), orderBy("position", "asc")));
                                const all: WisherItem[] = []; snap.forEach((d) => all.push({ id: d.id, ...(d.data() as Omit<WisherItem, "id">) }));
                                const others = all.filter((x) => x.id !== it.id);
                                const newOrder = [it, ...others];
                                const batch = writeBatch(db);
                                newOrder.forEach((x, i) => batch.update(doc(db, currentListId!, "items", x.id), { position: i + 1 } as never));
                                await batch.commit(); await loadListItems(currentListId!);
                              }}
                              onMoveBottom={async () => {
                                const snap = await getDocs(query(collection(db, currentListId!, "items"), orderBy("position", "asc")));
                                const all: WisherItem[] = []; snap.forEach((d) => all.push({ id: d.id, ...(d.data() as Omit<WisherItem, "id">) }));
                                const others = all.filter((x) => x.id !== it.id);
                                const newOrder = [...others, it];
                                const batch = writeBatch(db);
                                newOrder.forEach((x, i) => batch.update(doc(db, currentListId!, "items", x.id), { position: i + 1 } as never));
                                await batch.commit(); await loadListItems(currentListId!);
                              }}
                              showAsViewer={showAsViewer}
                              showBought={showBought}
                              commentDraft={commentDrafts[it.id] ?? ""}
                              onCommentDraft={(v) => setCommentDrafts((m) => ({ ...m, [it.id]: v }))}
                              onAddComment={() => void addComment(it.id)}
                              onEditComment={(cid, text) => setEditingComment({ itemId: it.id, commentId: cid, text })}
                              editingComment={editingComment?.itemId === it.id ? editingComment : null}
                              onSaveEditedComment={(cid, text) => void saveEditedComment(it.id, cid, text)}
                              onCancelEditComment={() => setEditingComment(null)}
                              onDeleteComment={(cid) => void removeComment(it.id, cid)}
                              currentUser={user}
                            />
                            {isReliant && <p className="px-4 pb-2 text-xs text-muted-foreground">Only shows when &quot;{trigger?.name ?? "trigger"}&quot; is bought {triggerBought ? "✓" : "— pending"}</p>}
                          </div>
                        </SortableItem>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        )}
      </main>

      {/* Filter dialog */}
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Filters</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="mb-2 text-sm font-medium">Purchase Status</p>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={filterAvailable} onCheckedChange={(v) => setFilterAvailable(!!v)} /> Available</label>
              <label className="mt-2 flex items-center gap-2 text-sm"><Checkbox checked={filterBought} onCheckedChange={(v) => setFilterBought(!!v)} /> Bought</label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setFilterAvailable(true); setFilterBought(false); }}>Clear All</Button>
            <Button onClick={() => setFilterOpen(false)}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>How to Use Wisher</DialogTitle><DialogDescription>Shortcuts: Ctrl+N new item, Ctrl+F search, Esc close modals.</DialogDescription></DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed">
            <div><h4 className="font-semibold">Getting Started</h4><ol className="ml-5 list-decimal space-y-1"><li>Sign in with Google or email</li><li>Create a wishlist</li><li>Add items with links and images</li><li>Share with friends & family</li></ol></div>
            <div><h4 className="font-semibold">Features</h4><ul className="ml-5 list-disc space-y-1"><li>Drag & drop to reorder</li><li>Groups with collapse and auto-buy</li><li>Reliant items that appear when a trigger is bought</li><li>Comments, bought tracking, import from Amazon JSON</li></ul></div>
            <p className="text-xs text-muted-foreground">Share as Viewer (read-only) or Collaborator (can edit). Use Import to bulk-add from the Amazon bookmarklets in /amazon.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Settings</DialogTitle><DialogDescription>Gemini API key is stored per-list and only editable by the owner.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            {!isListOwner && currentList && <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Only the list owner can edit the Gemini API key.</p>}
            <div className="space-y-2"><Label htmlFor="geminiKey">Gemini API Key</Label><Input id="geminiKey" type="password" placeholder="Enter your Gemini API key" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} disabled={!isListOwner} /><p className="text-xs text-muted-foreground">Used to auto-summarize imported items. Leave empty to disable.</p></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setSettingsOpen(false)}>Cancel</Button><Button onClick={saveGeminiKey} disabled={!isListOwner}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share */}
      <Dialog open={shareOpen} onOpenChange={(o) => { setShareOpen(o); if (!o) setShareQr(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Share List</DialogTitle><DialogDescription>{currentList ? currentList.name : "Pick a list to share"}</DialogDescription></DialogHeader>
          {!currentListId ? <p className="py-6 text-center text-sm text-muted-foreground">Open a list first.</p> : (
            <div className="space-y-6">
              {(["viewer", "collaborator"] as const).map((role) => {
                const url = shareUrl(currentListId, role);
                return (
                  <div key={role} className="rounded-2xl border p-4">
                    <h4 className="font-semibold capitalize">Share as {role}</h4>
                    <p className="text-xs text-muted-foreground">{role === "viewer" ? "View-only access" : "Can edit and add items"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" className="rounded-full" onClick={async () => { await navigator.clipboard.writeText(url); toast.success("Link copied"); }}><Copy className="h-4 w-4" /> Copy Link</Button>
                      <Button variant="secondary" size="sm" className="rounded-full" onClick={() => { setShareQrRole(role); setShareQr(url); }}><QrCode className="h-4 w-4" /> QR Code</Button>
                      <Button variant="secondary" size="sm" className="rounded-full" onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent(`Wishlist: ${currentList?.name ?? ""}`)}&body=${encodeURIComponent(url)}`; }}><Mail className="h-4 w-4" /> Email</Button>
                      <Button variant="secondary" size="sm" className="rounded-full" onClick={async () => {
                        if (navigator.share) { try { await navigator.share({ title: currentList?.name ?? "Wishlist", text: `Check out this wishlist — ${role}`, url }); } catch {} } else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
                      }}><Link2 className="h-4 w-4" /> Other</Button>
                    </div>
                  </div>
                );
              })}
              {shareQr && (
                <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">QR — {shareQrRole}</p>
                  <div className="rounded-xl bg-white p-4"><QRCodeCanvas value={shareQr} size={180} /></div>
                  <p className="break-all text-center font-mono text-xs text-muted-foreground">{shareQr}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* User profile */}
      <Dialog open={userModalOpen} onOpenChange={setUserModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>User Profile</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2 text-sm"><p><span className="font-medium">Email:</span> {user?.email}</p><p className="break-all"><span className="font-medium">UID:</span> {user?.uid}</p></div>
          <DialogFooter><Button variant="destructive" className="rounded-full" onClick={() => { setUserModalOpen(false); void doSignOut(); }}><LogOut className="h-4 w-4" /> Logout</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info */}
      <Dialog open={!!infoItem} onOpenChange={(o) => !o && setInfoItem(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{infoItem?.name}</DialogTitle></DialogHeader>
          {infoItem && (
            <div className="space-y-4">
              {infoItem.imageUrl && <img src={infoItem.imageUrl} alt={infoItem.name} className="max-h-72 w-full rounded-2xl object-contain" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
              {infoItem.description && <p className="text-sm text-muted-foreground">{infoItem.description}</p>}
              {infoItem.url && <Button asChild className="w-full rounded-full"><a href={infoItem.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Visit Website</a></Button>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Buy */}
      <Dialog open={!!buyItem} onOpenChange={(o) => !o && setBuyItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Purchase</DialogTitle><DialogDescription>Mark &quot;{buyItem?.name}&quot; as bought</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Your Name *</Label><Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Jane" /></div>
            <div className="space-y-1.5"><Label>Email (optional)</Label><Input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="you@example.com" /></div>
            <div className="space-y-1.5"><Label>Note (optional)</Label><Textarea value={buyerNote} onChange={(e) => setBuyerNote(e.target.value)} rows={3} placeholder="Add a note for the list owner" /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setBuyItem(null)}>Cancel</Button><Button onClick={confirmBuy}>Confirm Purchase</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit List */}
      <Dialog open={editListOpen} onOpenChange={setEditListOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit List</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>List Name *</Label><Input value={editListForm.name} onChange={(e) => setEditListForm((s) => ({ ...s, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={editListForm.description} onChange={(e) => setEditListForm((s) => ({ ...s, description: e.target.value }))} rows={3} /></div>
            <div className="space-y-1.5"><Label>Event Date</Label><Input type="date" value={editListForm.eventDate} onChange={(e) => setEditListForm((s) => ({ ...s, eventDate: e.target.value }))} /></div>
            <div className="flex items-center justify-between rounded-xl border p-3"><Label>Public (anyone with link)</Label><Switch checked={editListForm.isPublic} onCheckedChange={(v) => setEditListForm((s) => ({ ...s, isPublic: v }))} /></div>
            <div className="flex items-center justify-between rounded-xl border p-3"><Label>Show numbers (ordered)</Label><Switch checked={editListForm.ordered} onCheckedChange={(v) => setEditListForm((s) => ({ ...s, ordered: v }))} /></div>
            <Separator />
            <div>
              <p className="mb-2 text-sm font-medium">Collaborators</p>
              <div className="mb-2 flex flex-wrap gap-1">
                {(Array.isArray(currentList?.collaborators) ? currentList!.collaborators : currentList?.collaborators ? Object.values(currentList.collaborators as unknown as Record<string, string>) : []).map((em) => (
                  <Badge key={em} variant="secondary" className="gap-1 pr-1">{em}<button onClick={() => void removeCollab(em)} className="ml-1 rounded-full p-0.5 hover:bg-black/10"><X className="h-3 w-3" /></button></Badge>
                ))}
              </div>
              <div className="flex gap-2"><Input placeholder="Enter email address" value={newCollabEmail} onChange={(e) => setNewCollabEmail(e.target.value)} /><Button variant="secondary" onClick={addCollab}><Plus className="h-4 w-4" /> Add</Button></div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Viewers</p>
              <div className="mb-2 flex flex-wrap gap-1">
                {(Array.isArray(currentList?.viewers) ? (currentList!.viewers as string[]) : currentList?.viewers ? Object.values(currentList.viewers as unknown as Record<string, string>) : []).map((em) => (
                  <Badge key={em} variant="outline" className="gap-1 pr-1">{em}<button onClick={() => void removeViewer(em)} className="ml-1 rounded-full p-0.5 hover:bg-black/10"><X className="h-3 w-3" /></button></Badge>
                ))}
              </div>
              <div className="flex gap-2"><Input placeholder="Enter email address" value={newViewerEmail} onChange={(e) => setNewViewerEmail(e.target.value)} /><Button variant="secondary" onClick={addViewer}><Plus className="h-4 w-4" /> Add</Button></div>
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setEditListOpen(false)}>Cancel</Button><Button onClick={saveListEdit}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Item */}
      <Dialog open={itemModalOpen} onOpenChange={setItemModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editingItem ? "Edit Item" : "Add Item"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Item Name *</Label><Input value={itemForm.name} onChange={(e) => setItemForm((s) => ({ ...s, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>URL / Email</Label><Input value={itemForm.url} onChange={(e) => setItemForm((s) => ({ ...s, url: e.target.value }))} placeholder="https://… or you@example.com" /><p className="text-xs text-muted-foreground">Supports websites, email, 20+ protocols.</p></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={itemForm.description} onChange={(e) => setItemForm((s) => ({ ...s, description: e.target.value }))} rows={3} /></div>
            <div className="space-y-1.5"><Label>Image URL</Label><Input value={itemForm.imageUrl} onChange={(e) => setItemForm((s) => ({ ...s, imageUrl: e.target.value }))} placeholder="https://…" /></div>
            <div className="space-y-1.5"><Label>Position (e.g. 3.1 or 7)</Label><Input value={itemForm.position} onChange={(e) => setItemForm((s) => ({ ...s, position: e.target.value }))} placeholder="Leave empty to append at end" /></div>
            <div className="space-y-1.5"><Label>Group (optional)</Label>
              <Select value={itemForm.groupId || "__none"} onValueChange={(v) => setItemForm((s) => ({ ...s, groupId: v === "__none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="No Group" /></SelectTrigger>
                <SelectContent><SelectItem value="__none">No Group</SelectItem>{Object.values(groups).map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 rounded-xl border p-3 text-sm"><Checkbox checked={itemForm.conditional} onCheckedChange={(v) => setItemForm((s) => ({ ...s, conditional: !!v }))} /> Reliant — only show when another item is bought</label>
            {itemForm.conditional && (
              <div className="space-y-1.5"><Label>Show when this item is bought</Label>
                <Select value={itemForm.triggerItemId || "__none"} onValueChange={(v) => setItemForm((s) => ({ ...s, triggerItemId: v === "__none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select an item…" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">Select an item…</SelectItem>{items.map((it) => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setItemModalOpen(false)}>Cancel</Button><Button onClick={saveItem}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Group */}
      <Dialog open={groupModalOpen} onOpenChange={setGroupModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editingGroup ? "Edit Group" : "Add Group"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Group Name *</Label><Input value={groupForm.name} onChange={(e) => setGroupForm((s) => ({ ...s, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Image URL (optional)</Label><Input value={groupForm.imageUrl} onChange={(e) => setGroupForm((s) => ({ ...s, imageUrl: e.target.value }))} placeholder="https://…" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={groupForm.description} onChange={(e) => setGroupForm((s) => ({ ...s, description: e.target.value }))} rows={3} /></div>
            <div className="space-y-1.5"><Label>Position (e.g. 3 or 2.1)</Label><Input value={groupForm.position} onChange={(e) => setGroupForm((s) => ({ ...s, position: e.target.value }))} placeholder="Leave empty to append" /></div>
            <label className="flex items-center gap-2 rounded-xl border p-3 text-sm"><Checkbox checked={groupForm.conditional} onCheckedChange={(v) => setGroupForm((s) => ({ ...s, conditional: !!v }))} /> Only show when a specific item is bought</label>
            {groupForm.conditional && (
              <div className="space-y-1.5"><Label>Trigger item</Label>
                <Select value={groupForm.triggerItemId || "__none"} onValueChange={(v) => setGroupForm((s) => ({ ...s, triggerItemId: v === "__none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select an item…" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">Select an item…</SelectItem>{items.map((it) => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <label className="flex items-center gap-2 rounded-xl border p-3 text-sm"><Checkbox checked={groupForm.autoBuy} onCheckedChange={(v) => setGroupForm((s) => ({ ...s, autoBuy: !!v }))} /> Mark entire group as bought when any item is purchased</label>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setGroupModalOpen(false)}>Cancel</Button><Button onClick={saveGroup}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Import List</DialogTitle><DialogDescription>Drop a JSON file exported from the Amazon bookmarklets (amazon/*.js). Each entry needs name/link/imageUrl/description.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <Input type="file" accept="application/json" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={importUseAi} onCheckedChange={(v) => setImportUseAi(!!v)} /> Use AI summarization for imported items</label>
            {importUseAi && <div className="space-y-1.5"><Label>Gemini API Key</Label><Input type="password" value={importApiKey} onChange={(e) => setImportApiKey(e.target.value)} placeholder={geminiKey ? "Using list key — override here" : "Enter Gemini API key"} /></div>}
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button><Button onClick={doImport} disabled={!importFile}>Import</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───────────────── item card ─────────────────
function ItemCard({
  item, position, canEdit, showMoveButtons, isOwner, currentUserEmail, selected, onToggleSelect, onEdit, onDelete, onInfo, onBuy, onUnmark, onMoveTop, onMoveBottom, showAsViewer, showBought, commentDraft, onCommentDraft, onAddComment, onEditComment, editingComment, onSaveEditedComment, onCancelEditComment, onDeleteComment, currentUser,
}: {
  item: WisherItem; position: string; canEdit: boolean; showMoveButtons: boolean; isOwner: boolean; currentUserEmail: string | null; selected: boolean;
  onToggleSelect: (e: React.MouseEvent) => void; onEdit: () => void; onDelete: () => void; onInfo: () => void; onBuy: () => void; onUnmark: () => void;
  onMoveTop: () => void; onMoveBottom: () => void; showAsViewer: boolean; showBought: boolean;
  commentDraft: string; onCommentDraft: (v: string) => void; onAddComment: () => void;
  onEditComment: (id: string, text: string) => void; editingComment: { commentId: string; text: string } | null;
  onSaveEditedComment: (id: string, text: string) => void; onCancelEditComment: () => void; onDeleteComment: (id: string) => void;
  currentUser: ReturnType<typeof useAuth>["user"];
}) {
  const [showComments, setShowComments] = useState(false);
  const isBought = !!item.bought;
  const showBoughtInfo = isBought && showBought;
  const canShowComments = showAsViewer || showBought;
  const hasComments = !!(item.comments && item.comments.length > 0);
  const canAddComments = !!currentUser;
  // auto-show comments if not empty
  useEffect(() => { if (hasComments && canShowComments) setShowComments(true); }, [hasComments, canShowComments]);

  return (
    <Card className={`overflow-hidden transition ${isBought ? "opacity-70" : ""} ${selected ? "ring-2 ring-primary" : ""}`}>
      <div className="flex gap-3 p-4">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <button
            onClick={onToggleSelect}
            className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition ${selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 hover:border-primary"}`}
            aria-label="Select"
          >
            {selected && <span className="text-xs">✓</span>}
          </button>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{position}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-semibold leading-tight sm:text-base">{item.name}</h3>
            <div className="flex shrink-0 flex-wrap items-center gap-1">
              {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>}
              {canShowComments && canAddComments && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowComments((v) => !v)} aria-label="Comment"><MessageCircle className="h-4 w-4" /></Button>}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onInfo} aria-label="Info"><Info className="h-4 w-4" /></Button>
              {item.url && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(item.url!, "_blank")} aria-label="Open link"><ExternalLink className="h-4 w-4" /></Button>}
              {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toast.info("AI summarization needs a Gemini key in Settings — then use Import with AI enabled.")} aria-label="AI"><Sparkles className="h-4 w-4" /></Button>}
              {!isBought ? (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBuy} aria-label="Mark bought"><ShoppingCart className="h-4 w-4" /></Button>
              ) : (
                currentUserEmail && item.buyerEmail === currentUserEmail && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onUnmark} aria-label="Unmark"><Eye className="h-4 w-4" /></Button>
              )}
              {canEdit && showMoveButtons && <><Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveTop} aria-label="Move top"><ChevronUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveBottom} aria-label="Move bottom"><ChevronDown className="h-4 w-4" /></Button></>}
              {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>}
            </div>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-[80px_1fr] sm:items-start">
            {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="h-20 w-20 rounded-xl object-cover max-sm:h-40 max-sm:w-full" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
            <div className="min-w-0">
              {item.description && <p className="line-clamp-3 text-sm text-muted-foreground">{item.description}</p>}
              {isBought && item.buyerName && <p className="mt-1 text-xs text-muted-foreground">Bought by: {item.buyerName}</p>}
            </div>
          </div>
          {showBoughtInfo && (
            <div className="mt-3 rounded-xl bg-primary/10 p-3 text-sm">
              <p className="font-medium">Purchase Information</p>
              <p><span className="text-muted-foreground">Buyer:</span> {item.buyerName ?? "Unknown"}</p>
              {item.buyerEmail && <p><span className="text-muted-foreground">Contact:</span> <a href={`mailto:${item.buyerEmail}`} className="underline">{item.buyerEmail}</a></p>}
              {item.buyerNote && <p><span className="text-muted-foreground">Note:</span> {item.buyerNote}</p>}
              {item.datePurchased && <p><span className="text-muted-foreground">Date:</span> {formatDate(item.datePurchased)}</p>}
              {isOwner && !showAsViewer && <Button variant="secondary" size="sm" className="mt-2 rounded-full" onClick={onUnmark}>Mark as Not Bought</Button>}
            </div>
          )}
          {canShowComments && (
            <div className={`mt-3 border-t pt-3 ${!hasComments && !showComments ? "hidden" : ""}`}>
              {hasComments && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comments</p>
                  <div className="space-y-2">
                    {[...(item.comments ?? [])].filter((c) => c && c.text).sort((a, b) => {
                      const ta = a.timestamp ? ((a.timestamp as unknown as { toDate?: () => Date })?.toDate?.() ?? new Date(a.timestamp as unknown as string)).getTime() : 0;
                      const tb = b.timestamp ? ((b.timestamp as unknown as { toDate?: () => Date })?.toDate?.() ?? new Date(b.timestamp as unknown as string)).getTime() : 0;
                      return tb - ta;
                    }).map((c) => {
                      const isOwn = currentUser?.email === c.authorEmail;
                      const isEditing = editingComment?.commentId === c.id;
                      return (
                        <div key={c.id} className="rounded-xl bg-muted/50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium">{c.authorName} {c.authorEmail && c.authorName !== c.authorEmail && <span className="font-normal text-muted-foreground">({c.authorEmail})</span>}</p>
                            {isOwn && !isEditing && (
                              <span className="flex gap-1">
                                <button onClick={() => onEditComment(c.id, c.text)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Edit"><Pencil className="h-3 w-3" /></button>
                                <button onClick={() => onDeleteComment(c.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete"><Trash2 className="h-3 w-3" /></button>
                              </span>
                            )}
                          </div>
                          {isEditing ? (
                            <div className="mt-2 space-y-2">
                              <Textarea value={editingComment.text} onChange={(e) => onEditComment(c.id, e.target.value)} rows={2} />
                              <div className="flex gap-2"><Button size="sm" className="rounded-full" onClick={() => onSaveEditedComment(c.id, editingComment.text)}>Save</Button><Button size="sm" variant="ghost" className="rounded-full" onClick={onCancelEditComment}>Cancel</Button></div>
                            </div>
                          ) : (
                            <p className="mt-1 whitespace-pre-wrap text-sm">{c.text}</p>
                          )}
                          {c.timestamp && <p className="mt-1 text-xs text-muted-foreground">{formatDate(c.timestamp)}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {canAddComments && showComments && (
                <div className="mt-3 flex gap-2">
                  <Textarea placeholder="Add a comment…" value={commentDraft} onChange={(e) => onCommentDraft(e.target.value)} rows={2} className="min-h-[56px]" />
                  <Button size="sm" className="shrink-0 self-end rounded-full" onClick={onAddComment}><MessageCircle className="h-4 w-4" /> Add</Button>
                </div>
              )}
              {!hasComments && canShowComments && !showComments && canAddComments && (
                <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setShowComments(true)}><MessageCircle className="h-4 w-4" /> Add Comment</Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
