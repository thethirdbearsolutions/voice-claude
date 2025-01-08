import { DurableObject } from "cloudflare:workers";

export class VoiceClaudeConversation extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.KEY = env.ANTHROPIC_API_KEY;
    this.MODEL = env.CLAUDE_MODEL;
  }

  async speak(message) {
    const conversation = (await this.ctx.storage.get('conversation')) || [];

    conversation.push({
      role: "user",
      content: [{
        type: "text",
        text: message,
      }]
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': this.KEY,
      },
      body: JSON.stringify({
        system: `You are a helpful assistant. The user is speaking to you over the phone, and their speech is being transcribed for you. Your reply will then be converted back to audio for the user to hear and respond to. So keep your replies a natural length for a phone conversation. Do not focus on text details, correct typos, write very long responses, spell things out, or do other things that don't make sense over the phone or would be annoying to listen to.`,
        model: this.MODEL,
        max_tokens: 500,
        temperature: 1,
        messages: conversation,
      }),
    });

    const claudeResponse = await response.json();
    
    const responseText = claudeResponse.content[0].text;

    conversation.push({
      role: "assistant",
      content: [{
        type: "text",
        text: responseText,
      }]
    });

    await this.ctx.storage.put('conversation', conversation);
    return responseText;
  }
}

export default {
  async fetch(request, env, ctx) {        
    const url = new URL(request.url);
    const { pathname, hostname } = url;

    function generateTwiML(say) {
      return `<?xml version="1.0" encoding="UTF-8"?>
                    <Response> 
                       <Say voice="${env.TWILIO_VOICE}">${say}</Say> 
                       <Gather input="speech" action="https://${hostname}/talking" method="POST" speechTimeout="auto">
                       </Gather>
                    </Response>`;
    }
    
    if (pathname === '/talking') {            
      const formData = await request.formData();
      const speechResult = formData.get('SpeechResult');
      const callSid = formData.get('CallSid');

      let id = env.CONVERSATION.idFromName(callSid);
      let stub = env.CONVERSATION.get(id);

      let reply = await stub.speak(speechResult);
      
      const twiml = new Response(generateTwiML(reply), {
        headers: {
          'Content-Type': 'application/xml',
        },
      });
      return twiml;            
    } else {        
      const twiml = new Response(generateTwiML('Hello, this is Claude speaking!'), {
        headers: {
          'Content-Type': 'application/xml',
        },
      });
      return twiml;
    }
  },
};
