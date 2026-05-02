# Notification System Design

## Stage 1

### REST API Endpoints

**Get all notifications**
- Method: GET
- URL: /api/notifications
- Headers: Authorization: Bearer token
- Response:
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "Placement",
      "message": "TCS is hiring",
      "isRead": false,
      "timestamp": "2026-04-22T17:51:30"
    }
  ]
}
```

**Mark notification as read**
- Method: PATCH
- URL: /api/notifications/:id/read
- Headers: Authorization: Bearer token
- Response: `{ "message": "Marked as read" }`

**Delete notification**
- Method: DELETE
- URL: /api/notifications/:id
- Headers: Authorization: Bearer token
- Response: `{ "message": "Deleted" }`

**Send notification (Admin)**
- Method: POST
- URL: /api/notifications
- Body: `{ "studentIds": ["uuid1"], "type": "Placement", "message": "TCS hiring" }`
- Response: `{ "message": "Sent successfully" }`

**Get unread count**
- Method: GET
- URL: /api/notifications/unread/count
- Response: `{ "unreadCount": 5 }`

### Real-time Mechanism
Use WebSockets (Socket.io) to push notifications instantly to students without page refresh.

---

## Stage 2

### Database: PostgreSQL

**Why?**
- Structured data with clear relationships
- Great for complex queries
- ACID compliant - no data loss

### Schema

```sql
CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

### Problems as data grows
- Queries slow down without indexes
- 50,000 students = millions of notification rows
- Unread count becomes expensive full table scan

### Solution
- Add indexes on student_id, type, timestamp
- Paginate results (load 20 at a time)
- Archive old notifications

### Queries

```sql
-- Get all notifications for a student
SELECT * FROM notifications
WHERE student_id = $1
ORDER BY timestamp DESC
LIMIT 20;

-- Get unread count
SELECT COUNT(*) FROM notifications
WHERE student_id = $1 AND is_read = FALSE;

-- Mark as read
UPDATE notifications
SET is_read = TRUE
WHERE id = $1;
```

---

## Stage 3

### Slow Query Fix

```sql
-- Add these indexes
CREATE INDEX idx_student_id ON notifications(student_id);
CREATE INDEX idx_type ON notifications(notification_type);
CREATE INDEX idx_timestamp ON notifications(timestamp);
CREATE INDEX idx_is_read ON notifications(is_read);
```

**Should we add indexes on every column?**
No. Indexes speed up reads but slow down writes. A notification system does many inserts, so too many indexes will hurt write performance. Only index columns used in WHERE or ORDER BY.

**Optimized query to find students who got Placement notification in last 7 days:**

```sql
SELECT DISTINCT n.student_id, n.message, n.type, n.timestamp
FROM notifications n
WHERE n.notification_type = 'Placement'
AND n.timestamp > NOW() - INTERVAL '7 days'
AND n.is_read = FALSE
ORDER BY n.timestamp DESC
LIMIT 50;
```

---

## Stage 4

### Problem
DB gets overwhelmed when notifications are fetched on every page load.

### Solutions

**1. Redis Caching**
- Cache notifications per student for 60 seconds
- On page load check Redis first, only hit DB if cache is empty
- Tradeoff: notifications may be delayed by up to 60 seconds

**2. Pagination**
- Load only 10-20 notifications at a time
- Tradeoff: more API calls but each is fast

**3. WebSocket Push**
- Don't fetch on page load
- Push new notifications in real-time
- On first load fetch only last 10 from DB
- Tradeoff: requires persistent connection

**Best approach: combine all three**
- First load → top 10 from DB, cache in Redis
- New notifications → pushed via WebSocket
- Scroll → paginated API calls

---

## Stage 5

### Problem with original code
function notify_all(student_ids, message):
for student_id in student_ids:
send_email(student_id, message)
save_to_db(student_id, message)
push_to_app(student_id, message)

**Problems:**
- Sequential - 50,000 students one by one = very slow
- If email fails at student 200, rest get nothing
- 50,000 separate DB inserts = DB overload
- Blocks the server

### Fixed Pseudocode
function notify_all(student_ids, message):
1. Bulk insert all to DB at once (fast, one query)
bulk_insert_to_db(student_ids, message)
2. Push to app in batches (non-blocking)
for each batch of 1000 in student_ids:
async push_to_app(batch, message)
3. Add emails to queue (dont send directly)
add_to_email_queue(student_ids, message)
Separate email worker with retry
function email_worker():
while queue not empty:
student = queue.pop()
try:
send_email(student, message)
catch error:
retry_queue.push(student)

**Should DB save and email send happen together?**
No. DB insert is fast and must happen first to record the notification. Email sending is slow and failure-prone. Use a job queue (like Redis Queue) so email failures don't affect DB saves.

---

## Stage 6

Priority Inbox implementation is in the `notification_app_be/` folder.

**Approach:**
- Fetch notifications from the API
- Score each notification based on type weight + recency
- Placement = 3 points, Result = 2 points, Event = 1 point
- Newer notifications ranked higher within same type
- Return top 10 by score