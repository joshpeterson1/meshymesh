import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Send, Hash, User, Check, CheckCheck, Clock, AlertCircle, RotateCw, Search, X } from "lucide-react";
import { useNodeStore } from "@/stores/nodeStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { sendTextMessage } from "@/lib/tauri";
import type { MeshMessage, MeshChannel, MessageReaction } from "@/stores/types";

const BROADCAST = 0xffffffff;

const REACTION_EMOJIS = [
  { char: "\u{1F44D}", label: "Thumbs Up" },
  { char: "\u{2764}\u{FE0F}", label: "Heart" },
  { char: "\u{1F602}", label: "Laugh" },
  { char: "\u{1F62E}", label: "Wow" },
  { char: "\u{1F622}", label: "Sad" },
  { char: "\u{1F389}", label: "Party" },
] as const;

interface EmojiPickerState {
  msgId: string;
  msgFrom: number;
  msgChannel: number;
  x: number;
  y: number;
}

function groupReactions(
  reactions: MessageReaction[],
  getNodeName: (num: number) => string,
): { emoji: string; count: number; senders: string }[] {
  const map = new Map<string, number[]>();
  for (const r of reactions) {
    const list = map.get(r.emoji) ?? [];
    list.push(r.from);
    map.set(r.emoji, list);
  }
  return Array.from(map.entries()).map(([emoji, froms]) => ({
    emoji,
    count: froms.length,
    senders: froms.map(getNodeName).join(", "),
  }));
}

// "channel:0" for channel index 0, "dm:12345" for DM with node 12345
type ConversationTarget =
  | { type: "channel"; index: number }
  | { type: "dm"; nodeNum: number };

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function AckIcon({ status }: { status: MeshMessage["ackStatus"] }) {
  switch (status) {
    case "acked":
      return <span title="Acknowledged by destination"><CheckCheck size={12} className="text-mesh-green" /></span>;
    case "implicit":
      return <span title="Received by a relay node"><Check size={12} className="text-blue-400" /></span>;
    case "pending":
      return <span title="Awaiting acknowledgment"><Clock size={12} className="text-zinc-500" /></span>;
    case "max_retransmit":
      return <span title="Max retransmissions reached"><RotateCw size={12} className="text-yellow-400" /></span>;
    case "failed":
      return <span title="Delivery failed"><AlertCircle size={12} className="text-red-400" /></span>;
    default:
      return null;
  }
}

function targetKey(t: ConversationTarget): string {
  return t.type === "channel" ? `ch:${t.index}` : `dm:${t.nodeNum}`;
}

