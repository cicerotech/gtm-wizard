var P=Object.defineProperty;var M=Object.getOwnPropertyDescriptor;var $=Object.getOwnPropertyNames;var F=Object.prototype.hasOwnProperty;var _=(u,t)=>{for(var e in t)P(u,e,{get:t[e],enumerable:!0})},L=(u,t,e,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let s of $(t))!F.call(u,s)&&s!==e&&P(u,s,{get:()=>t[s],enumerable:!(n=M(t,s))||n.enumerable});return u};var O=u=>L(P({},"__esModule",{value:!0}),u);var z={};_(z,{default:()=>x});module.exports=O(z);var o=require("obsidian");var f=class{constructor(){this.mediaRecorder=null;this.audioChunks=[];this.stream=null;this.startTime=0;this.pausedDuration=0;this.pauseStartTime=0;this.durationInterval=null;this.audioContext=null;this.analyser=null;this.levelInterval=null;this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0};this.stateCallback=null}onStateChange(t){this.stateCallback=t}getSupportedMimeType(){let t=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];for(let e of t)if(MediaRecorder.isTypeSupported(e))return e;return"audio/webm"}async startRecording(){if(this.state.isRecording)throw new Error("Already recording");try{this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0,sampleRate:44100}}),this.setupAudioAnalysis();let t=this.getSupportedMimeType();this.mediaRecorder=new MediaRecorder(this.stream,{mimeType:t,audioBitsPerSecond:48e3}),this.audioChunks=[],this.mediaRecorder.ondataavailable=e=>{e.data.size>0&&this.audioChunks.push(e.data)},this.mediaRecorder.start(1e3),this.startTime=Date.now(),this.pausedDuration=0,this.state={isRecording:!0,isPaused:!1,duration:0,audioLevel:0},this.startDurationTracking(),this.startLevelTracking(),this.notifyStateChange()}catch(t){throw this.cleanup(),new Error(`Failed to start recording: ${t.message}`)}}setupAudioAnalysis(){if(this.stream)try{this.audioContext=new AudioContext;let t=this.audioContext.createMediaStreamSource(this.stream);this.analyser=this.audioContext.createAnalyser(),this.analyser.fftSize=256,t.connect(this.analyser)}catch(t){console.warn("Failed to set up audio analysis:",t)}}startDurationTracking(){this.durationInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused){let t=Date.now()-this.startTime-this.pausedDuration;this.state.duration=Math.floor(t/1e3),this.notifyStateChange()}},100)}startLevelTracking(){if(!this.analyser)return;let t=new Uint8Array(this.analyser.frequencyBinCount);this.levelInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused&&this.analyser){this.analyser.getByteFrequencyData(t);let e=0;for(let s=0;s<t.length;s++)e+=t[s];let n=e/t.length;this.state.audioLevel=Math.min(100,Math.round(n/255*100*2)),this.notifyStateChange()}},50)}pauseRecording(){!this.state.isRecording||this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="recording"&&(this.mediaRecorder.pause(),this.pauseStartTime=Date.now(),this.state.isPaused=!0,this.notifyStateChange())}resumeRecording(){!this.state.isRecording||!this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="paused"&&(this.mediaRecorder.resume(),this.pausedDuration+=Date.now()-this.pauseStartTime,this.state.isPaused=!1,this.notifyStateChange())}async stopRecording(){return new Promise((t,e)=>{if(!this.mediaRecorder||!this.state.isRecording){e(new Error("Not currently recording"));return}let n=this.mediaRecorder.mimeType,s=this.state.duration,i=!1,r=setTimeout(()=>{if(!i){i=!0,console.warn("AudioRecorder: onstop timeout, forcing completion");try{let a=new Blob(this.audioChunks,{type:n}),c=new Date,l=c.toISOString().split("T")[0],d=c.toTimeString().split(" ")[0].replace(/:/g,"-"),p=n.includes("webm")?"webm":n.includes("mp4")?"m4a":n.includes("ogg")?"ogg":"webm",g=`recording-${l}-${d}.${p}`;this.cleanup(),t({audioBlob:a,duration:s,mimeType:n,filename:g})}catch{this.cleanup(),e(new Error("Failed to process recording after timeout"))}}},1e4);this.mediaRecorder.onstop=()=>{if(!i){i=!0,clearTimeout(r);try{let a=new Blob(this.audioChunks,{type:n}),c=new Date,l=c.toISOString().split("T")[0],d=c.toTimeString().split(" ")[0].replace(/:/g,"-"),p=n.includes("webm")?"webm":n.includes("mp4")?"m4a":n.includes("ogg")?"ogg":"webm",g=`recording-${l}-${d}.${p}`;this.cleanup(),t({audioBlob:a,duration:s,mimeType:n,filename:g})}catch(a){this.cleanup(),e(a)}}},this.mediaRecorder.onerror=a=>{i||(i=!0,clearTimeout(r),this.cleanup(),e(new Error("Recording error occurred")))},this.mediaRecorder.stop()})}cancelRecording(){this.cleanup()}cleanup(){this.durationInterval&&(clearInterval(this.durationInterval),this.durationInterval=null),this.levelInterval&&(clearInterval(this.levelInterval),this.levelInterval=null),this.audioContext&&(this.audioContext.close().catch(()=>{}),this.audioContext=null,this.analyser=null),this.stream&&(this.stream.getTracks().forEach(t=>t.stop()),this.stream=null),this.mediaRecorder=null,this.audioChunks=[],this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0},this.notifyStateChange()}getState(){return{...this.state}}static isSupported(){return!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder)}notifyStateChange(){this.stateCallback&&this.stateCallback({...this.state})}static formatDuration(t){let e=Math.floor(t/60),n=t%60;return`${e.toString().padStart(2,"0")}:${n.toString().padStart(2,"0")}`}static async blobToBase64(t){return new Promise((e,n)=>{let s=new FileReader;s.onload=()=>{let r=s.result.split(",")[1];e(r)},s.onerror=n,s.readAsDataURL(t)})}static async blobToArrayBuffer(t){return t.arrayBuffer()}};var w=require("obsidian");function N(u,t){let e="";return(t?.account||t?.opportunities?.length)&&(e=`
ACCOUNT CONTEXT (use to inform your analysis):
${t.account?`- Account: ${t.account.name}`:""}
${t.account?.owner?`- Account Owner: ${t.account.owner}`:""}
${t.opportunities?.length?`- Open Opportunities: ${t.opportunities.map(n=>`${n.name} (${n.stage}, $${(n.acv/1e3).toFixed(0)}k)`).join("; ")}`:""}
${t.contacts?.length?`- Known Contacts: ${t.contacts.slice(0,5).map(n=>`${n.name} - ${n.title}`).join("; ")}`:""}
`),`You are a senior sales intelligence analyst for Eudia, an AI-powered legal technology company. Your role is to extract precise, actionable intelligence from sales meeting transcripts.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies. Our products help in-house legal teams work faster on contracting, compliance, and M&A due diligence. We sell to CLOs, General Counsels, VP Legal, Legal Ops Directors, and Deputy GCs.

${u?`CURRENT ACCOUNT: ${u}`:""}
${e}

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
CRITICAL RULES - Follow these exactly:
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

1. ONLY include information EXPLICITLY stated in the transcript
   - Never infer, assume, or add information not present
   - If something is unclear, mark it as "[unclear]"
   - If a section has no relevant content, write "None identified in this conversation."

2. NAMES must be exact
   - Spell names exactly as you hear them
   - If pronunciation is unclear, write "[unclear: sounds like 'Sarah']"
   - Include title/role ONLY if explicitly mentioned

3. QUOTES are required for key insights
   - Include at least one direct quote per major finding where available
   - Format quotes with quotation marks and attribution

4. PRODUCT INTEREST must use ONLY these exact values:
   - AI Contracting - Technology
   - AI Contracting - Services
   - AI Compliance - Technology
   - AI Compliance - Services
   - AI M&A - Technology
   - AI M&A - Services
   - Sigma
   
   If no products were explicitly discussed or implied, write "None identified."
   Do NOT invent product interest. Only include if there's clear evidence.

5. TIMESTAMPS
   - If specific dates are mentioned, include them
   - For relative dates ("next week", "end of quarter"), calculate from today's context

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
OUTPUT FORMAT - Use these exact headers:
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

## Summary
Provide 5-7 bullet points covering:
- Meeting purpose and context
- Key discussion topics
- Major decisions or conclusions
- Tone and sentiment of the conversation
- Overall assessment of the opportunity
Each bullet should be a complete thought. Include direct quotes where impactful.

## Attendees
List each person identified on the call:
- **[Name]** - [Title/Role if mentioned] ([Company if external])

If attendee names are unclear, note: "[Several attendees - names unclear]"

## MEDDICC Signals
Analyze the conversation through the MEDDICC framework. For each element, provide specific evidence or mark as not identified:

**Metrics:** What quantifiable goals or pain metrics were mentioned?
> [Quote or evidence, or "Not discussed"]

**Economic Buyer:** Who has budget authority? Were they on the call?
> [Name and evidence, or "Not identified"]

**Decision Criteria:** What will they evaluate solutions against?
> [Specific criteria mentioned, or "Not discussed"]

**Decision Process:** What is their buying process? Timeline?
> [Process details, or "Not discussed"]

**Identify Pain:** What specific problems are they trying to solve?
> [Pain points with quotes, or "Not discussed"]

**Champion:** Who is advocating for this internally?
> [Name and evidence, or "Not identified"]

**Competition:** Were other solutions or competitors mentioned?
> [Competitor names and context, or "None mentioned"]

## Product Interest
From Eudia's product portfolio, which solutions are relevant based on the discussion:
- [Product Line from allowed list]: [Evidence from conversation]

If no clear product fit was discussed, write: "None identified - discovery needed."

## Pain Points
Top 3 challenges or problems mentioned by the prospect. For each:
- **[Pain Point]**: "[Direct quote demonstrating the pain]"

If no pain points surfaced, write: "None explicitly stated - deeper discovery recommended."

## Buying Triggers
What prompted this conversation? What's driving urgency?
- [Trigger]: [Evidence]

Examples: acquisition activity, compliance audit, new CLO hire, contract volume spike, budget cycle

## Key Dates
Important dates and deadlines mentioned:
- **[Date/Timeframe]**: [What it relates to]

If none mentioned, write: "No specific dates discussed."

## Next Steps
Agreed actions from the call. Use checkbox format for tracking:
- [ ] [Action] - **Owner:** [Name or "TBD"] - **Due:** [Date if mentioned]

Only include explicitly agreed next steps, not assumed ones.

## Action Items (Internal)
Follow-ups for the Eudia team (not discussed with prospect):
- [ ] [Internal action needed]

Examples: Send materials, schedule follow-up, loop in SE, update Salesforce

## Deal Signals
Indicators of deal health and stage progression:

**Positive Signals:**
- [Signal]: [Evidence]

**Concerning Signals:**
- [Signal]: [Evidence]

**Recommended Stage:** [Stage 1-4 based on MEDDICC completion]

## Risks & Objections
Concerns or objections raised:
- **[Objection]**: "[Quote or paraphrase]" \u2192 [Suggested response approach]

If no objections raised, write: "None raised in this conversation."

## Competitive Intelligence
If competitors were mentioned:
- **[Competitor]**: [What was said, sentiment, perceived strengths/weaknesses]

If no competitors mentioned, write: "No competitive mentions."

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
FINAL CHECKS:
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
- Every claim has evidence from the transcript
- Names are spelled exactly as heard
- Product lines use only the allowed values
- Quotes are properly attributed
- Action items have clear owners`}var S=class{constructor(t,e){this.openaiApiKey=null;this.serverUrl=t,this.openaiApiKey=e||null}setServerUrl(t){this.serverUrl=t}setOpenAIKey(t){this.openaiApiKey=t}async transcribeAndSummarize(t,e,n,s,i){try{let r=await(0,w.requestUrl)({url:`${this.serverUrl}/api/transcribe-and-summarize`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:t,mimeType:e,accountName:n,accountId:s,openaiApiKey:this.openaiApiKey,context:i?{customerBrain:i.account?.customerBrain,opportunities:i.opportunities,contacts:i.contacts}:void 0,systemPrompt:N(n,i)})});return r.json.success?{success:!0,transcript:r.json.transcript||"",sections:this.normalizeSections(r.json.sections),duration:r.json.duration||0}:r.json.error?.includes("OpenAI not initialized")&&this.openaiApiKey?(console.log("Server OpenAI unavailable, trying local fallback..."),this.transcribeLocal(t,e,n,i)):{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:r.json.error||"Transcription failed"}}catch(r){return console.error("Server transcription error:",r),this.openaiApiKey?(console.log("Server unreachable, trying local OpenAI fallback..."),this.transcribeLocal(t,e,n,i)):{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:`Server unavailable: ${r.message}. Add OpenAI API key in settings for offline mode.`}}}async transcribeLocal(t,e,n,s){if(!this.openaiApiKey)return{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:"No OpenAI API key configured. Add it in plugin settings."};try{let i=atob(t),r=new Uint8Array(i.length);for(let m=0;m<i.length;m++)r[m]=i.charCodeAt(m);let a=new Blob([r],{type:e}),c=new FormData,l=e.includes("webm")?"webm":e.includes("mp4")?"m4a":"ogg";c.append("file",a,`audio.${l}`),c.append("model","whisper-1"),c.append("response_format","verbose_json"),c.append("language","en");let d=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`},body:c});if(!d.ok){let m=await d.text();throw new Error(`Whisper API error: ${d.status} - ${m}`)}let p=await d.json(),g=p.text||"",h=p.duration||0,y=await this.summarizeLocal(g,n,s);return{success:!0,transcript:g,sections:y,duration:h}}catch(i){return console.error("Local transcription error:",i),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:i.message||"Local transcription failed"}}}async summarizeLocal(t,e,n){if(!this.openaiApiKey)return this.getEmptySections();try{let s=N(e,n),i=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o",messages:[{role:"system",content:s},{role:"user",content:`Analyze this meeting transcript:

${t.substring(0,1e5)}`}],temperature:.2,max_tokens:6e3})});if(!i.ok)return console.warn("GPT summarization failed, returning empty sections"),this.getEmptySections();let a=(await i.json()).choices?.[0]?.message?.content||"";return this.parseSections(a)}catch(s){return console.error("Local summarization error:",s),this.getEmptySections()}}parseSections(t){let e=this.getEmptySections(),n={summary:"summary",attendees:"attendees","meddicc signals":"meddiccSignals","product interest":"productInterest","pain points":"painPoints","buying triggers":"buyingTriggers","key dates":"keyDates","next steps":"nextSteps","action items":"actionItems","action items (internal)":"actionItems","deal signals":"dealSignals","risks & objections":"risksObjections","risks and objections":"risksObjections","competitive intelligence":"competitiveIntel"},s=/## ([^\n]+)\n([\s\S]*?)(?=## |$)/g,i;for(;(i=s.exec(t))!==null;){let r=i[1].trim().toLowerCase(),a=i[2].trim(),c=n[r];c&&(e[c]=a)}return e}normalizeSections(t){let e=this.getEmptySections();return t?{...e,...t}:e}async getMeetingContext(t){try{let e=await(0,w.requestUrl)({url:`${this.serverUrl}/api/meeting-context/${t}`,method:"GET",headers:{Accept:"application/json"}});return e.json.success?{success:!0,account:e.json.account,opportunities:e.json.opportunities,contacts:e.json.contacts,lastMeeting:e.json.lastMeeting}:{success:!1,error:e.json.error||"Failed to fetch context"}}catch(e){return console.error("Meeting context error:",e),{success:!1,error:e.message||"Network error"}}}async syncToSalesforce(t,e,n,s,i,r){try{let a=await(0,w.requestUrl)({url:`${this.serverUrl}/api/transcription/sync-to-salesforce`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:t,accountName:e,noteTitle:n,sections:s,transcript:i,meetingDate:r||new Date().toISOString(),syncedAt:new Date().toISOString()})});return a.json.success?{success:!0,customerBrainUpdated:a.json.customerBrainUpdated,eventCreated:a.json.eventCreated,eventId:a.json.eventId,contactsCreated:a.json.contactsCreated,tasksCreated:a.json.tasksCreated}:{success:!1,error:a.json.error||"Sync failed"}}catch(a){return console.error("Salesforce sync error:",a),{success:!1,error:a.message||"Network error"}}}getEmptySections(){return{summary:"",attendees:"",meddiccSignals:"",productInterest:"",painPoints:"",buyingTriggers:"",keyDates:"",nextSteps:"",actionItems:"",dealSignals:"",risksObjections:"",competitiveIntel:""}}static formatSectionsForNote(t,e){let n="";return t.summary&&(n+=`## Summary

${t.summary}

`),t.attendees&&(n+=`## Attendees

${t.attendees}

`),t.productInterest&&t.productInterest!=="None identified."&&(n+=`## Product Interest

${t.productInterest}

`),t.painPoints&&t.painPoints!=="None explicitly stated - deeper discovery recommended."&&(n+=`## Pain Points

${t.painPoints}

`),t.buyingTriggers&&(n+=`## Buying Triggers

${t.buyingTriggers}

`),t.meddiccSignals&&(n+=`## MEDDICC Signals

${t.meddiccSignals}

`),t.nextSteps&&(n+=`## Next Steps

${t.nextSteps}

`),t.actionItems&&(n+=`## Action Items (Internal)

${t.actionItems}

`),t.keyDates&&t.keyDates!=="No specific dates discussed."&&(n+=`## Key Dates

${t.keyDates}

`),t.dealSignals&&(n+=`## Deal Signals

${t.dealSignals}

`),t.risksObjections&&t.risksObjections!=="None raised in this conversation."&&(n+=`## Risks & Objections

${t.risksObjections}

`),t.competitiveIntel&&t.competitiveIntel!=="No competitive mentions."&&(n+=`## Competitive Intelligence

${t.competitiveIntel}

`),e&&(n+=`---

<details>
<summary><strong>Full Transcript</strong></summary>

${e}

</details>
`),n}static formatSectionsWithAudio(t,e,n){let s=this.formatSectionsForNote(t,e);return n&&(s+=`
---

## Recording

![[${n}]]
`),s}static formatContextForNote(t){if(!t.success)return"";let e=`## Pre-Call Context

`;if(t.account&&(e+=`**Account:** ${t.account.name}
`,e+=`**Owner:** ${t.account.owner}

`),t.opportunities&&t.opportunities.length>0){e+=`### Open Opportunities

`;for(let n of t.opportunities){let s=n.acv?`$${(n.acv/1e3).toFixed(0)}k`:"TBD";e+=`- **${n.name}** - ${n.stage} - ${s}`,n.targetSignDate&&(e+=` - Target: ${new Date(n.targetSignDate).toLocaleDateString()}`),e+=`
`}e+=`
`}if(t.contacts&&t.contacts.length>0){e+=`### Key Contacts

`;for(let n of t.contacts.slice(0,5))e+=`- **${n.name}**`,n.title&&(e+=` - ${n.title}`),e+=`
`;e+=`
`}if(t.lastMeeting&&(e+=`### Last Meeting

`,e+=`${new Date(t.lastMeeting.date).toLocaleDateString()} - ${t.lastMeeting.subject}

`),t.account?.customerBrain){let n=t.account.customerBrain.substring(0,500);n&&(e+=`### Recent Notes

`,e+=`${n}${t.account.customerBrain.length>500?"...":""}

`)}return e+=`---

`,e}};var b=require("obsidian"),v=class{constructor(t,e){this.serverUrl=t,this.userEmail=e.toLowerCase()}setUserEmail(t){this.userEmail=t.toLowerCase()}setServerUrl(t){this.serverUrl=t}async getTodaysMeetings(){if(!this.userEmail)return{success:!1,date:new Date().toISOString().split("T")[0],email:"",meetingCount:0,meetings:[],error:"User email not configured"};try{return(await(0,b.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/today`,method:"GET",headers:{Accept:"application/json"}})).json}catch(t){return console.error("Failed to fetch today's meetings:",t),{success:!1,date:new Date().toISOString().split("T")[0],email:this.userEmail,meetingCount:0,meetings:[],error:t.message||"Failed to fetch calendar"}}}async getWeekMeetings(){if(!this.userEmail)return{success:!1,startDate:"",endDate:"",email:"",totalMeetings:0,byDay:{},error:"User email not configured"};try{return(await(0,b.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/week`,method:"GET",headers:{Accept:"application/json"}})).json}catch(t){return console.error("Failed to fetch week's meetings:",t),{success:!1,startDate:"",endDate:"",email:this.userEmail,totalMeetings:0,byDay:{},error:t.message||"Failed to fetch calendar"}}}async getMeetingsInRange(t,e){if(!this.userEmail)return[];try{let n=t.toISOString().split("T")[0],s=e.toISOString().split("T")[0],i=await(0,b.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${n}&end=${s}`,method:"GET",headers:{Accept:"application/json"}});return i.json.success?i.json.meetings||[]:[]}catch(n){return console.error("Failed to fetch calendar range:",n),[]}}async getCurrentMeeting(){let t=await this.getTodaysMeetings();if(!t.success||t.meetings.length===0)return{meeting:null,isNow:!1};let e=new Date;for(let n of t.meetings){let s=new Date(n.start),i=new Date(n.end);if(e>=s&&e<=i)return{meeting:n,isNow:!0};let r=(s.getTime()-e.getTime())/(1e3*60);if(r>0&&r<=15)return{meeting:n,isNow:!1,minutesUntilStart:Math.ceil(r)}}return{meeting:null,isNow:!1}}async getMeetingsForAccount(t){let e=await this.getWeekMeetings();if(!e.success)return[];let n=[];Object.values(e.byDay).forEach(i=>{n.push(...i)});let s=t.toLowerCase();return n.filter(i=>i.accountName?.toLowerCase().includes(s)||i.subject.toLowerCase().includes(s)||i.attendees.some(r=>r.email.toLowerCase().includes(s.split(" ")[0])))}static formatMeetingForNote(t){let e=t.attendees.filter(n=>n.isExternal!==!1).map(n=>n.name||n.email.split("@")[0]).slice(0,5).join(", ");return{title:t.subject,attendees:e,meetingStart:t.start,accountName:t.accountName}}static getDayName(t){let e=new Date(t),n=new Date;n.setHours(0,0,0,0);let s=new Date(e);s.setHours(0,0,0,0);let i=(s.getTime()-n.getTime())/(1e3*60*60*24);return i===0?"Today":i===1?"Tomorrow":e.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}static formatTime(t){return new Date(t).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0})}static getMeetingDuration(t,e){let n=new Date(t),s=new Date(e);return Math.round((s.getTime()-n.getTime())/(1e3*60))}};var j=["ai-contracting-tech","ai-contracting-services","ai-compliance-tech","ai-compliance-services","ai-ma-tech","ai-ma-services","sigma"],B=["metrics-identified","economic-buyer-identified","decision-criteria-discussed","decision-process-discussed","pain-confirmed","champion-identified","competition-mentioned"],U=["progressing","stalled","at-risk","champion-engaged","early-stage"],K=["discovery","demo","negotiation","qbr","implementation","follow-up"],W=`You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

ALLOWED VALUES (use ONLY these exact values):

Product Lines (select all that apply):
- ai-contracting-tech (AI Contracting Technology product)
- ai-contracting-services (AI Contracting Services)
- ai-compliance-tech (AI Compliance Technology)
- ai-compliance-services (AI Compliance Services)
- ai-ma-tech (AI M&A Technology - Due Diligence)
- ai-ma-services (AI M&A Services)
- sigma (Sigma Platform)

MEDDICC Signals (select all that are evidenced):
- metrics-identified (specific metrics, numbers, or goals were discussed)
- economic-buyer-identified (person with budget authority was named or present)
- decision-criteria-discussed (evaluation criteria mentioned)
- decision-process-discussed (approval process or timeline discussed)
- pain-confirmed (specific problems stated with clear evidence)
- champion-identified (internal advocate named or evident)
- competition-mentioned (competitors discussed)

Deal Health (select ONE):
- progressing (positive momentum, clear next steps)
- stalled (no clear progress or next steps)
- at-risk (objections, delays, significant concerns)
- champion-engaged (strong internal support evident)
- early-stage (initial discovery, relationship building)

Meeting Type (select ONE):
- discovery (learning about needs and situation)
- demo (showing product capabilities)
- negotiation (pricing, terms, contract discussion)
- qbr (quarterly business review)
- implementation (post-sale, onboarding)
- follow-up (continuing prior conversation)

RULES:
1. Only tag what is EXPLICITLY evidenced in the content
2. If no products discussed, use empty array
3. If no MEDDICC signals evident, use empty array
4. Always provide a meeting_type based on conversation nature
5. Include key stakeholders with their roles if mentioned

OUTPUT FORMAT (JSON only):
{
  "product_interest": ["tag1", "tag2"],
  "meddicc_signals": ["tag1", "tag2"],
  "deal_health": "tag",
  "meeting_type": "tag",
  "key_stakeholders": ["Name - Role", "Name - Role"],
  "confidence": 0.85
}`,T=class{constructor(t,e){this.openaiApiKey=null;this.serverUrl=t,this.openaiApiKey=e||null}setOpenAIKey(t){this.openaiApiKey=t}setServerUrl(t){this.serverUrl=t}async extractTags(t){let e=this.buildTagContext(t);if(!e.trim())return{success:!1,tags:this.getEmptyTags(),error:"No content to analyze"};try{return await this.extractTagsViaServer(e)}catch(n){return console.warn("Server tag extraction failed, trying local:",n.message),this.openaiApiKey?await this.extractTagsLocal(e):this.extractTagsRuleBased(t)}}buildTagContext(t){let e=[];return t.summary&&e.push(`SUMMARY:
${t.summary}`),t.productInterest&&e.push(`PRODUCT INTEREST:
${t.productInterest}`),t.meddiccSignals&&e.push(`MEDDICC SIGNALS:
${t.meddiccSignals}`),t.dealSignals&&e.push(`DEAL SIGNALS:
${t.dealSignals}`),t.painPoints&&e.push(`PAIN POINTS:
${t.painPoints}`),t.attendees&&e.push(`ATTENDEES:
${t.attendees}`),e.join(`

`)}async extractTagsViaServer(t){let e=await fetch(`${this.serverUrl}/api/extract-tags`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:t,openaiApiKey:this.openaiApiKey})});if(!e.ok)throw new Error(`Server returned ${e.status}`);let n=await e.json();if(!n.success)throw new Error(n.error||"Tag extraction failed");return{success:!0,tags:this.validateAndNormalizeTags(n.tags)}}async extractTagsLocal(t){if(!this.openaiApiKey)return{success:!1,tags:this.getEmptyTags(),error:"No OpenAI API key configured"};try{let e=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:W},{role:"user",content:`Extract tags from this meeting content:

${t}`}],temperature:.1,response_format:{type:"json_object"}})});if(!e.ok)throw new Error(`OpenAI returned ${e.status}`);let s=(await e.json()).choices?.[0]?.message?.content;if(!s)throw new Error("No content in response");let i=JSON.parse(s);return{success:!0,tags:this.validateAndNormalizeTags(i)}}catch(e){return console.error("Local tag extraction error:",e),{success:!1,tags:this.getEmptyTags(),error:e.message||"Tag extraction failed"}}}extractTagsRuleBased(t){let e=Object.values(t).join(" ").toLowerCase(),n={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:.4};return(e.includes("contract")||e.includes("contracting"))&&(e.includes("service")?n.product_interest.push("ai-contracting-services"):n.product_interest.push("ai-contracting-tech")),e.includes("compliance")&&n.product_interest.push("ai-compliance-tech"),(e.includes("m&a")||e.includes("due diligence")||e.includes("acquisition"))&&n.product_interest.push("ai-ma-tech"),e.includes("sigma")&&n.product_interest.push("sigma"),(e.includes("metric")||e.includes("%")||e.includes("roi")||e.includes("save"))&&n.meddicc_signals.push("metrics-identified"),(e.includes("budget")||e.includes("cfo")||e.includes("economic buyer"))&&n.meddicc_signals.push("economic-buyer-identified"),(e.includes("pain")||e.includes("challenge")||e.includes("problem")||e.includes("struggle"))&&n.meddicc_signals.push("pain-confirmed"),(e.includes("champion")||e.includes("advocate")||e.includes("sponsor"))&&n.meddicc_signals.push("champion-identified"),(e.includes("competitor")||e.includes("alternative")||e.includes("vs")||e.includes("compared to"))&&n.meddicc_signals.push("competition-mentioned"),(e.includes("next step")||e.includes("follow up")||e.includes("schedule"))&&(n.deal_health="progressing"),(e.includes("concern")||e.includes("objection")||e.includes("hesitant")||e.includes("risk"))&&(n.deal_health="at-risk"),e.includes("demo")||e.includes("show you")||e.includes("demonstration")?n.meeting_type="demo":e.includes("pricing")||e.includes("negotiat")||e.includes("contract terms")?n.meeting_type="negotiation":e.includes("quarterly")||e.includes("qbr")||e.includes("review")?n.meeting_type="qbr":(e.includes("implementation")||e.includes("onboard")||e.includes("rollout"))&&(n.meeting_type="implementation"),{success:!0,tags:n}}validateAndNormalizeTags(t){let e={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:t.confidence||.8};return Array.isArray(t.product_interest)&&(e.product_interest=t.product_interest.filter(n=>j.includes(n))),Array.isArray(t.meddicc_signals)&&(e.meddicc_signals=t.meddicc_signals.filter(n=>B.includes(n))),U.includes(t.deal_health)&&(e.deal_health=t.deal_health),K.includes(t.meeting_type)&&(e.meeting_type=t.meeting_type),Array.isArray(t.key_stakeholders)&&(e.key_stakeholders=t.key_stakeholders.slice(0,10)),e}getEmptyTags(){return{product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:0}}static formatTagsForFrontmatter(t){return{product_interest:t.product_interest.length>0?t.product_interest:null,meddicc_signals:t.meddicc_signals.length>0?t.meddicc_signals:null,deal_health:t.deal_health,meeting_type:t.meeting_type,key_stakeholders:t.key_stakeholders.length>0?t.key_stakeholders:null,tag_confidence:Math.round(t.confidence*100)}}static generateTagSummary(t){let e=[];return t.product_interest.length>0&&e.push(`**Products:** ${t.product_interest.join(", ")}`),t.meddicc_signals.length>0&&e.push(`**MEDDICC:** ${t.meddicc_signals.join(", ")}`),e.push(`**Deal Health:** ${t.deal_health}`),e.push(`**Meeting Type:** ${t.meeting_type}`),e.join(" | ")}};var G={serverUrl:"https://gtm-brain.onrender.com",accountsFolder:"Accounts",recordingsFolder:"Recordings",syncOnStartup:!0,autoSyncAfterTranscription:!0,saveAudioFiles:!0,appendTranscript:!1,lastSyncTime:null,cachedAccounts:[],enableSmartTags:!0,showCalendarView:!0,userEmail:"",setupCompleted:!1,calendarConfigured:!1,openaiApiKey:""},I=class extends o.EditorSuggest{constructor(t,e){super(t),this.plugin=e}onTrigger(t,e,n){let s=e.getLine(t.line),i=e.getValue(),r=e.posToOffset(t),a=i.indexOf("---"),c=i.indexOf("---",a+3);if(a===-1||r<a||r>c)return null;let l=s.match(/^account:\s*(.*)$/);if(!l)return null;let d=l[1].trim(),p=s.indexOf(":")+1,g=s.substring(p).match(/^\s*/)?.[0].length||0;return{start:{line:t.line,ch:p+g},end:t,query:d}}getSuggestions(t){let e=t.query.toLowerCase(),n=this.plugin.settings.cachedAccounts;return e?n.filter(s=>s.name.toLowerCase().includes(e)).sort((s,i)=>{let r=s.name.toLowerCase().startsWith(e),a=i.name.toLowerCase().startsWith(e);return r&&!a?-1:a&&!r?1:s.name.localeCompare(i.name)}).slice(0,10):n.slice(0,10)}renderSuggestion(t,e){e.createEl("div",{text:t.name,cls:"suggestion-title"})}selectSuggestion(t,e){if(!this.context)return;this.context.editor.replaceRange(t.name,this.context.start,this.context.end)}},R=class{constructor(t,e,n,s){this.containerEl=null;this.durationEl=null;this.levelBarEl=null;this.statusTextEl=null;this.onPause=t,this.onResume=e,this.onStop=n,this.onCancel=s}show(){if(this.containerEl)return;this.containerEl=document.createElement("div"),this.containerEl.className="eudia-recording-bar recording";let t=document.createElement("div");t.className="eudia-recording-indicator",this.containerEl.appendChild(t),this.durationEl=document.createElement("div"),this.durationEl.className="eudia-duration",this.durationEl.textContent="00:00",this.containerEl.appendChild(this.durationEl);let e=document.createElement("div");e.className="eudia-level-container",this.levelBarEl=document.createElement("div"),this.levelBarEl.className="eudia-level-bar",this.levelBarEl.style.width="0%",e.appendChild(this.levelBarEl),this.containerEl.appendChild(e),this.statusTextEl=document.createElement("div"),this.statusTextEl.className="eudia-status-text",this.statusTextEl.textContent="Recording...",this.containerEl.appendChild(this.statusTextEl);let n=document.createElement("div");n.className="eudia-controls";let s=document.createElement("button");s.className="eudia-control-btn pause",s.innerHTML="\u23F8",s.title="Pause",s.onclick=()=>this.onPause(),n.appendChild(s);let i=document.createElement("button");i.className="eudia-control-btn stop",i.innerHTML="\u23F9",i.title="Stop & Transcribe",i.onclick=()=>this.onStop(),n.appendChild(i);let r=document.createElement("button");r.className="eudia-control-btn cancel",r.innerHTML="\u2715",r.title="Cancel",r.onclick=()=>this.onCancel(),n.appendChild(r),this.containerEl.appendChild(n),document.body.appendChild(this.containerEl)}hide(){this.containerEl&&(this.containerEl.remove(),this.containerEl=null)}updateState(t){this.containerEl&&(this.durationEl&&(this.durationEl.textContent=f.formatDuration(t.duration)),this.levelBarEl&&(this.levelBarEl.style.width=`${t.audioLevel}%`),t.isPaused?(this.containerEl.className="eudia-recording-bar paused",this.statusTextEl&&(this.statusTextEl.textContent="Paused")):(this.containerEl.className="eudia-recording-bar recording",this.statusTextEl&&(this.statusTextEl.textContent="Recording...")))}setProcessing(){if(!this.containerEl)return;this.containerEl.className="eudia-recording-bar processing",this.statusTextEl&&(this.statusTextEl.textContent="Transcribing..."),this.containerEl.querySelectorAll("button").forEach(e=>e.setAttribute("disabled","true"))}};var C=class extends o.Modal{constructor(t,e,n){super(t),this.plugin=e,this.onSelect=n}onOpen(){let{contentEl:t}=this;t.empty(),t.addClass("eudia-account-selector"),t.createEl("h3",{text:"Select Account for Meeting Note"}),this.searchInput=t.createEl("input",{type:"text",placeholder:"Search accounts..."}),this.searchInput.style.width="100%",this.searchInput.style.padding="10px",this.searchInput.style.marginBottom="10px",this.searchInput.style.borderRadius="6px",this.searchInput.style.border="1px solid var(--background-modifier-border)",this.resultsContainer=t.createDiv({cls:"eudia-account-results"}),this.resultsContainer.style.maxHeight="300px",this.resultsContainer.style.overflowY="auto",this.updateResults(""),this.searchInput.addEventListener("input",()=>{this.updateResults(this.searchInput.value)}),this.searchInput.focus()}updateResults(t){this.resultsContainer.empty();let e=this.plugin.settings.cachedAccounts,n=t.toLowerCase(),s=t?e.filter(i=>i.name.toLowerCase().includes(n)):e.slice(0,20);if(s.length===0){this.resultsContainer.createEl("div",{text:t?"No accounts found":'No accounts cached. Run "Sync Accounts" first.',cls:"eudia-no-results"}).style.padding="10px";return}for(let i of s.slice(0,20)){let r=this.resultsContainer.createEl("div",{cls:"eudia-account-item"});r.style.padding="8px 12px",r.style.cursor="pointer",r.style.borderRadius="4px",r.createEl("span",{text:i.name}),r.addEventListener("mouseenter",()=>{r.style.background="var(--background-modifier-hover)"}),r.addEventListener("mouseleave",()=>{r.style.background=""}),r.addEventListener("click",()=>{this.onSelect(i),this.close()})}}onClose(){let{contentEl:t}=this;t.empty()}},A=class extends o.Modal{constructor(t,e,n){super(t),this.plugin=e,this.onComplete=n}onOpen(){let{contentEl:t}=this;t.empty(),t.addClass("eudia-setup-wizard"),t.createEl("h2",{text:"Welcome to Eudia Sales Intelligence"}),t.createEl("p",{text:"Quick setup to get you recording meetings and syncing to Salesforce.",cls:"setting-item-description"});let e=t.createDiv({cls:"eudia-setup-section"});e.createEl("h3",{text:"1. Enter Your Email"}),e.createEl("p",{text:"Your Eudia work email (used for calendar sync)",cls:"setting-item-description"}),this.emailInput=e.createEl("input",{type:"email",placeholder:"yourname@eudia.com",cls:"eudia-email-input"}),this.emailInput.style.width="100%",this.emailInput.style.padding="8px 12px",this.emailInput.style.marginTop="8px",this.emailInput.style.borderRadius="6px",this.emailInput.style.border="1px solid var(--background-modifier-border)";let n=t.createDiv({cls:"eudia-setup-section"});n.style.marginTop="20px",n.createEl("h3",{text:"2. What Gets Configured"});let s=n.createEl("ul");s.style.fontSize="13px",s.style.color="var(--text-muted)",["Salesforce account folders synced","Calendar connected for meeting context","Recording, transcription, and summary ready","Auto-sync to Salesforce Customer Brain"].forEach(l=>s.createEl("li",{text:l})),this.statusEl=t.createDiv({cls:"eudia-setup-status"}),this.statusEl.style.marginTop="16px",this.statusEl.style.padding="12px",this.statusEl.style.borderRadius="8px",this.statusEl.style.display="none";let r=t.createDiv({cls:"eudia-setup-buttons"});r.style.marginTop="24px",r.style.display="flex",r.style.justifyContent="flex-end",r.style.gap="12px";let a=r.createEl("button",{text:"Skip for Now"});a.onclick=()=>this.close();let c=r.createEl("button",{text:"Complete Setup",cls:"mod-cta"});c.onclick=()=>this.runSetup()}async runSetup(){let t=this.emailInput.value.trim().toLowerCase();if(!t||!t.includes("@")){this.showStatus("Please enter a valid email address","error");return}this.showStatus("Setting up...","info");try{this.plugin.settings.userEmail=t,await this.plugin.saveSettings(),this.showStatus("Syncing Salesforce accounts...","info"),await this.plugin.syncAccounts(!0),this.showStatus("Configuring calendar...","info"),await this.configureCalendar(t),this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.showStatus("Setup complete. You're ready to record meetings.","success"),setTimeout(()=>{this.close(),this.onComplete(),new o.Notice("Eudia is ready. Click the mic icon to record.")},1500)}catch(e){this.showStatus(`Setup failed: ${e.message}`,"error")}}async configureCalendar(t){try{let e=".obsidian/plugins/full-calendar/data.json",n=this.app.vault.getAbstractFileByPath(e),i={defaultCalendar:0,recursiveLocal:!1,calendars:[{type:"ical",name:"Work Calendar",url:`${this.plugin.settings.serverUrl}/api/calendar/${t}/feed.ics`,color:"#8e99e1"}],firstDay:0,initialView:{desktop:"timeGridWeek",mobile:"timeGrid3Days"}};n&&n instanceof o.TFile?await this.app.vault.modify(n,JSON.stringify(i,null,2)):(this.app.vault.getAbstractFileByPath(".obsidian/plugins/full-calendar")||await this.app.vault.createFolder(".obsidian/plugins/full-calendar"),await this.app.vault.create(e,JSON.stringify(i,null,2))),this.plugin.settings.calendarConfigured=!0}catch(e){console.warn("Could not configure Full Calendar:",e)}}showStatus(t,e){this.statusEl.style.display="block",this.statusEl.textContent=t,e==="success"?(this.statusEl.style.background="var(--background-modifier-success)",this.statusEl.style.color="var(--text-success)"):e==="error"?(this.statusEl.style.background="var(--background-modifier-error)",this.statusEl.style.color="var(--text-error)"):(this.statusEl.style.background="var(--background-secondary)",this.statusEl.style.color="var(--text-muted)")}onClose(){let{contentEl:t}=this;t.empty()}},E="eudia-calendar-view",x=class extends o.Plugin{constructor(){super(...arguments);this.recordingStatusBar=null;this.ribbonIcon=null;this.isRecording=!1;this.isPaused=!1}async onload(){await this.loadSettings(),this.audioRecorder=new f,this.transcriptionService=new S(this.settings.serverUrl,this.settings.openaiApiKey),this.calendarService=new v(this.settings.serverUrl,this.settings.userEmail),this.smartTagService=new T(this.settings.serverUrl,this.settings.openaiApiKey),this.registerView(E,e=>new k(e,this)),this.audioRecorder.onStateChange(e=>{this.recordingStatusBar&&this.recordingStatusBar.updateState(e)}),this.accountSuggester=new I(this.app,this),this.registerEditorSuggest(this.accountSuggester),this.ribbonIcon=this.addRibbonIcon("microphone","Record Meeting",async()=>{await this.toggleRecording()}),this.addRibbonIcon("calendar","Open Calendar",async()=>{await this.activateCalendarView()}),this.addRibbonIcon("refresh-cw","Sync Salesforce Accounts",async()=>{await this.syncAccounts()}),this.addCommand({id:"start-recording",name:"Start Recording",callback:async()=>{this.isRecording||await this.startRecording()}}),this.addCommand({id:"stop-recording",name:"Stop Recording & Transcribe",callback:async()=>{this.isRecording&&await this.stopRecording()}}),this.addCommand({id:"toggle-recording",name:"Toggle Recording",callback:async()=>{await this.toggleRecording()}}),this.addCommand({id:"open-calendar",name:"Open Calendar View",callback:async()=>{await this.activateCalendarView()}}),this.addCommand({id:"pause-recording",name:"Pause/Resume Recording",callback:()=>{this.isRecording&&this.togglePause()}}),this.addCommand({id:"sync-salesforce-accounts",name:"Sync Salesforce Accounts",callback:async()=>{await this.syncAccounts()}}),this.addCommand({id:"sync-note-to-salesforce",name:"Sync Current Note to Salesforce",callback:async()=>{await this.syncNoteToSalesforce()}}),this.addCommand({id:"fetch-meeting-context",name:"Fetch Pre-Call Context",callback:async()=>{await this.fetchAndInsertContext()}}),this.addCommand({id:"create-meeting-note",name:"Create New Meeting Note",callback:async()=>{await this.createMeetingNote()}}),this.registerEvent(this.app.vault.on("create",async e=>{e instanceof o.TFile&&e.extension==="md"&&e.path.startsWith(this.settings.accountsFolder+"/")&&(await this.app.vault.read(e)).trim()===""&&await this.applyMeetingTemplate(e)})),this.addSettingTab(new D(this.app,this)),this.addCommand({id:"run-setup-wizard",name:"Run Setup Wizard",callback:()=>{new A(this.app,this,()=>{}).open()}}),this.settings.setupCompleted?this.settings.syncOnStartup&&setTimeout(()=>{this.syncAccounts(!0)},2e3):setTimeout(()=>{new A(this.app,this,()=>{this.syncAccounts(!0)}).open()},1500)}async loadSettings(){this.settings=Object.assign({},G,await this.loadData())}async saveSettings(){await this.saveData(this.settings),this.transcriptionService&&(this.transcriptionService.setServerUrl(this.settings.serverUrl),this.transcriptionService.setOpenAIKey(this.settings.openaiApiKey))}async toggleRecording(){this.isRecording?await this.stopRecording():await this.startRecording()}async startRecording(){if(this.isRecording)return;if(!f.isSupported()){new o.Notice("Audio recording is not supported in this browser");return}let e=this.app.workspace.getActiveFile();if(!e){new o.Notice("Please open or create a note first");return}try{await this.audioRecorder.startRecording(),this.isRecording=!0,this.isPaused=!1,this.ribbonIcon&&this.ribbonIcon.addClass("eudia-ribbon-recording"),this.recordingStatusBar=new R(()=>this.togglePause(),()=>this.togglePause(),()=>this.stopRecording(),()=>this.cancelRecording()),this.recordingStatusBar.show(),new o.Notice("Recording started"),this.autoDetectCurrentMeeting(e)}catch(n){new o.Notice(`Failed to start recording: ${n.message}`),this.isRecording=!1}}async autoDetectCurrentMeeting(e){if(this.settings.userEmail)try{let n=await(0,o.requestUrl)({url:`${this.settings.serverUrl}/api/calendar/${this.settings.userEmail}/today`,method:"GET",headers:{Accept:"application/json"}});if(!n.json.success||!n.json.meetings?.length)return;let s=new Date,r=n.json.meetings.find(c=>{let l=new Date(c.start),d=new Date(c.end),p=new Date(l.getTime()-15*60*1e3);return s>=p&&s<=d});if(!r)return;let a=r.attendees?.filter(c=>!c.email?.includes("@eudia.com"))?.map(c=>c.name||c.email)?.slice(0,5)?.join(", ")||"";await this.updateFrontmatter(e,{meeting_title:r.subject,attendees:a,meeting_start:r.start}),console.log("Auto-detected meeting:",r.subject)}catch(n){console.warn("Calendar auto-detect failed:",n.message)}}async stopRecording(){if(this.isRecording)try{this.recordingStatusBar&&this.recordingStatusBar.setProcessing();let e=await this.audioRecorder.stopRecording();this.isRecording=!1,this.isPaused=!1,this.recordingStatusBar&&(this.recordingStatusBar.hide(),this.recordingStatusBar=null),this.ribbonIcon&&this.ribbonIcon.removeClass("eudia-ribbon-recording");let n=this.app.workspace.getActiveFile();if(!n){new o.Notice("No active file to save transcription");return}await this.insertProcessingPlaceholder(n),new o.Notice("Processing audio... You can continue working."),this.processRecordingInBackground(e,n)}catch(e){this.isRecording=!1,this.recordingStatusBar&&(this.recordingStatusBar.hide(),this.recordingStatusBar=null),this.ribbonIcon&&this.ribbonIcon.removeClass("eudia-ribbon-recording"),new o.Notice(`Error stopping recording: ${e.message}`)}}async insertProcessingPlaceholder(e){let n=await this.app.vault.read(e),s=`
---

> **Transcription in progress...**  
> Your audio is being processed. This section will update automatically when complete.

---

`,i=n.match(/^(---\n[\s\S]*?\n---\n)?# [^\n]+\n/);if(i){let r=i[0].length;n=n.substring(0,r)+s+n.substring(r)}else{let r=n.match(/^---\n[\s\S]*?\n---\n/);if(r){let a=r[0].length;n=n.substring(0,a)+s+n.substring(a)}else n=s+n}await this.app.vault.modify(e,n)}async processRecordingInBackground(e,n){try{let s=this.detectAccountFromPath(n.path),i;s&&(i=await this.transcriptionService.getMeetingContext(s.id));let r=await f.blobToBase64(e.audioBlob),a;this.settings.saveAudioFiles&&(a=await this.saveAudioFile(e,n));let c=await this.transcriptionService.transcribeAndSummarize(r,e.mimeType,s?.name,s?.id,i);if(!c.success){await this.replaceProcessingPlaceholder(n,`> **Transcription failed:** ${c.error}
> 
> Try recording again or check your settings.`),new o.Notice(`Transcription failed: ${c.error}`);return}if(await this.insertTranscriptionResults(n,c,a),new o.Notice("Transcription complete"),this.settings.enableSmartTags)try{let l=await this.smartTagService.extractTags(c.sections);l.success&&(await this.applySmartTags(n,l.tags),console.log("Smart tags applied:",l.tags))}catch(l){console.warn("Smart tag extraction failed:",l.message)}this.settings.autoSyncAfterTranscription&&s&&(await this.transcriptionService.syncToSalesforce(s.id,s.name,n.basename,c.sections,c.transcript),new o.Notice("Synced to Salesforce"))}catch(s){console.error("Background transcription error:",s),new o.Notice(`Transcription failed: ${s.message}`);try{await this.replaceProcessingPlaceholder(n,`> **Transcription failed:** ${s.message}`)}catch{}}}async applySmartTags(e,n){let s={};n.product_interest.length>0&&(s.product_interest=n.product_interest),n.meddicc_signals.length>0&&(s.meddicc_signals=n.meddicc_signals),s.deal_health=n.deal_health,s.meeting_type=n.meeting_type,n.key_stakeholders.length>0&&(s.key_stakeholders=n.key_stakeholders),s.tag_confidence=Math.round(n.confidence*100),await this.updateFrontmatter(e,s)}async replaceProcessingPlaceholder(e,n){let s=await this.app.vault.read(e),i=/\n---\n\n> \*\*Transcription in progress\.\.\.\*\*[\s\S]*?\n\n---\n/;i.test(s)&&(s=s.replace(i,`
${n}

`),await this.app.vault.modify(e,s))}togglePause(){this.isRecording&&(this.isPaused?(this.audioRecorder.resumeRecording(),this.isPaused=!1):(this.audioRecorder.pauseRecording(),this.isPaused=!0))}cancelRecording(){this.isRecording&&(this.audioRecorder.cancelRecording(),this.isRecording=!1,this.isPaused=!1,this.recordingStatusBar&&(this.recordingStatusBar.hide(),this.recordingStatusBar=null),this.ribbonIcon&&this.ribbonIcon.removeClass("eudia-ribbon-recording"),new o.Notice("Recording cancelled"))}async processRecording(e,n){let s=this.app.workspace.getActiveFile();if(!s)throw new Error("No active file");let i=this.detectAccountFromPath(s.path),r;i&&(n.setMessage("Fetching account context..."),r=await this.transcriptionService.getMeetingContext(i.id)),n.setMessage("Preparing audio...");let a=await f.blobToBase64(e.audioBlob),c;this.settings.saveAudioFiles&&(n.setMessage("Saving audio file..."),c=await this.saveAudioFile(e,s)),n.setMessage("Transcribing audio...");let l=await this.transcriptionService.transcribeAndSummarize(a,e.mimeType,i?.name,i?.id,r);if(!l.success)throw new Error(l.error||"Transcription failed");n.setMessage("Updating note..."),await this.insertTranscriptionResults(s,l,c),this.settings.autoSyncAfterTranscription&&i&&(n.setMessage("Syncing to Salesforce..."),await this.transcriptionService.syncToSalesforce(i.id,i.name,s.basename,l.sections,l.transcript))}detectAccountFromPath(e){let n=this.settings.accountsFolder;if(!e.startsWith(n+"/"))return null;let i=e.substring(n.length+1).split("/")[0];return i&&this.settings.cachedAccounts.find(a=>this.sanitizeFolderName(a.name).toLowerCase()===i.toLowerCase())||null}async saveAudioFile(e,n){try{await this.ensureFolderExists(this.settings.recordingsFolder);let s=`${n.basename}-${e.filename}`,i=`${this.settings.recordingsFolder}/${s}`,r=await f.blobToArrayBuffer(e.audioBlob);return await this.app.vault.createBinary(i,r),s}catch(s){console.warn("Failed to save audio file:",s);return}}async insertTranscriptionResults(e,n,s){let i=await this.app.vault.read(e),r=/\n---\n\n> \*\*Transcription in progress\.\.\.\*\*[\s\S]*?\n\n---\n/;i=i.replace(r,`
`);let a=S.formatSectionsWithAudio(n.sections,this.settings.appendTranscript?n.transcript:void 0,s),c=i.match(/^---\n[\s\S]*?\n---\n/),l=i.match(/^(---\n[\s\S]*?\n---\n)?# [^\n]+\n/);if(l){let d=l[0].length;i=i.substring(0,d)+`
`+a+i.substring(d)}else if(c){let d=c[0].length;i=i.substring(0,d)+`
`+a+i.substring(d)}else i=a+i;await this.app.vault.modify(e,i),await this.updateFrontmatter(e,{transcribed:!0,transcribed_at:new Date().toISOString(),duration_seconds:n.duration})}async createMeetingNote(){new C(this.app,this,async e=>{if(!e){new o.Notice("No account selected");return}let s=new Date().toISOString().split("T")[0],i=`${s} Meeting.md`,r=`${this.settings.accountsFolder}/${this.sanitizeFolderName(e.name)}`;await this.ensureFolderExists(r);let a=`${r}/${i}`,c=this.app.vault.getAbstractFileByPath(a);if(c){await this.app.workspace.getLeaf().openFile(c);return}let l=this.getMeetingTemplate(e.name,s),d=await this.app.vault.create(a,l);await this.app.workspace.getLeaf().openFile(d),new o.Notice(`Created meeting note for ${e.name}`)}).open()}async applyMeetingTemplate(e){let n=this.detectAccountFromPath(e.path);if(!n)return;let s=new Date().toISOString().split("T")[0],i=this.getMeetingTemplate(n.name,s);await this.app.vault.modify(e,i)}getMeetingTemplate(e,n){return`---
title: Meeting with ${e}
date: ${n}
attendees: 
tags: meeting
account: ${e}
product_interest: []
stage_signals: 
sync_to_salesforce: pending
---

# Meeting with ${e}

## Agenda
- 

## Pre-Call Notes


---

*To record: Click the microphone icon in the sidebar or use Cmd/Ctrl+P \u2192 "Start Recording"*

`}async fetchAndInsertContext(){let e=this.app.workspace.getActiveFile();if(!e){new o.Notice("No active note");return}let n=this.detectAccountFromPath(e.path);if(!n){new o.Notice("Could not detect account from folder path");return}new o.Notice("Fetching meeting context...");let s=await this.transcriptionService.getMeetingContext(n.id);if(!s.success){new o.Notice(`Failed to fetch context: ${s.error}`);return}let i=S.formatContextForNote(s),r=await this.app.vault.read(e),a=r.match(/^(---\n[\s\S]*?\n---\n)?# [^\n]+\n/);if(a){let c=a[0].length;r=r.substring(0,c)+`
`+i+r.substring(c)}else r=i+r;await this.app.vault.modify(e,r),new o.Notice("Meeting context added")}async syncAccounts(e=!1){try{e||new o.Notice("Syncing Salesforce accounts...");let n=await this.fetchAccounts();if(n.length===0){e||new o.Notice("No accounts found or server unavailable");return}this.settings.cachedAccounts=n,await this.ensureFolderExists(this.settings.accountsFolder);let s=this.getExistingAccountFolders(),i=0;for(let r of n){let a=this.sanitizeFolderName(r.name),c=`${this.settings.accountsFolder}/${a}`;s.includes(a.toLowerCase())||(await this.ensureFolderExists(c),i++)}this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings(),e||(i>0?new o.Notice(`Sync complete! Created ${i} new account folders. ${n.length} accounts available for autocomplete.`):new o.Notice(`Sync complete. All ${n.length} accounts ready for autocomplete.`))}catch(n){console.error("Eudia Sync error:",n),e||new o.Notice(`Sync failed: ${n.message}`)}}async fetchAccounts(){try{let n=(await(0,o.requestUrl)({url:`${this.settings.serverUrl}/api/accounts/obsidian`,method:"GET",headers:{Accept:"application/json"}})).json;if(!n.success)throw new Error("API returned unsuccessful response");return n.accounts||[]}catch(e){throw console.error("Failed to fetch accounts:",e),new Error("Could not connect to GTM Brain server")}}async syncNoteToSalesforce(){let e=this.app.workspace.getActiveFile();if(!e){new o.Notice("No active note to sync");return}try{let n=await this.app.vault.read(e),s=this.parseFrontmatter(n),i=null;if(s.account&&(i=this.settings.cachedAccounts.find(a=>a.name.toLowerCase()===s.account.toLowerCase())||null),i||(i=this.detectAccountFromPath(e.path)),!i){new o.Notice('No account found. Add an "account" property or move note to an account folder.',5e3),new C(this.app,this,async a=>{a&&(await this.updateFrontmatter(e,{account:a.name}),new o.Notice(`Account set to ${a.name}. Try syncing again.`))}).open();return}new o.Notice("Syncing note to Salesforce...");let r=await(0,o.requestUrl)({url:`${this.settings.serverUrl}/api/notes/sync`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:i.id,accountName:i.name,noteTitle:e.basename,notePath:e.path,content:n,frontmatter:s,syncedAt:new Date().toISOString()})});r.json.success?(new o.Notice("Note synced to Salesforce"),await this.updateFrontmatter(e,{synced_to_salesforce:!0,last_synced:new Date().toISOString()})):new o.Notice(`Sync failed: ${r.json.error||"Unknown error"}`)}catch(n){console.error("Sync to Salesforce failed:",n),new o.Notice(`Sync failed: ${n.message}`)}}parseFrontmatter(e){let n=e.match(/^---\n([\s\S]*?)\n---/);if(!n)return{};let s={},i=n[1].split(`
`);for(let r of i){let a=r.indexOf(":");if(a>0){let c=r.substring(0,a).trim(),l=r.substring(a+1).trim();s[c]=l}}return s}async updateFrontmatter(e,n){let s=await this.app.vault.read(e),i=s.match(/^---\n([\s\S]*?)\n---/);if(i){let r=i[1];for(let[a,c]of Object.entries(n)){if(c==null)continue;let l;if(Array.isArray(c)){if(c.length===0)continue;l=`
${c.map(g=>`  - ${g}`).join(`
`)}`}else typeof c=="object"?l=JSON.stringify(c):l=String(c);let d=`${a}:${Array.isArray(c)?l:` ${l}`}`,p=new RegExp(`^${a}:.*(?:\\n  - .*)*`,"m");p.test(r)?r=r.replace(p,d):r+=`
${d}`}s=s.replace(/^---\n[\s\S]*?\n---/,`---
${r}
---`),await this.app.vault.modify(e,s)}}getExistingAccountFolders(){let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);return!e||!(e instanceof o.TFolder)?[]:e.children.filter(n=>n instanceof o.TFolder).map(n=>n.name.toLowerCase())}async ensureFolderExists(e){this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e)}sanitizeFolderName(e){return e.replace(/[<>:"/\\|?*]/g,"_").replace(/\s+/g," ").trim()}async activateCalendarView(){let{workspace:e}=this.app,n=null,s=e.getLeavesOfType(E);s.length>0?n=s[0]:(n=e.getRightLeaf(!1),n&&await n.setViewState({type:E,active:!0})),n&&e.revealLeaf(n)}},k=class extends o.ItemView{constructor(e,n){super(e);this.refreshInterval=null;this.plugin=n}getViewType(){return E}getDisplayText(){return"Calendar"}getIcon(){return"calendar"}async onOpen(){await this.render(),this.refreshInterval=window.setInterval(()=>{this.render()},5*60*1e3)}async onClose(){this.refreshInterval&&window.clearInterval(this.refreshInterval)}async render(){let e=this.containerEl.children[1];e.empty(),e.addClass("eudia-calendar-view");let n=e.createDiv({cls:"eudia-calendar-header"});n.createEl("h4",{text:"Upcoming Meetings"});let s=n.createEl("button",{cls:"eudia-calendar-refresh"});if(s.innerHTML="\u21BB",s.title="Refresh",s.onclick=()=>this.render(),!this.plugin.settings.userEmail){e.createDiv({cls:"eudia-calendar-empty"}).createEl("p",{text:"Configure your email in plugin settings to see your calendar."});return}let i=e.createDiv({cls:"eudia-calendar-loading"});i.textContent="Loading calendar...";try{let a=await new v(this.plugin.settings.serverUrl,this.plugin.settings.userEmail).getWeekMeetings();if(i.remove(),!a.success||Object.keys(a.byDay).length===0){e.createDiv({cls:"eudia-calendar-empty"}).createEl("p",{text:a.error||"No upcoming meetings found."});return}let c=Object.keys(a.byDay).sort();for(let l of c){let d=a.byDay[l];if(d.length===0)continue;let p=e.createDiv({cls:"eudia-calendar-day"});p.createEl("div",{cls:"eudia-calendar-day-header",text:v.getDayName(l)});for(let g of d){let h=p.createDiv({cls:`eudia-calendar-meeting ${g.isCustomerMeeting?"customer":"internal"}`});h.createEl("div",{cls:"eudia-calendar-time",text:v.formatTime(g.start)});let y=h.createDiv({cls:"eudia-calendar-details"});y.createEl("div",{cls:"eudia-calendar-subject",text:g.subject}),g.accountName?y.createEl("div",{cls:"eudia-calendar-account",text:g.accountName}):g.attendees.length>0&&y.createEl("div",{cls:"eudia-calendar-attendees",text:g.attendees.slice(0,2).map(m=>m.name||m.email.split("@")[0]).join(", ")}),h.onclick=async()=>{await this.createNoteForMeeting(g)},h.title="Click to create meeting note"}}}catch(r){i.remove(),e.createDiv({cls:"eudia-calendar-error"}).createEl("p",{text:`Error loading calendar: ${r.message}`})}}async createNoteForMeeting(e){let n=e.start.split("T")[0],s=this.plugin.settings.accountsFolder;if(e.accountName){let h=e.accountName.replace(/[<>:"/\\|?*]/g,"_").replace(/\s+/g," ").trim(),y=`${this.plugin.settings.accountsFolder}/${h}`,m=this.app.vault.getAbstractFileByPath(y);m&&m instanceof o.TFolder&&(s=y)}let i=e.subject.replace(/[<>:"/\\|?*]/g,"_").replace(/\s+/g," ").trim().substring(0,50),r=`${n} ${i}.md`,a=`${s}/${r}`,c=this.app.vault.getAbstractFileByPath(a);if(c&&c instanceof o.TFile){await this.app.workspace.getLeaf().openFile(c);return}let l=e.attendees.map(h=>h.name||h.email.split("@")[0]).slice(0,5).join(", "),d=`---
title: ${e.subject}
date: ${n}
attendees: ${l}
account: ${e.accountName||""}
meeting_start: ${e.start}
tags: meeting
sync_to_salesforce: pending
product_interest: []
---

# ${e.subject}

## Pre-Call Notes


---

*To record: Click the microphone icon or use Cmd/Ctrl+P \u2192 "Start Recording"*

`,p=await this.app.vault.create(a,d);await this.app.workspace.getLeaf().openFile(p),new o.Notice(`Created meeting note for ${e.subject}`)}},D=class extends o.PluginSettingTab{constructor(t,e){super(t,e),this.plugin=e}display(){let{containerEl:t}=this;if(t.empty(),t.createEl("h2",{text:"Eudia Sync & Scribe Settings"}),t.createEl("h3",{text:"Connection"}),new o.Setting(t).setName("GTM Brain Server URL").setDesc("The URL of your GTM Brain server").addText(n=>n.setPlaceholder("https://gtm-brain.onrender.com").setValue(this.plugin.settings.serverUrl).onChange(async s=>{this.plugin.settings.serverUrl=s,await this.plugin.saveSettings()})),new o.Setting(t).setName("OpenAI API Key").setDesc("Your OpenAI API key for transcription. Required if server is unavailable.").addText(n=>{n.setPlaceholder("sk-...").setValue(this.plugin.settings.openaiApiKey).onChange(async s=>{this.plugin.settings.openaiApiKey=s,await this.plugin.saveSettings()}),n.inputEl.type="password",n.inputEl.style.width="300px"}),t.createEl("h3",{text:"Folders"}),new o.Setting(t).setName("Accounts Folder").setDesc("Folder where account subfolders will be created").addText(n=>n.setPlaceholder("Accounts").setValue(this.plugin.settings.accountsFolder).onChange(async s=>{this.plugin.settings.accountsFolder=s||"Accounts",await this.plugin.saveSettings()})),new o.Setting(t).setName("Recordings Folder").setDesc("Folder where audio recordings will be saved").addText(n=>n.setPlaceholder("Recordings").setValue(this.plugin.settings.recordingsFolder).onChange(async s=>{this.plugin.settings.recordingsFolder=s||"Recordings",await this.plugin.saveSettings()})),t.createEl("h3",{text:"Recording"}),new o.Setting(t).setName("Save Audio Files").setDesc("Save the original audio recording alongside the note").addToggle(n=>n.setValue(this.plugin.settings.saveAudioFiles).onChange(async s=>{this.plugin.settings.saveAudioFiles=s,await this.plugin.saveSettings()})),new o.Setting(t).setName("Append Full Transcript").setDesc("Include the full transcript at the end of the structured summary").addToggle(n=>n.setValue(this.plugin.settings.appendTranscript).onChange(async s=>{this.plugin.settings.appendTranscript=s,await this.plugin.saveSettings()})),t.createEl("h3",{text:"Salesforce Sync"}),new o.Setting(t).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle(n=>n.setValue(this.plugin.settings.syncOnStartup).onChange(async s=>{this.plugin.settings.syncOnStartup=s,await this.plugin.saveSettings()})),new o.Setting(t).setName("Auto-Sync After Transcription").setDesc("Automatically sync meeting notes to Salesforce after transcription").addToggle(n=>n.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async s=>{this.plugin.settings.autoSyncAfterTranscription=s,await this.plugin.saveSettings()})),t.createEl("h3",{text:"Status"}),this.plugin.settings.lastSyncTime){let n=new Date(this.plugin.settings.lastSyncTime);t.createEl("p",{text:`Last synced: ${n.toLocaleString()}`,cls:"setting-item-description"})}t.createEl("p",{text:`Cached accounts: ${this.plugin.settings.cachedAccounts.length}`,cls:"setting-item-description"});let e=f.isSupported();t.createEl("p",{text:`Audio recording: ${e?"\u2713 Supported":"\u2717 Not supported"}`,cls:"setting-item-description"}),t.createEl("h3",{text:"Actions"}),new o.Setting(t).setName("Sync Accounts").setDesc("Manually sync Salesforce accounts and create folders").addButton(n=>n.setButtonText("Sync Now").setCta().onClick(async()=>{await this.plugin.syncAccounts(),this.display()})),new o.Setting(t).setName("Sync Current Note").setDesc("Push the current note's data to Salesforce").addButton(n=>n.setButtonText("Sync to Salesforce").onClick(async()=>{await this.plugin.syncNoteToSalesforce()})),new o.Setting(t).setName("Fetch Context").setDesc("Get pre-call context for the current note").addButton(n=>n.setButtonText("Fetch Context").onClick(async()=>{await this.plugin.fetchAndInsertContext()}))}};
