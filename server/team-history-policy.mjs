// SQL already restricts blind history to the authenticated actor. Older own events
// may embed query-result IDs/provenance from other coders; never resend that payload.
export function visibleHistoryEvents(events,access){
 if(!access.blind)return events;
 return events.map(event=>({...event,detail:JSON.stringify({blindCoding:true,note:'Operation details are withheld during independent coding. Reviewers retain the complete audit.'})}));
}
