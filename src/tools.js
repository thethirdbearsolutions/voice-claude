const tools = (recallable_conversations) => {
  const _tools = [{
    name: 'hang_up',
    description: 'Hang up the phone when you want to end the conversation',
    input_schema: {
      type: "object",
      properties: {},
    }
  }, {
    name: 'store_conversation',
    description: `Save this conversation’s transcript so that you and the user can both remember it, read it later, and resume it another time. If the user requests a saved transcript or asks to come back to this conversation another time, you should store the conversation. (You can also store the conversation without a direct request from the user if it makes sense to do so.) If they specifically mentioned how they want to refer back to the conversation, use that as the key. Otherwise, invent your own key based on the conversation so far.`,
     input_schema: {
       type: "object",
       properties: {
	 key: {
           type: "string",
           description: "The unique slug to index this conversation under, which is easy to both read and speak out loud",
         },
         summary: {
           type: "string",
           description: "A brief summary of the conversation so far, no more than two sentences.",
         },
       },
       required: ["key"],
     }
  }];
  
  if (recallable_conversations.length) {
    _tools.push({
      name: 'recall_conversation',
      description: `Recall the full transcript of a past conversation, identified by a specific recall key. You should recall a conversation if the user asks you to do so explicitly. You may also choose to recall a conversation without a direct request from the user, if it seems like it would be useful or relevant to the conversation. Here is the full set of possible recallable conversations: ${JSON.stringify(recallable_conversations)}`,
      input_schema: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: `The slug of the past conversation that the user wants you to recall, which must be selected from the following list: ${JSON.stringify(recallable_conversations.map(c => c.recall_key))}`
          },
        },
        required: ["key"],
      },
    });
  }
  
  return _tools;
}

export { tools };
