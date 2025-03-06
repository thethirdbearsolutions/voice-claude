import { DurableObject } from "cloudflare:workers";
import { tools } from './tools';

export class VoiceClaudeConversation extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.KEY = env.ANTHROPIC_API_KEY;
    this.MODEL = env.CLAUDE_MODEL;
  }

  async store_conversation_key (input) {
    await this.ctx.storage.put('conversation_key', input);
  }

  async retrieve_conversation_key () {
    return (await this.ctx.storage.get('conversation_key')) || null;
  }

  async retrieve_transcript () {
    return (await this.ctx.storage.get('conversation')) || [];
  }

  async set_recallable_conversations (recallable_conversations) {
    await this.ctx.storage.put('recallable_conversations', recallable_conversations);
  }

  async get_recallable_conversations () {
    return (await this.ctx.storage.get('recallable_conversations')) || [];
  }  
  
  async speak (message, tool_result) {
    const conversation = (await this.ctx.storage.get('conversation')) || [];

    conversation.push({
      role: "user",
      content: tool_result || [{
        type: "text",
        text: message,
      }]
    });

    const recallable_conversations = await this.get_recallable_conversations();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': this.KEY,
      },
      body: JSON.stringify({
        system: [{
          type: 'text',
          text: `You are a helpful assistant. The user is speaking to you over the phone, and their speech is being transcribed for you. Your reply will then be converted back to audio for the user to hear and respond to. So keep your replies a natural length for a phone conversation. Do not focus on text details, correct typos, write very long responses, spell things out, or do other things that don't make sense over the phone or would be annoying to listen to.`,
          cache_control: {
            type: 'ephemeral',
          },
        }],
        tools: tools(recallable_conversations),
        model: this.MODEL,
        max_tokens: 500,
        temperature: 1,
        messages: (() => {
          // First pass: find indices of last two user messages
          const userIndices = [];
          conversation.forEach((msg, index) => {
            if (msg.role === "user") {
              userIndices.push(index);
            }
          });
          
          // Get the last two user message indices
          const lastTwoUserIndices = new Set(userIndices.slice(-2));

          // Second pass: process messages
          return conversation.map((message, index) => {
            let m = JSON.parse(JSON.stringify(message));

            // Add cache control if this is one of the last two user messages
            if (lastTwoUserIndices.has(index) && m.content && m.content[0]) {
              m.content[0].cache_control = {"type": "ephemeral"};
            }
            
            return m;
          });
        })(),
      }),
    });

    const claudeResponse = await response.json();

    conversation.push({
      role: "assistant",
      content: claudeResponse.content
    });

    await this.ctx.storage.put('conversation', conversation);

    return claudeResponse;
  }
}

export default {
  async fetch(request, env, ctx) {        
    const url = new URL(request.url);
    const { pathname, hostname } = url;

    const actUponResponse = async (reply, stub) => {
      const twiml = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<Response>`,
      ];

      for (let content of reply.content) {
        if (content.text) {
          twiml.push(`<Say voice="${env.TWILIO_VOICE}">${content.text}</Say>`);
        }
        if (content.type === 'tool_use') {
          const { name, input } = content;
          if (name === 'hang_up') {
            twiml.push(`<Hangup />`);
          } else if (name === 'store_conversation') {
            await stub.store_conversation_key(input);
            const extra_reply = await stub.speak(null, [{
              type: 'tool_result',
              tool_use_id: content.id,
              content: 'Stored!',
            }]);
            twiml.push(`<Say voice="${env.TWILIO_VOICE}">${extra_reply.content[0].text}</Say>`);
          } else if (name === 'recall_conversation') {
            const { transcript } = await env.DB.prepare(`
                          SELECT transcript FROM conversations
                          WHERE recall_key = ?
            `).bind(input.key).first();
            const extra_reply = await stub.speak(null, [{
              type: 'tool_result',
              tool_use_id: content.id,
              content: JSON.stringify(transcript),
            }]);
            twiml.push(`<Say voice="${env.TWILIO_VOICE}">${extra_reply.content[0].text}</Say>`);
          }
        }
      }
      
      /* Always make sure to gather more input from the user next;
         if there's a <Hangup/> already in the twiml we'll never
         get to this command, so we don't need any special-casing */
      twiml.push(`<Gather input="speech" action="https://${hostname}/talking" method="POST" speechTimeout="auto"></Gather>`);
      twiml.push(`</Response>`);
      return twiml.join('\n');
    }

    const formData = await request.formData();
    const callSid = formData.get('CallSid');
    const id = env.CONVERSATION.idFromName(callSid);
    const stub = env.CONVERSATION.get(id);
    
    if (pathname === '/talking') {            
      const speechResult = formData.get('SpeechResult');

      const reply = await stub.speak(speechResult);
      const twiml = await actUponResponse(reply, stub);
      return new Response(twiml, {
        headers: {
          'Content-Type': 'application/xml',
        },
      });
    } else if (pathname === '/') {

      const { results: recallable_conversations } = await env.DB.prepare(`
         SELECT
          recall_key, description, timestamp
         FROM conversations
      `).all();

      await stub.set_recallable_conversations(recallable_conversations);
      const twiml = await actUponResponse({ content: [{
        text: 'Hello, this is Claude speaking!',
      }]}, stub);
      return new Response(twiml, {
        headers: {
          'Content-Type': 'application/xml',
        },
      });
    } else if (pathname === '/status_callback') {
      const recall_key = await stub.retrieve_conversation_key();

      if (recall_key) {
        const conversation = await stub.retrieve_transcript();
        await env.DB.prepare(`
          INSERT INTO conversations (
            recall_key, transcript, description, timestamp
          ) VALUES (
            ?1, ?2, ?3, ?4
          ) 
        `).bind(
          recall_key.key, 
          JSON.stringify(conversation), 
          recall_key.summary, 
          (new Date()).toISOString(),
         ).run();
      }
      return new Response('ok');
    }
  },
};
