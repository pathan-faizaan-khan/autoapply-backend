import * as dotenv from 'dotenv';
dotenv.config();

async function testGroq() {
  const fullBody = `Hi Faizaan,\nThank you for your application to AutoApply. We were very impressed by your background and would love to move forward with your candidacy!\n\nWe would like to schedule a 30-minute introductory interview with you next Tuesday at 3:00 PM EST.\n\nPlease let us know if this time works for you. If so, you can join the call using this Google Meet link: meet.google.com/abc-defg-hij`;

  const prompt = `You are an HR email analyzer. Analyze this HR email reply and determine if it is a positive possibility (scheduling an interview, next steps, selected) or negative (rejection, not selected).

Email: "${fullBody}"

You MUST respond in strict JSON format exactly like this example:
{
  "sentiment": "positive" or "negative",
  "dateTime": "ISO 8601 string if an interview date is proposed, else null",
  "platform": "Google Meet, Zoom, Teams, or Other if positive, else null",
  "link": "meeting link if present, else null"
}`;

  console.log("Sending prompt to Groq...");
  
  try {
    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { 
            role: 'system', 
            content: `You are an HR email analyzer. You must respond in strict JSON format.

JSON Schema to follow:
{
  "sentiment": "positive" or "negative",
  "dateTime": "ISO 8601 string if an interview date is proposed, else null",
  "platform": "Google Meet, Zoom, Teams, or Other if positive, else null",
  "link": "meeting link if present, else null"
}` 
          },
          { 
            role: 'user', 
            content: `Analyze this HR email reply and determine if it is a positive possibility (scheduling an interview, next steps, selected) or negative (rejection, not selected).\n\nEmail: "${fullBody}"` 
          }
        ]
      })
    });

    const aiData = await aiResponse.json();
    console.log("Full Groq Response:", JSON.stringify(aiData, null, 2));
    
    const resultText = aiData.choices?.[0]?.message?.content || '{}';
    console.log(`[Webhook] Raw AI Output:\n${resultText}\n`);
    
    const cleanText = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();
    console.log(`[Webhook] Cleaned AI Output:\n${cleanText}\n`);
    const result = JSON.parse(cleanText);

    let sentiment = (result.sentiment || result.Sentiment || 'negative').toLowerCase();
    if (sentiment !== 'positive') sentiment = 'negative'; // Strict binary

    console.log(`[Webhook] Final Parsed Sentiment: ${sentiment}`);
    console.log(`[Webhook] Parsed Date/Time: ${result.dateTime || result.DateTime}`);
    console.log(`[Webhook] Parsed Platform: ${result.platform || result.Platform}`);
    console.log(`[Webhook] Parsed Link: ${result.link || result.Link}`);

  } catch (e) {
    console.error("Error calling Groq API:", e);
  }
}

testGroq();
