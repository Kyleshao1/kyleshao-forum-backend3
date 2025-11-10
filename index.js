require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use("/api", router);
app.use(cors({
  origin: ["https://kyleshao-forum.netlify.app"],
  credentials: true
}));

app.use(bodyParser.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'adminsecret';
const BACKEND_URL = process.env.BACKEND_URL || ('http://localhost:' + (process.env.PORT||4000));

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Utility: update vitality according to rules and log changes
async function changeVita(userId, delta, reason='system') {
  if (!userId) return;
  const { data } = await sb.from('profiles').select('vitality').eq('id', userId).single();
  if (!data) return;
  // admins have infinite vitality represented by null
  if (data.vitality === null) return;
  let v = (data.vitality || 0) + delta;
  if (v < 0) v = 0;
  if (v > 1000000) v = 1000000;
  await sb.from('profiles').update({ vitality: v, last_activity: new Date().toISOString() }).eq('id', userId);
  await sb.from('vitality_logs').insert([{ profile_id: userId, change: delta, reason }]);
}

// Update actor last_activity
async function touchActivity(userId) {
  if (!userId) return;
  await sb.from('profiles').update({ last_activity: new Date().toISOString() }).eq('id', userId);
}

// Create profile post-signup (simplified public endpoint)
app.post('/api/profile/init', async (req,res) => {
  const { id, username, display_name } = req.body;
  if (!id || !username) return res.status(400).json({ error:'missing' });
  // create if not exists
  await sb.from('profiles').upsert([{ id, username, display_name, vitality:0 }], { onConflict: 'id' });
  // count profiles to detect first user
  const { count } = await sb.from('profiles').select('*', { count: 'exact' });
  if (count === 1) {
    await sb.from('profiles').update({ is_super_admin: true, is_admin: true, vitality: null }).eq('id', id);
  }
  res.json({ ok:true });
});

// Create post
app.post('/api/posts', async (req,res) => {
  const { author, title, content } = req.body;
  if (!author || !title) return res.status(400).json({ error:'missing' });
  const id = uuidv4();
  await sb.from('posts').insert([{ id, author, title, content }]);
  await changeVita(author, 2, 'post_created');
  res.json({ id });
});

// List posts (simple)
app.get('/api/posts', async (req,res) => {
  const { data, error } = await sb.from('posts').select('*, profiles:author(id,username,display_name)').order('created_at', { ascending:false });
  res.json({ data, error });
});

// Reply
app.post('/api/replies', async (req,res) => {
  const { author, post_id, content } = req.body;
  if (!author || !post_id) return res.status(400).json({ error:'missing' });
  const id = uuidv4();
  await sb.from('replies').insert([{ id, post_id, author, content }]);
  await changeVita(author, 1, 'reply_created');
  res.json({ id });
});

// React (like/dislike/useful)
app.post('/api/react', async (req,res) => {
  const { author, target_type, target_id, kind } = req.body;
  if (!author || !target_type || !target_id || !kind) return res.status(400).json({ error:'missing' });
  await sb.from('reactions').insert([{ target_type, target_id, author, kind }]);
  // adjust vitality for target owner
  let owner = null;
  if (target_type === 'post') {
    const q = await sb.from('posts').select('author').eq('id', target_id).single();
    owner = q.data;
  } else {
    const q = await sb.from('replies').select('author').eq('id', target_id).single();
    owner = q.data;
  }
  if (owner && owner.author) {
    if (kind === 'like') await changeVita(owner.author, 2, 'received_like');
    if (kind === 'dislike') await changeVita(owner.author, -2, 'received_dislike');
    if (kind === 'useful') await changeVita(owner.author, 5, 'received_useful');
  }
  // touch actor activity
  await touchActivity(author);
  res.json({ ok:true });
});

// Follow / unfollow
app.post('/api/follow', async (req,res) => {
  const { follower, followee, action } = req.body; // action: follow/unfollow
  if (!follower || !followee || !action) return res.status(400).json({ error:'missing' });
  if (action === 'follow') {
    await sb.from('follows').insert([{ follower, followee }]).maybeSingle();
    await changeVita(followee, 5, 'followed');
  } else {
    await sb.from('follows').delete().eq('follower', follower).eq('followee', followee);
    await changeVita(followee, -5, 'unfollowed');
  }
  await touchActivity(follower);
  res.json({ ok:true });
});

// Follow lists
app.get('/api/follow/list', async (req,res) => {
  const { id, type } = req.query; // type: followers or following
  if (!id || !type) return res.status(400).json({ error:'missing' });
  if (type === 'followers') {
    const { data } = await sb.from('follows').select('follower, profiles: follower (id, username, display_name)').eq('followee', id);
    return res.json({ data });
  } else {
    const { data } = await sb.from('follows').select('followee, profiles: followee (id, username, display_name)').eq('follower', id);
    return res.json({ data });
  }
});

// Simple profile fetch
app.get('/api/profile/:id', async (req,res) => {
  const id = req.params.id;
  const { data, error } = await sb.from('profiles').select('*').eq('id', id).single();
  res.json({ data, error });
});

// Tickets
app.post('/api/tickets', async (req,res) => {
  const { author, title, body } = req.body;
  const { data } = await sb.from('tickets').insert([{ author, title, body }]);
  await touchActivity(author);
  res.json({ data });
});

app.get('/api/tickets', async (req,res) => {
  const { author } = req.query;
  if (author) {
    const { data } = await sb.from('tickets').select('*').eq('author', author).order('created_at', { ascending:false });
    return res.json({ data });
  } else {
    const { data } = await sb.from('tickets').select('*').order('created_at', { ascending:false });
    return res.json({ data });
  }
});

// Admin actions (protected by ADMIN_SECRET header or super_admin flag)
app.post('/api/admin/action', async (req,res) => {
  const secret = req.headers['x-admin-secret'];
  const { actor_id, action, target_id, notes } = req.body;
  let allowed = false;
  if (secret === ADMIN_SECRET) allowed = true;
  else {
    const { data } = await sb.from('profiles').select('is_admin,is_super_admin').eq('id', actor_id).single();
    if (data && data.is_admin) allowed = true;
  }
  if (!allowed) return res.status(403).json({ error:'forbidden' });

  if (action === 'delete_post') {
    await sb.from('posts').delete().eq('id', target_id);
  } else if (action === 'delete_reply') {
    await sb.from('replies').delete().eq('id', target_id);
  } else if (action === 'ban_user') {
    await sb.from('profiles').update({ is_admin: false }).eq('id', target_id);
    await sb.from('profiles').update({ vitality: null }).eq('id', target_id);
  } else if (action === 'warn_user') {
    // insert admin_report
  }

  await sb.from('admin_reports').insert([{ admin_id: actor_id, action, target_id, notes }]);
  res.json({ ok:true });
});

// Weekly decay endpoint (to be called by Render cronjob)
app.get('/api/admin/run-weekly-decay', async (req,res) => {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (secret !== ADMIN_SECRET) {
    // check caller IP / or require admin header - for safety require secret
    return res.status(403).json({ error: 'forbidden' });
  }
  // find users whose last_activity is older than 7 days and vitality > 0 and not null
  const q = await sb.from('profiles').select('id, vitality, last_activity').lt('last_activity', new Date(Date.now() - 7*24*3600*1000).toISOString()).not('vitality', 'is', None);
  const users = q.data || [];
  let changed = 0;
  for (const u of users) {
    if (typeof u.vitality === 'number' && u.vitality > 0) {
      await changeVita(u.id, -1, 'weekly_decay');
      changed++;
    }
  }
  res.json({ ok:true, affected: changed });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log('Backend listening on', PORT, 'backend_url=', BACKEND_URL));
