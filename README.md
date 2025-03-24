This is [Voice Claude](https://thirdbear.substack.com/p/building-voice-claude)!

[More setup info here](https://thirdbear.substack.com/p/building-voice-claude-in-seven-minutes), but basically:

* You'll need accounts with Anthropic, Twilio, and Cloudflare. 

* This project uses Durable Objects so you'll need a paid Cloudflare plan.

Get an Anthropic API key and a Twilio phone number. Then:

```
# Clone the repo & install dependencies
git clone https://github.com/thethirdbearsolutions/voice-claude
cd voice-claude
npm install

# Deploy to Cloudflare -- log in with browser when prompted
npx wrangler deploy

# Copy your workers.dev URL from the output of the above command
# In the Twilio admin console, find your new phone number and add 
# two URLs to the Voice Configuration:
# * A call comes in: https://your-subdomain.workers.dev
# * Call status changes: https://your-subdomain.workers.dev/status_callback

# Set up your API key 
# Paste in your key from Anthropic when prompted
npx wrangler secret put ANTHROPIC_API_KEY

# Get a database, then paste the output into wrangler.toml
npx wrangler d1 create voice-claude

# Then set up the schema
npx wrangler d1 migrations apply --remote voice-claude
```

Now call Claude and enjoy!

If you don't want to deal with all that, you can also [visit DialYour.AI](https://dialyour.ai/).
