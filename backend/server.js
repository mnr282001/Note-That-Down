const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Get all notes for a user
app.get('/notes/:userId', async (req, res) => {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create a new note
app.post('/notes', async (req, res) => {
  const { user_id, content } = req.body;
  const { data, error } = await supabase
    .from('notes')
    .insert([{ user_id, content }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// Generate standup message
app.post('/generate-standup', async (req, res) => {
  const { notes } = req.body;
  
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that creates concise standup messages from daily notes. Format the message in a clear way with: What was done, What's planned, and Any blockers."
        },
        {
          role: "user",
          content: `Create a standup message from these notes: ${notes.map(note => note.content).join('\n')}`
        }
      ],
    });

    const summary = completion.choices[0].message.content;

    // Save the summary to the database
    const today = new Date().toISOString().split('T')[0];
    const { data: existingSummary } = await supabase
      .from('summaries')
      .select('*')
      .eq('summary_date', today)
      .single();

    if (existingSummary) {
      // Update existing summary
      const { error } = await supabase
        .from('summaries')
        .update({ content: summary })
        .eq('summary_date', today);

      if (error) throw error;
    } else {
      // Create new summary
      const { error } = await supabase
        .from('summaries')
        .insert([{ summary_date: today, content: summary }]);

      if (error) throw error;
    }

    res.json({ message: summary });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get summary for a specific date
app.get('/summaries/:date', async (req, res) => {
  const { date } = req.params;
  const { data, error } = await supabase
    .from('summaries')
    .select('*')
    .eq('summary_date', date)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