export function ConversationsView() {
  const selectedId = useUIStore((s) => s.selectedConnectionId);
  const connections = useNodeStore((s) => s.connections);
  const connectionOrder = useNodeStore((s) => s.connectionOrder);
  const addMessage = useNodeStore((s) => s.addMessage);
  const addReaction = useNodeStore((s) => s.addReaction);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [target, setTarget] = useState<ConversationTarget>({
    type: "channel",
    index: 0,
  });
  const [emojiPicker, setEmojiPicker] = useState<EmojiPickerState | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Close emoji picker when clicking outside
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target as Node)
      ) {
        setEmojiPicker(null);
      }
    },
    [],
  );

  useEffect(() => {
    if (emojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [emojiPicker, handleClickOutside]);

  const isUnified = selectedId === null;
  let allMessages: (MeshMessage & { connectionLabel?: string })[] = [];
  let meshNodes: Record<number, { shortName: string; longName: string }> = {};
  let myNodeNum: number | undefined;
  let channels: MeshChannel[] = [];

  if (isUnified) {
    connectionOrder.forEach((cid) => {
      const c = connections[cid];
      if (!c) return;
      c.messages.forEach((m) =>
        allMessages.push({ ...m, connectionLabel: c.label }),
      );
      Object.values(c.meshNodes).forEach((n) => {
        meshNodes[n.num] = {
          shortName: n.user.shortName,
          longName: n.user.longName,
        };
      });
    });
    allMessages.sort((a, b) => a.timestamp - b.timestamp);
  } else {
    const conn = connections[selectedId];
    if (conn) {
      allMessages = [...conn.messages];
      myNodeNum = conn.myNodeNum;
      channels = conn.channels.filter((c) => c.role !== "disabled");
      Object.values(conn.meshNodes).forEach((n) => {
        meshNodes[n.num] = {
          shortName: n.user.shortName,
          longName: n.user.longName,
        };
      });
    }
  }

  // Filter messages by selected target
  const targetFiltered = allMessages.filter((msg) => {
    if (isUnified) return true;
    if (target.type === "channel") {
      // Channel messages: broadcast messages on this channel index
      return msg.to === BROADCAST && msg.channel === target.index;
    }
    // DM messages: to/from this specific node
    return (
      (msg.from === target.nodeNum && msg.to === myNodeNum) ||
      (msg.from === myNodeNum && msg.to === target.nodeNum)
    );
  });

  // Apply search filter
  const searchLower = searchQuery.toLowerCase().trim();
  const messages = searchLower
    ? targetFiltered.filter((msg) => {
        if (msg.text.toLowerCase().includes(searchLower)) return true;
        const sender = meshNodes[msg.from];
        if (sender?.shortName.toLowerCase().includes(searchLower)) return true;
        if (sender?.longName.toLowerCase().includes(searchLower)) return true;
        return false;
      })
    : targetFiltered;

  // Build DM contacts: nodes we've exchanged non-broadcast messages with
  const dmContacts = new Map<number, string>();
  if (!isUnified) {
    allMessages.forEach((msg) => {
      if (msg.to !== BROADCAST) {
        const otherNum = msg.from === myNodeNum ? msg.to : msg.from;
        if (otherNum !== myNodeNum && !dmContacts.has(otherNum)) {
          dmContacts.set(
            otherNum,
            meshNodes[otherNum]?.shortName ?? `!${otherNum.toString(16)}`,
          );
        }
      }
    });
    // Also add all known nodes as potential DM targets
    Object.entries(meshNodes).forEach(([num, node]) => {
      const n = Number(num);
      if (n !== myNodeNum && !dmContacts.has(n)) {
        dmContacts.set(n, node.shortName);
      }
    });
  }

  const getNodeName = (num: number) =>
    meshNodes[num]?.shortName ?? `!${num.toString(16)}`;

  function handleSend() {
    const text = messageInput.trim();
    if (!text || isUnified || !selectedId) return;

    const conn = connections[selectedId];
    if (!conn?.myNodeNum) return;

    const now = Math.floor(Date.now() / 1000);
    const msgId = `local-${now}-${Math.random().toString(36).slice(2, 8)}`;

    const destination =
      target.type === "dm" ? target.nodeNum : BROADCAST;
    const channelIndex = target.type === "channel" ? target.index : 0;

    const msg: MeshMessage = {
      id: msgId,
      from: conn.myNodeNum,
      to: destination,
      channel: channelIndex,
      text,
      timestamp: now,
      ackStatus: "pending",
    };
    addMessage(selectedId, msg);
    setMessageInput("");

    sendTextMessage(selectedId, msgId, text, destination, channelIndex, true)
      .catch((e) => {
        toast.error("Failed to send message", { description: String(e) });
        useNodeStore.getState().updateMessageAck(selectedId!, msgId, "failed");
      });
  }

  function handleReaction(emoji: string) {
    if (!emojiPicker || isUnified || !selectedId) return;

    const conn = connections[selectedId];
    if (!conn?.myNodeNum) return;

    const { msgId, msgFrom, msgChannel } = emojiPicker;
    setEmojiPicker(null);

    const replyId = parseInt(msgId);
    if (isNaN(replyId)) {
      toast.error("Cannot react to this message", {
        description: "Invalid message ID",
      });
      return;
    }

    const emojiCodepoint = emoji.codePointAt(0);
    if (emojiCodepoint === undefined) return;

    const now = Math.floor(Date.now() / 1000);
    const localId = `local-${now}-${Math.random().toString(36).slice(2, 8)}`;

    // Optimistically show the reaction on the target message
    addReaction(selectedId, msgId, emoji, conn.myNodeNum);

    sendTextMessage(
      selectedId,
      localId,
      emoji,
      msgFrom,
      msgChannel,
      true,
      replyId,
      emojiCodepoint,
    )
      .then(() => {
        toast.success(`Reacted with ${emoji}`);
      })
      .catch((e) => {
        toast.error("Failed to send reaction", { description: String(e) });
        useNodeStore.getState().updateMessageAck(selectedId!, localId, "failed");
      });
  }

  function handleMessageContextMenu(
    e: React.MouseEvent,
    msg: MeshMessage,
  ) {
    // Only allow reactions on other nodes' messages, with a selected connection
    if (isUnified || !selectedId || msg.from === myNodeNum) return;
    e.preventDefault();
    setEmojiPicker({
      msgId: msg.id,
      msgFrom: msg.from,
      msgChannel: msg.channel,
      x: e.clientX,
      y: e.clientY,
    });
  }

  const activeKey = targetKey(target);

  return (
    <div className="flex h-full">
      {/* Channel / DM list */}
      <div className="w-[190px] border-r border-zinc-800 flex flex-col overflow-y-auto pt-1">
        <div className="px-4 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
          Channels
        </div>
        {channels.length > 0 ? (
          channels.map((ch) => {
            const key = `ch:${ch.index}`;
            const isActive = activeKey === key;
            return (
              <button
                key={key}
                onClick={() =>
                  setTarget({ type: "channel", index: ch.index })
                }
                className={cn(
                  "flex items-center gap-2.5 px-3 py-1.5 text-sm mx-3 rounded transition-colors",
                  isActive
                    ? "bg-zinc-800/50 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30",
                )}
              >
                <Hash size={14} className="shrink-0" />
                {ch.name || `Channel ${ch.index}`}
              </button>
            );
          })
        ) : (
          <div className="px-4 py-1.5 text-xs text-zinc-600 italic">
            {isUnified ? "All channels" : "No channels yet"}
          </div>
        )}

        {dmContacts.size > 0 && (
          <>
            <div className="px-4 py-2 mt-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Direct Messages
            </div>
            {Array.from(dmContacts.entries()).map(([num, name]) => {
              const key = `dm:${num}`;
              const isActive = activeKey === key;
              return (
                <button
                  key={key}
                  onClick={() => setTarget({ type: "dm", nodeNum: num })}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-1.5 text-sm mx-3 rounded transition-colors",
                    isActive
                      ? "bg-zinc-800/50 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30",
                  )}
                >
                  <User size={14} className="shrink-0" />
                  {name}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Message thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search bar */}
        <div className="px-5 py-2 border-b border-zinc-800">
          <div className="flex items-center gap-2 bg-zinc-800/60 rounded px-3 py-1.5">
            <Search size={13} className="text-zinc-500 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages..."
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-500 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {searchLower && (
            <div className="text-[10px] text-zinc-500 mt-1 px-1">
              {messages.length} result{messages.length !== 1 ? "s" : ""}
              {" "}for &ldquo;{searchQuery}&rdquo;
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
              {isUnified
                ? "Messages from all connections will appear here"
                : "No messages yet"}
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.from === myNodeNum;
            const isDM = msg.to !== BROADCAST;
            const senderName = getNodeName(msg.from);

            return (
              <div
                key={msg.id}
                className="group"
                onContextMenu={(e) => handleMessageContextMenu(e, msg)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5",
                      isMe
                        ? "bg-mesh-green/20 text-mesh-green"
                        : "bg-zinc-800 text-zinc-300",
                    )}
                  >
                    {senderName.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "text-[13px] font-semibold",
                          isMe ? "text-mesh-green" : "text-zinc-200",
                        )}
                      >
                        {senderName}
                      </span>
                      {isDM && (
                        <span className="text-[10px] text-purple-400 font-medium">
                          DM to {getNodeName(msg.to)}
                        </span>
                      )}
                      {isUnified && msg.connectionLabel && (
                        <span className="text-[10px] text-zinc-600">
                          via {msg.connectionLabel}
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-600">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-end gap-1.5 mt-0.5">
                      <p className="text-[13px] text-zinc-300 leading-relaxed">
                        {msg.text}
                      </p>
                      <AckIcon status={msg.ackStatus} />
                    </div>
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {groupReactions(msg.reactions, getNodeName).map(({ emoji, count, senders }) => (
                          <span
                            key={emoji}
                            title={senders}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700/50 text-xs cursor-default"
                          >
                            {emoji}
                            {count > 1 && (
                              <span className="text-[10px] text-zinc-400">{count}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.rxSnr != null && (
                      <div className="text-[10px] text-zinc-600 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        SNR: {msg.rxSnr} dB &middot; RSSI: {msg.rxRssi} dBm
                        {msg.hopStart != null &&
                          msg.hopLimit != null &&
                          ` · ${msg.hopStart - msg.hopLimit} hops`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Message input */}
        <div className="px-5 py-3 border-t border-zinc-800">
          <div className="flex items-center gap-2.5 bg-zinc-800/80 rounded-lg px-4 py-2.5">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder={
                isUnified
                  ? "Select a node to send messages"
                  : target.type === "dm"
                    ? `Message ${getNodeName(target.nodeNum)}...`
                    : "Type a message..."
              }
              disabled={isUnified}
              className="flex-1 bg-transparent text-[13px] text-zinc-100 placeholder:text-zinc-500 outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && messageInput.trim()) {
                  handleSend();
                }
              }}
            />
            <button
              onClick={handleSend}
              disabled={isUnified || !messageInput.trim()}
              className="text-zinc-400 hover:text-mesh-green disabled:opacity-30 transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Emoji reaction picker popup */}
      {emojiPicker && (
        <div
          ref={emojiPickerRef}
          className="fixed z-50 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 shadow-xl"
          style={{
            left: emojiPicker.x,
            top: emojiPicker.y - 44,
          }}
        >
          {REACTION_EMOJIS.map(({ char, label }) => (
            <button
              key={label}
              title={label}
              onClick={() => handleReaction(char)}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700 transition-colors text-lg"
            >
              {char}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
