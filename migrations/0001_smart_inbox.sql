-- Additive Smart Inbox migration. Apply explicitly, once, after backing up D1.
-- Never run from request handlers. Existing messages, tokens and bookings remain.
ALTER TABLE messages ADD COLUMN conversation_id INTEGER;
ALTER TABLE messages ADD COLUMN received_at INTEGER;
ALTER TABLE messages ADD COLUMN attachments_json TEXT;
ALTER TABLE messages ADD COLUMN inbox_counted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN inbox_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifs ADD COLUMN inbox_event_id TEXT;
CREATE UNIQUE INDEX idx_notif_inbox_event ON notifs(inbox_event_id) WHERE inbox_event_id IS NOT NULL;

CREATE TABLE inbox_conversations (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  instagram_account_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  customer_username TEXT,
  customer_avatar TEXT,
  profile_checked_at INTEGER,
  state TEXT NOT NULL DEFAULT 'AI_ACTIVE' CHECK(state IN ('AI_ACTIVE','HUMAN_ACTIVE','CLOSED')),
  reopen_state TEXT NOT NULL DEFAULT 'AI_ACTIVE' CHECK(reopen_state IN ('AI_ACTIVE','HUMAN_ACTIVE')),
  assigned_user_id INTEGER REFERENCES users(id),
  needs_attention INTEGER NOT NULL DEFAULT 0 CHECK(needs_attention IN (0,1)),
  unread_count INTEGER NOT NULL DEFAULT 0 CHECK(unread_count >= 0),
  last_read_id INTEGER NOT NULL DEFAULT 0,
  last_customer_message_at INTEGER,
  last_activity_at INTEGER NOT NULL,
  last_preview TEXT NOT NULL DEFAULT '',
  unrecognized_count INTEGER NOT NULL DEFAULT 0,
  handoff_offered INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  ai_job_mid TEXT,
  ai_job_token TEXT,
  ai_job_started INTEGER,
  active_send_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(store_id,instagram_account_id,customer_id),
  UNIQUE(id,store_id)
);
CREATE INDEX idx_inbox_store_activity ON inbox_conversations(store_id,last_activity_at DESC,id DESC);
CREATE INDEX idx_inbox_waiting ON inbox_conversations(store_id,state,needs_attention);
CREATE INDEX idx_inbox_messages ON messages(conversation_id,id);
CREATE INDEX idx_inbox_pending ON messages(conversation_id,status,id);

CREATE TABLE inbox_outbox (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL,
  conversation_id INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  source_mid TEXT,
  author_type TEXT NOT NULL CHECK(author_type IN ('HUMAN','AI','SYSTEM','EXTERNAL')),
  author_user_id INTEGER REFERENCES users(id),
  text TEXT NOT NULL,
  attachments_json TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENDING','SENT','FAILED','UNKNOWN','CANCELLED')),
  meta_message_id TEXT,
  use_human_agent INTEGER NOT NULL DEFAULT 0,
  responding_to_id INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  attempted_at INTEGER,
  sent_at INTEGER,
  error_code TEXT,
  error_text TEXT,
  error_retriable INTEGER NOT NULL DEFAULT 0,
  retry_of TEXT UNIQUE REFERENCES inbox_outbox(id),
  UNIQUE(store_id,idempotency_key),
  UNIQUE(store_id,meta_message_id),
  FOREIGN KEY(conversation_id,store_id) REFERENCES inbox_conversations(id,store_id)
);
CREATE INDEX idx_inbox_outbox_thread ON inbox_outbox(conversation_id,created_at,id);
CREATE INDEX idx_inbox_outbox_source ON inbox_outbox(store_id,source_mid);

CREATE TABLE inbox_transfers (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL,
  conversation_id INTEGER NOT NULL,
  request_key TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  actor_user_id INTEGER REFERENCES users(id),
  reason TEXT NOT NULL,
  source_mid TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(store_id,request_key),
  FOREIGN KEY(conversation_id,store_id) REFERENCES inbox_conversations(id,store_id)
);
CREATE INDEX idx_inbox_transfers_thread ON inbox_transfers(conversation_id,created_at);

-- Keep available legacy history. Old rows lack a verified Meta event timestamp:
-- do NOT open a messaging window from a migration or from an outbound echo.
INSERT INTO inbox_conversations(store_id,instagram_account_id,customer_id,last_activity_at,last_preview,created_at,updated_at)
SELECT m.store_id,COALESCE(s.ig_user_id,''),m.sender,
       MAX(COALESCE(unixepoch(m.created)*1000,0)),'',
       MIN(COALESCE(unixepoch(m.created)*1000,0)),MAX(COALESCE(unixepoch(m.created)*1000,0))
FROM messages m JOIN stores s ON s.id=m.store_id
WHERE m.sender IS NOT NULL AND m.sender<>''
GROUP BY m.store_id,COALESCE(s.ig_user_id,''),m.sender;
UPDATE messages SET conversation_id=(
 SELECT c.id FROM inbox_conversations c JOIN stores s ON s.id=c.store_id
 WHERE c.store_id=messages.store_id AND c.customer_id=messages.sender AND c.instagram_account_id=COALESCE(s.ig_user_id,'')
),inbox_counted=1;
UPDATE inbox_conversations SET last_preview=COALESCE((
 SELECT COALESCE(NULLIF(m.reply,''),m.text,'') FROM messages m
 WHERE m.conversation_id=inbox_conversations.id ORDER BY m.id DESC LIMIT 1
),'');
