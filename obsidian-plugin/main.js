var I=Object.defineProperty;var L=Object.getOwnPropertyDescriptor;var O=Object.getOwnPropertyNames;var B=Object.prototype.hasOwnProperty;var j=(h,n)=>{for(var e in n)I(h,e,{get:n[e],enumerable:!0})},U=(h,n,e,t)=>{if(n&&typeof n=="object"||typeof n=="function")for(let s of O(n))!B.call(h,s)&&s!==e&&I(h,s,{get:()=>n[s],enumerable:!(t=L(n,s))||t.enumerable});return h};var K=h=>U(I({},"__esModule",{value:!0}),h);var Q={};j(Q,{default:()=>x});module.exports=K(Q);var c=require("obsidian");var y=class{constructor(){this.mediaRecorder=null;this.audioChunks=[];this.stream=null;this.startTime=0;this.pausedDuration=0;this.pauseStartTime=0;this.durationInterval=null;this.audioContext=null;this.analyser=null;this.levelInterval=null;this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0};this.stateCallback=null}onStateChange(n){this.stateCallback=n}getSupportedMimeType(){let n=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];for(let e of n)if(MediaRecorder.isTypeSupported(e))return e;return"audio/webm"}async startRecording(){if(this.state.isRecording)throw new Error("Already recording");try{this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0,sampleRate:44100}}),this.setupAudioAnalysis();let n=this.getSupportedMimeType();this.mediaRecorder=new MediaRecorder(this.stream,{mimeType:n,audioBitsPerSecond:48e3}),this.audioChunks=[],this.mediaRecorder.ondataavailable=e=>{e.data.size>0&&this.audioChunks.push(e.data)},this.mediaRecorder.start(1e3),this.startTime=Date.now(),this.pausedDuration=0,this.state={isRecording:!0,isPaused:!1,duration:0,audioLevel:0},this.startDurationTracking(),this.startLevelTracking(),this.notifyStateChange()}catch(n){throw this.cleanup(),new Error(`Failed to start recording: ${n.message}`)}}setupAudioAnalysis(){if(this.stream)try{this.audioContext=new AudioContext;let n=this.audioContext.createMediaStreamSource(this.stream);this.analyser=this.audioContext.createAnalyser(),this.analyser.fftSize=256,n.connect(this.analyser)}catch(n){console.warn("Failed to set up audio analysis:",n)}}startDurationTracking(){this.durationInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused){let n=Date.now()-this.startTime-this.pausedDuration;this.state.duration=Math.floor(n/1e3),this.notifyStateChange()}},100)}startLevelTracking(){if(!this.analyser)return;let n=new Uint8Array(this.analyser.frequencyBinCount);this.levelInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused&&this.analyser){this.analyser.getByteFrequencyData(n);let e=0;for(let s=0;s<n.length;s++)e+=n[s];let t=e/n.length;this.state.audioLevel=Math.min(100,Math.round(t/255*100*2)),this.notifyStateChange()}},50)}pauseRecording(){!this.state.isRecording||this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="recording"&&(this.mediaRecorder.pause(),this.pauseStartTime=Date.now(),this.state.isPaused=!0,this.notifyStateChange())}resumeRecording(){!this.state.isRecording||!this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="paused"&&(this.mediaRecorder.resume(),this.pausedDuration+=Date.now()-this.pauseStartTime,this.state.isPaused=!1,this.notifyStateChange())}async stopRecording(){return new Promise((n,e)=>{if(!this.mediaRecorder||!this.state.isRecording){e(new Error("Not currently recording"));return}let t=this.mediaRecorder.mimeType,s=this.state.duration,i=!1,r=setTimeout(()=>{if(!i){i=!0,console.warn("AudioRecorder: onstop timeout, forcing completion");try{let a=new Blob(this.audioChunks,{type:t}),o=new Date,l=o.toISOString().split("T")[0],d=o.toTimeString().split(" ")[0].replace(/:/g,"-"),g=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm",u=`recording-${l}-${d}.${g}`;this.cleanup(),n({audioBlob:a,duration:s,mimeType:t,filename:u})}catch{this.cleanup(),e(new Error("Failed to process recording after timeout"))}}},1e4);this.mediaRecorder.onstop=()=>{if(!i){i=!0,clearTimeout(r);try{let a=new Blob(this.audioChunks,{type:t}),o=new Date,l=o.toISOString().split("T")[0],d=o.toTimeString().split(" ")[0].replace(/:/g,"-"),g=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm",u=`recording-${l}-${d}.${g}`;this.cleanup(),n({audioBlob:a,duration:s,mimeType:t,filename:u})}catch(a){this.cleanup(),e(a)}}},this.mediaRecorder.onerror=a=>{i||(i=!0,clearTimeout(r),this.cleanup(),e(new Error("Recording error occurred")))},this.mediaRecorder.stop()})}cancelRecording(){this.cleanup()}cleanup(){this.durationInterval&&(clearInterval(this.durationInterval),this.durationInterval=null),this.levelInterval&&(clearInterval(this.levelInterval),this.levelInterval=null),this.audioContext&&(this.audioContext.close().catch(()=>{}),this.audioContext=null,this.analyser=null),this.stream&&(this.stream.getTracks().forEach(n=>n.stop()),this.stream=null),this.mediaRecorder=null,this.audioChunks=[],this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0},this.notifyStateChange()}getState(){return{...this.state}}static isSupported(){return!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder)}notifyStateChange(){this.stateCallback&&this.stateCallback({...this.state})}static formatDuration(n){let e=Math.floor(n/60),t=n%60;return`${e.toString().padStart(2,"0")}:${t.toString().padStart(2,"0")}`}static async blobToBase64(n){return new Promise((e,t)=>{let s=new FileReader;s.onload=()=>{let r=s.result.split(",")[1];e(r)},s.onerror=t,s.readAsDataURL(n)})}static async blobToArrayBuffer(n){return n.arrayBuffer()}};var w=require("obsidian");function D(h,n){let e="";return(n?.account||n?.opportunities?.length)&&(e=`
ACCOUNT CONTEXT (use to inform your analysis):
${n.account?`- Account: ${n.account.name}`:""}
${n.account?.owner?`- Account Owner: ${n.account.owner}`:""}
${n.opportunities?.length?`- Open Opportunities: ${n.opportunities.map(t=>`${t.name} (${t.stage}, $${(t.acv/1e3).toFixed(0)}k)`).join("; ")}`:""}
${n.contacts?.length?`- Known Contacts: ${n.contacts.slice(0,5).map(t=>`${t.name} - ${t.title}`).join("; ")}`:""}
`),`You are a senior sales intelligence analyst for Eudia, an AI-powered legal technology company. Your role is to extract precise, actionable intelligence from sales meeting transcripts.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies. Our products help in-house legal teams work faster on contracting, compliance, and M&A due diligence. We sell to CLOs, General Counsels, VP Legal, Legal Ops Directors, and Deputy GCs.

${h?`CURRENT ACCOUNT: ${h}`:""}
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
- Action items have clear owners`}var v=class{constructor(n,e){this.openaiApiKey=null;this.serverUrl=n,this.openaiApiKey=e||null}setServerUrl(n){this.serverUrl=n}setOpenAIKey(n){this.openaiApiKey=n}async transcribeAndSummarize(n,e,t,s,i){try{let r=await(0,w.requestUrl)({url:`${this.serverUrl}/api/transcribe-and-summarize`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:n,mimeType:e,accountName:t,accountId:s,openaiApiKey:this.openaiApiKey,context:i?{customerBrain:i.account?.customerBrain,opportunities:i.opportunities,contacts:i.contacts}:void 0,systemPrompt:D(t,i)})});return r.json.success?{success:!0,transcript:r.json.transcript||"",sections:this.normalizeSections(r.json.sections),duration:r.json.duration||0}:r.json.error?.includes("OpenAI not initialized")&&this.openaiApiKey?(console.log("Server OpenAI unavailable, trying local fallback..."),this.transcribeLocal(n,e,t,i)):{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:r.json.error||"Transcription failed"}}catch(r){return console.error("Server transcription error:",r),this.openaiApiKey?(console.log("Server unreachable, trying local OpenAI fallback..."),this.transcribeLocal(n,e,t,i)):{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:`Server unavailable: ${r.message}. Add OpenAI API key in settings for offline mode.`}}}async transcribeLocal(n,e,t,s){if(!this.openaiApiKey)return{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:"No OpenAI API key configured. Add it in plugin settings."};try{let i=atob(n),r=new Uint8Array(i.length);for(let m=0;m<i.length;m++)r[m]=i.charCodeAt(m);let a=new Blob([r],{type:e}),o=new FormData,l=e.includes("webm")?"webm":e.includes("mp4")?"m4a":"ogg";o.append("file",a,`audio.${l}`),o.append("model","whisper-1"),o.append("response_format","verbose_json"),o.append("language","en");let d=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`},body:o});if(!d.ok){let m=await d.text();throw new Error(`Whisper API error: ${d.status} - ${m}`)}let g=await d.json(),u=g.text||"",f=g.duration||0,p=await this.summarizeLocal(u,t,s);return{success:!0,transcript:u,sections:p,duration:f}}catch(i){return console.error("Local transcription error:",i),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:i.message||"Local transcription failed"}}}async summarizeLocal(n,e,t){if(!this.openaiApiKey)return this.getEmptySections();try{let s=D(e,t),i=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o",messages:[{role:"system",content:s},{role:"user",content:`Analyze this meeting transcript:

${n.substring(0,1e5)}`}],temperature:.2,max_tokens:6e3})});if(!i.ok)return console.warn("GPT summarization failed, returning empty sections"),this.getEmptySections();let a=(await i.json()).choices?.[0]?.message?.content||"";return this.parseSections(a)}catch(s){return console.error("Local summarization error:",s),this.getEmptySections()}}parseSections(n){let e=this.getEmptySections(),t={summary:"summary",attendees:"attendees","meddicc signals":"meddiccSignals","product interest":"productInterest","pain points":"painPoints","buying triggers":"buyingTriggers","key dates":"keyDates","next steps":"nextSteps","action items":"actionItems","action items (internal)":"actionItems","deal signals":"dealSignals","risks & objections":"risksObjections","risks and objections":"risksObjections","competitive intelligence":"competitiveIntel"},s=/## ([^\n]+)\n([\s\S]*?)(?=## |$)/g,i;for(;(i=s.exec(n))!==null;){let r=i[1].trim().toLowerCase(),a=i[2].trim(),o=t[r];o&&(e[o]=a)}return e}normalizeSections(n){let e=this.getEmptySections();return n?{...e,...n}:e}async getMeetingContext(n){try{let e=await(0,w.requestUrl)({url:`${this.serverUrl}/api/meeting-context/${n}`,method:"GET",headers:{Accept:"application/json"}});return e.json.success?{success:!0,account:e.json.account,opportunities:e.json.opportunities,contacts:e.json.contacts,lastMeeting:e.json.lastMeeting}:{success:!1,error:e.json.error||"Failed to fetch context"}}catch(e){return console.error("Meeting context error:",e),{success:!1,error:e.message||"Network error"}}}async syncToSalesforce(n,e,t,s,i,r){try{let a=await(0,w.requestUrl)({url:`${this.serverUrl}/api/transcription/sync-to-salesforce`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:n,accountName:e,noteTitle:t,sections:s,transcript:i,meetingDate:r||new Date().toISOString(),syncedAt:new Date().toISOString()})});return a.json.success?{success:!0,customerBrainUpdated:a.json.customerBrainUpdated,eventCreated:a.json.eventCreated,eventId:a.json.eventId,contactsCreated:a.json.contactsCreated,tasksCreated:a.json.tasksCreated}:{success:!1,error:a.json.error||"Sync failed"}}catch(a){return console.error("Salesforce sync error:",a),{success:!1,error:a.message||"Network error"}}}getEmptySections(){return{summary:"",attendees:"",meddiccSignals:"",productInterest:"",painPoints:"",buyingTriggers:"",keyDates:"",nextSteps:"",actionItems:"",dealSignals:"",risksObjections:"",competitiveIntel:""}}static formatSectionsForNote(n,e){let t="";return n.summary&&(t+=`## Summary

${n.summary}

`),n.attendees&&(t+=`## Attendees

${n.attendees}

`),n.productInterest&&n.productInterest!=="None identified."&&(t+=`## Product Interest

${n.productInterest}

`),n.painPoints&&n.painPoints!=="None explicitly stated - deeper discovery recommended."&&(t+=`## Pain Points

${n.painPoints}

`),n.buyingTriggers&&(t+=`## Buying Triggers

${n.buyingTriggers}

`),n.meddiccSignals&&(t+=`## MEDDICC Signals

${n.meddiccSignals}

`),n.nextSteps&&(t+=`## Next Steps

${n.nextSteps}

`),n.actionItems&&(t+=`## Action Items (Internal)

${n.actionItems}

`),n.keyDates&&n.keyDates!=="No specific dates discussed."&&(t+=`## Key Dates

${n.keyDates}

`),n.dealSignals&&(t+=`## Deal Signals

${n.dealSignals}

`),n.risksObjections&&n.risksObjections!=="None raised in this conversation."&&(t+=`## Risks & Objections

${n.risksObjections}

`),n.competitiveIntel&&n.competitiveIntel!=="No competitive mentions."&&(t+=`## Competitive Intelligence

${n.competitiveIntel}

`),e&&(t+=`---

<details>
<summary><strong>Full Transcript</strong></summary>

${e}

</details>
`),t}static formatSectionsWithAudio(n,e,t){let s=this.formatSectionsForNote(n,e);return t&&(s+=`
---

## Recording

![[${t}]]
`),s}static formatContextForNote(n){if(!n.success)return"";let e=`## Pre-Call Context

`;if(n.account&&(e+=`**Account:** ${n.account.name}
`,e+=`**Owner:** ${n.account.owner}

`),n.opportunities&&n.opportunities.length>0){e+=`### Open Opportunities

`;for(let t of n.opportunities){let s=t.acv?`$${(t.acv/1e3).toFixed(0)}k`:"TBD";e+=`- **${t.name}** - ${t.stage} - ${s}`,t.targetSignDate&&(e+=` - Target: ${new Date(t.targetSignDate).toLocaleDateString()}`),e+=`
`}e+=`
`}if(n.contacts&&n.contacts.length>0){e+=`### Key Contacts

`;for(let t of n.contacts.slice(0,5))e+=`- **${t.name}**`,t.title&&(e+=` - ${t.title}`),e+=`
`;e+=`
`}if(n.lastMeeting&&(e+=`### Last Meeting

`,e+=`${new Date(n.lastMeeting.date).toLocaleDateString()} - ${n.lastMeeting.subject}

`),n.account?.customerBrain){let t=n.account.customerBrain.substring(0,500);t&&(e+=`### Recent Notes

`,e+=`${t}${n.account.customerBrain.length>500?"...":""}

`)}return e+=`---

`,e}};var b=require("obsidian"),S=class{constructor(n,e){this.serverUrl=n,this.userEmail=e.toLowerCase()}setUserEmail(n){this.userEmail=n.toLowerCase()}setServerUrl(n){this.serverUrl=n}async getTodaysMeetings(){if(!this.userEmail)return{success:!1,date:new Date().toISOString().split("T")[0],email:"",meetingCount:0,meetings:[],error:"User email not configured"};try{return(await(0,b.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/today`,method:"GET",headers:{Accept:"application/json"}})).json}catch(n){return console.error("Failed to fetch today's meetings:",n),{success:!1,date:new Date().toISOString().split("T")[0],email:this.userEmail,meetingCount:0,meetings:[],error:n.message||"Failed to fetch calendar"}}}async getWeekMeetings(){if(!this.userEmail)return{success:!1,startDate:"",endDate:"",email:"",totalMeetings:0,byDay:{},error:"User email not configured"};try{return(await(0,b.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/week`,method:"GET",headers:{Accept:"application/json"}})).json}catch(n){return console.error("Failed to fetch week's meetings:",n),{success:!1,startDate:"",endDate:"",email:this.userEmail,totalMeetings:0,byDay:{},error:n.message||"Failed to fetch calendar"}}}async getMeetingsInRange(n,e){if(!this.userEmail)return[];try{let t=n.toISOString().split("T")[0],s=e.toISOString().split("T")[0],i=await(0,b.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${t}&end=${s}`,method:"GET",headers:{Accept:"application/json"}});return i.json.success?i.json.meetings||[]:[]}catch(t){return console.error("Failed to fetch calendar range:",t),[]}}async getCurrentMeeting(){let n=await this.getTodaysMeetings();if(!n.success||n.meetings.length===0)return{meeting:null,isNow:!1};let e=new Date;for(let t of n.meetings){let s=new Date(t.start),i=new Date(t.end);if(e>=s&&e<=i)return{meeting:t,isNow:!0};let r=(s.getTime()-e.getTime())/(1e3*60);if(r>0&&r<=15)return{meeting:t,isNow:!1,minutesUntilStart:Math.ceil(r)}}return{meeting:null,isNow:!1}}async getMeetingsForAccount(n){let e=await this.getWeekMeetings();if(!e.success)return[];let t=[];Object.values(e.byDay).forEach(i=>{t.push(...i)});let s=n.toLowerCase();return t.filter(i=>i.accountName?.toLowerCase().includes(s)||i.subject.toLowerCase().includes(s)||i.attendees.some(r=>r.email.toLowerCase().includes(s.split(" ")[0])))}static formatMeetingForNote(n){let e=n.attendees.filter(t=>t.isExternal!==!1).map(t=>t.name||t.email.split("@")[0]).slice(0,5).join(", ");return{title:n.subject,attendees:e,meetingStart:n.start,accountName:n.accountName}}static getDayName(n){let e=new Date(n),t=new Date;t.setHours(0,0,0,0);let s=new Date(e);s.setHours(0,0,0,0);let i=(s.getTime()-t.getTime())/(1e3*60*60*24);return i===0?"Today":i===1?"Tomorrow":e.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}static formatTime(n){return new Date(n).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0})}static getMeetingDuration(n,e){let t=new Date(n),s=new Date(e);return Math.round((s.getTime()-t.getTime())/(1e3*60))}};var G=["ai-contracting-tech","ai-contracting-services","ai-compliance-tech","ai-compliance-services","ai-ma-tech","ai-ma-services","sigma"],W=["metrics-identified","economic-buyer-identified","decision-criteria-discussed","decision-process-discussed","pain-confirmed","champion-identified","competition-mentioned"],z=["progressing","stalled","at-risk","champion-engaged","early-stage"],H=["discovery","demo","negotiation","qbr","implementation","follow-up"],V=`You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

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
}`,T=class{constructor(n,e){this.openaiApiKey=null;this.serverUrl=n,this.openaiApiKey=e||null}setOpenAIKey(n){this.openaiApiKey=n}setServerUrl(n){this.serverUrl=n}async extractTags(n){let e=this.buildTagContext(n);if(!e.trim())return{success:!1,tags:this.getEmptyTags(),error:"No content to analyze"};try{return await this.extractTagsViaServer(e)}catch(t){return console.warn("Server tag extraction failed, trying local:",t.message),this.openaiApiKey?await this.extractTagsLocal(e):this.extractTagsRuleBased(n)}}buildTagContext(n){let e=[];return n.summary&&e.push(`SUMMARY:
${n.summary}`),n.productInterest&&e.push(`PRODUCT INTEREST:
${n.productInterest}`),n.meddiccSignals&&e.push(`MEDDICC SIGNALS:
${n.meddiccSignals}`),n.dealSignals&&e.push(`DEAL SIGNALS:
${n.dealSignals}`),n.painPoints&&e.push(`PAIN POINTS:
${n.painPoints}`),n.attendees&&e.push(`ATTENDEES:
${n.attendees}`),e.join(`

`)}async extractTagsViaServer(n){let e=await fetch(`${this.serverUrl}/api/extract-tags`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:n,openaiApiKey:this.openaiApiKey})});if(!e.ok)throw new Error(`Server returned ${e.status}`);let t=await e.json();if(!t.success)throw new Error(t.error||"Tag extraction failed");return{success:!0,tags:this.validateAndNormalizeTags(t.tags)}}async extractTagsLocal(n){if(!this.openaiApiKey)return{success:!1,tags:this.getEmptyTags(),error:"No OpenAI API key configured"};try{let e=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:V},{role:"user",content:`Extract tags from this meeting content:

${n}`}],temperature:.1,response_format:{type:"json_object"}})});if(!e.ok)throw new Error(`OpenAI returned ${e.status}`);let s=(await e.json()).choices?.[0]?.message?.content;if(!s)throw new Error("No content in response");let i=JSON.parse(s);return{success:!0,tags:this.validateAndNormalizeTags(i)}}catch(e){return console.error("Local tag extraction error:",e),{success:!1,tags:this.getEmptyTags(),error:e.message||"Tag extraction failed"}}}extractTagsRuleBased(n){let e=Object.values(n).join(" ").toLowerCase(),t={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:.4};return(e.includes("contract")||e.includes("contracting"))&&(e.includes("service")?t.product_interest.push("ai-contracting-services"):t.product_interest.push("ai-contracting-tech")),e.includes("compliance")&&t.product_interest.push("ai-compliance-tech"),(e.includes("m&a")||e.includes("due diligence")||e.includes("acquisition"))&&t.product_interest.push("ai-ma-tech"),e.includes("sigma")&&t.product_interest.push("sigma"),(e.includes("metric")||e.includes("%")||e.includes("roi")||e.includes("save"))&&t.meddicc_signals.push("metrics-identified"),(e.includes("budget")||e.includes("cfo")||e.includes("economic buyer"))&&t.meddicc_signals.push("economic-buyer-identified"),(e.includes("pain")||e.includes("challenge")||e.includes("problem")||e.includes("struggle"))&&t.meddicc_signals.push("pain-confirmed"),(e.includes("champion")||e.includes("advocate")||e.includes("sponsor"))&&t.meddicc_signals.push("champion-identified"),(e.includes("competitor")||e.includes("alternative")||e.includes("vs")||e.includes("compared to"))&&t.meddicc_signals.push("competition-mentioned"),(e.includes("next step")||e.includes("follow up")||e.includes("schedule"))&&(t.deal_health="progressing"),(e.includes("concern")||e.includes("objection")||e.includes("hesitant")||e.includes("risk"))&&(t.deal_health="at-risk"),e.includes("demo")||e.includes("show you")||e.includes("demonstration")?t.meeting_type="demo":e.includes("pricing")||e.includes("negotiat")||e.includes("contract terms")?t.meeting_type="negotiation":e.includes("quarterly")||e.includes("qbr")||e.includes("review")?t.meeting_type="qbr":(e.includes("implementation")||e.includes("onboard")||e.includes("rollout"))&&(t.meeting_type="implementation"),{success:!0,tags:t}}validateAndNormalizeTags(n){let e={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:n.confidence||.8};return Array.isArray(n.product_interest)&&(e.product_interest=n.product_interest.filter(t=>G.includes(t))),Array.isArray(n.meddicc_signals)&&(e.meddicc_signals=n.meddicc_signals.filter(t=>W.includes(t))),z.includes(n.deal_health)&&(e.deal_health=n.deal_health),H.includes(n.meeting_type)&&(e.meeting_type=n.meeting_type),Array.isArray(n.key_stakeholders)&&(e.key_stakeholders=n.key_stakeholders.slice(0,10)),e}getEmptyTags(){return{product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:0}}static formatTagsForFrontmatter(n){return{product_interest:n.product_interest.length>0?n.product_interest:null,meddicc_signals:n.meddicc_signals.length>0?n.meddicc_signals:null,deal_health:n.deal_health,meeting_type:n.meeting_type,key_stakeholders:n.key_stakeholders.length>0?n.key_stakeholders:null,tag_confidence:Math.round(n.confidence*100)}}static generateTagSummary(n){let e=[];return n.product_interest.length>0&&e.push(`**Products:** ${n.product_interest.join(", ")}`),n.meddicc_signals.length>0&&e.push(`**MEDDICC:** ${n.meddicc_signals.join(", ")}`),e.push(`**Deal Health:** ${n.deal_health}`),e.push(`**Meeting Type:** ${n.meeting_type}`),e.join(" | ")}};var q={serverUrl:"https://gtm-wizard.onrender.com",accountsFolder:"Accounts",recordingsFolder:"Recordings",syncOnStartup:!0,autoSyncAfterTranscription:!0,saveAudioFiles:!0,appendTranscript:!1,lastSyncTime:null,cachedAccounts:[],enableSmartTags:!0,showCalendarView:!0,userEmail:"",setupCompleted:!1,calendarConfigured:!1,openaiApiKey:""},P=class extends c.EditorSuggest{constructor(n,e){super(n),this.plugin=e}onTrigger(n,e,t){let s=e.getLine(n.line),i=e.getValue(),r=e.posToOffset(n),a=i.indexOf("---"),o=i.indexOf("---",a+3);if(a===-1||r<a||r>o)return null;let l=s.match(/^account:\s*(.*)$/);if(!l)return null;let d=l[1].trim(),g=s.indexOf(":")+1,u=s.substring(g).match(/^\s*/)?.[0].length||0;return{start:{line:n.line,ch:g+u},end:n,query:d}}getSuggestions(n){let e=n.query.toLowerCase(),t=this.plugin.settings.cachedAccounts;return e?t.filter(s=>s.name.toLowerCase().includes(e)).sort((s,i)=>{let r=s.name.toLowerCase().startsWith(e),a=i.name.toLowerCase().startsWith(e);return r&&!a?-1:a&&!r?1:s.name.localeCompare(i.name)}).slice(0,10):t.slice(0,10)}renderSuggestion(n,e){e.createEl("div",{text:n.name,cls:"suggestion-title"})}selectSuggestion(n,e){if(!this.context)return;this.context.editor.replaceRange(n.name,this.context.start,this.context.end)}},R=class{constructor(n,e,t,s){this.containerEl=null;this.durationEl=null;this.levelBarEl=null;this.statusTextEl=null;this.onPause=n,this.onResume=e,this.onStop=t,this.onCancel=s}show(){if(this.containerEl)return;this.containerEl=document.createElement("div"),this.containerEl.className="eudia-recording-bar recording";let n=document.createElement("div");n.className="eudia-recording-indicator",n.appendChild(document.createElement("span")),this.containerEl.appendChild(n),this.durationEl=document.createElement("div"),this.durationEl.className="eudia-duration",this.durationEl.textContent="00:00",this.containerEl.appendChild(this.durationEl);let e=document.createElement("div");e.className="eudia-level-container",this.levelBarEl=document.createElement("div"),this.levelBarEl.className="eudia-level-bar",this.levelBarEl.style.width="0%",e.appendChild(this.levelBarEl),this.containerEl.appendChild(e),this.statusTextEl=document.createElement("div"),this.statusTextEl.className="eudia-status-text",this.statusTextEl.textContent="Transcribing...",this.containerEl.appendChild(this.statusTextEl);let t=document.createElement("div");t.className="eudia-controls";let s=document.createElement("button");s.className="eudia-control-btn pause",s.innerHTML="\u23F8",s.title="Pause",s.onclick=()=>this.onPause(),t.appendChild(s);let i=document.createElement("button");i.className="eudia-control-btn stop",i.innerHTML="\u23F9",i.title="Stop & Transcribe",i.onclick=()=>this.onStop(),t.appendChild(i);let r=document.createElement("button");r.className="eudia-control-btn cancel",r.innerHTML="\u2715",r.title="Cancel",r.onclick=()=>this.onCancel(),t.appendChild(r),this.containerEl.appendChild(t),document.body.appendChild(this.containerEl)}hide(){this.containerEl&&(this.containerEl.remove(),this.containerEl=null)}updateState(n){this.containerEl&&(this.durationEl&&(this.durationEl.textContent=y.formatDuration(n.duration)),this.levelBarEl&&(this.levelBarEl.style.width=`${n.audioLevel}%`),n.isPaused?(this.containerEl.className="eudia-recording-bar paused",this.statusTextEl&&(this.statusTextEl.textContent="Paused")):(this.containerEl.className="eudia-recording-bar recording",this.statusTextEl&&(this.statusTextEl.textContent="Listening...")))}setProcessing(){if(!this.containerEl)return;this.containerEl.className="eudia-recording-bar processing",this.statusTextEl&&(this.statusTextEl.textContent="Transcribing..."),this.containerEl.querySelectorAll("button").forEach(e=>e.setAttribute("disabled","true"))}setTranscribing(n){if(!this.containerEl)return;this.containerEl.className="eudia-recording-bar transcribing";let e=Math.max(15,Math.ceil(n/4)),t=Math.ceil(e/60),s;t<=1?s="< 1 min":t<=5?s=`~${t} min`:s=`~${t} min`,this.statusTextEl&&(this.statusTextEl.textContent=`Transcribing (${s})...`),this.durationEl&&(this.durationEl.textContent=s),this.levelBarEl&&(this.levelBarEl.style.width="100%",this.levelBarEl.style.animation="eudia-pulse 1.5s ease-in-out infinite"),this.containerEl.querySelectorAll("button").forEach(r=>r.setAttribute("disabled","true"))}};var C=class extends c.Modal{constructor(n,e,t){super(n),this.plugin=e,this.onSelect=t}onOpen(){let{contentEl:n}=this;n.empty(),n.addClass("eudia-account-selector"),n.createEl("h3",{text:"Select Account for Meeting Note"}),this.searchInput=n.createEl("input",{type:"text",placeholder:"Search accounts..."}),this.searchInput.style.width="100%",this.searchInput.style.padding="10px",this.searchInput.style.marginBottom="10px",this.searchInput.style.borderRadius="6px",this.searchInput.style.border="1px solid var(--background-modifier-border)",this.resultsContainer=n.createDiv({cls:"eudia-account-results"}),this.resultsContainer.style.maxHeight="300px",this.resultsContainer.style.overflowY="auto",this.updateResults(""),this.searchInput.addEventListener("input",()=>{this.updateResults(this.searchInput.value)}),this.searchInput.focus()}updateResults(n){this.resultsContainer.empty();let e=this.plugin.settings.cachedAccounts,t=n.toLowerCase(),s=n?e.filter(i=>i.name.toLowerCase().includes(t)):e.slice(0,20);if(s.length===0){this.resultsContainer.createEl("div",{text:n?"No accounts found":'No accounts cached. Run "Sync Accounts" first.',cls:"eudia-no-results"}).style.padding="10px";return}for(let i of s.slice(0,20)){let r=this.resultsContainer.createEl("div",{cls:"eudia-account-item"});r.style.padding="8px 12px",r.style.cursor="pointer",r.style.borderRadius="4px",r.createEl("span",{text:i.name}),r.addEventListener("mouseenter",()=>{r.style.background="var(--background-modifier-hover)"}),r.addEventListener("mouseleave",()=>{r.style.background=""}),r.addEventListener("click",()=>{this.onSelect(i),this.close()})}}onClose(){let{contentEl:n}=this;n.empty()}},A=class extends c.Modal{constructor(n,e,t){super(n),this.plugin=e,this.onComplete=t}onOpen(){let{contentEl:n}=this;n.empty(),n.addClass("eudia-setup-wizard"),n.createEl("h2",{text:"Welcome to Eudia Sales Intelligence"}),n.createEl("p",{text:"Quick setup to get you recording meetings and syncing to Salesforce.",cls:"setting-item-description"});let e=n.createDiv({cls:"eudia-setup-section"});e.createEl("h3",{text:"1. Enter Your Email"}),e.createEl("p",{text:"Your Eudia work email (used for calendar sync)",cls:"setting-item-description"}),this.emailInput=e.createEl("input",{type:"email",placeholder:"yourname@eudia.com",cls:"eudia-email-input"}),this.emailInput.style.width="100%",this.emailInput.style.padding="8px 12px",this.emailInput.style.marginTop="8px",this.emailInput.style.borderRadius="6px",this.emailInput.style.border="1px solid var(--background-modifier-border)";let t=n.createDiv({cls:"eudia-setup-section"});t.style.marginTop="20px",t.createEl("h3",{text:"2. What Gets Configured"});let s=t.createEl("ul");s.style.fontSize="13px",s.style.color="var(--text-muted)",["Salesforce account folders synced","Calendar connected for meeting context","Meeting transcription and AI summary ready","Auto-sync to Salesforce Customer Brain"].forEach(l=>s.createEl("li",{text:l})),this.statusEl=n.createDiv({cls:"eudia-setup-status"}),this.statusEl.style.marginTop="16px",this.statusEl.style.padding="12px",this.statusEl.style.borderRadius="8px",this.statusEl.style.display="none";let r=n.createDiv({cls:"eudia-setup-buttons"});r.style.marginTop="24px",r.style.display="flex",r.style.justifyContent="flex-end",r.style.gap="12px";let a=r.createEl("button",{text:"Skip for Now"});a.onclick=()=>this.close();let o=r.createEl("button",{text:"Complete Setup",cls:"mod-cta"});o.onclick=()=>this.runSetup()}async runSetup(){let n=this.emailInput.value.trim().toLowerCase();if(!n||!n.includes("@")){this.showStatus("Please enter a valid email address","error");return}this.showStatus("Setting up...","info");try{this.plugin.settings.userEmail=n,await this.plugin.saveSettings(),this.showStatus("Syncing Salesforce accounts...","info"),await this.plugin.syncAccounts(!0),this.showStatus("Configuring calendar...","info"),await this.configureCalendar(n),this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.showStatus("Setup complete. You're ready to record meetings.","success"),setTimeout(()=>{this.close(),this.onComplete(),new c.Notice("Eudia is ready. Click the mic icon to transcribe meetings.")},1500)}catch(e){this.showStatus(`Setup failed: ${e.message}`,"error")}}async configureCalendar(n){try{let e=".obsidian/plugins/full-calendar/data.json",t=this.app.vault.getAbstractFileByPath(e),i={defaultCalendar:0,recursiveLocal:!1,calendars:[{type:"ical",name:"Work Calendar",url:`${this.plugin.settings.serverUrl}/api/calendar/${n}/feed.ics`,color:"#8e99e1"}],firstDay:0,initialView:{desktop:"timeGridWeek",mobile:"timeGrid3Days"}};t&&t instanceof c.TFile?await this.app.vault.modify(t,JSON.stringify(i,null,2)):(this.app.vault.getAbstractFileByPath(".obsidian/plugins/full-calendar")||await this.app.vault.createFolder(".obsidian/plugins/full-calendar"),await this.app.vault.create(e,JSON.stringify(i,null,2))),this.plugin.settings.calendarConfigured=!0}catch(e){console.warn("Could not configure Full Calendar:",e)}}showStatus(n,e){this.statusEl.style.display="block",this.statusEl.textContent=n,e==="success"?(this.statusEl.style.background="var(--background-modifier-success)",this.statusEl.style.color="var(--text-success)"):e==="error"?(this.statusEl.style.background="var(--background-modifier-error)",this.statusEl.style.color="var(--text-error)"):(this.statusEl.style.background="var(--background-secondary)",this.statusEl.style.color="var(--text-muted)")}onClose(){let{contentEl:n}=this;n.empty()}},E="eudia-calendar-view";function Y(){return`${Date.now()}-${Math.random().toString(36).substr(2,9)}`}function J(){try{return localStorage.getItem("eudia-verbose-logging")==="true"}catch{return!1}}var x=class extends c.Plugin{constructor(){super(...arguments);this.recordingStatusBar=null;this.ribbonIcon=null;this.isRecording=!1;this.isPaused=!1;this.currentCorrelationId=null}log(e,t,s){let i={timestamp:new Date().toISOString(),level:e,message:t,correlationId:this.currentCorrelationId||void 0,plugin:"eudia-transcription",context:s};(e==="error"?console.error:e==="warn"?console.warn:console.log)("[Eudia]",JSON.stringify(i))}operationStart(e,t){let s=Y();return this.currentCorrelationId=s,this.log("info",`[START] ${e}`,{operation:e,correlationId:s,...t}),s}operationSuccess(e,t){this.log("info",`[SUCCESS] ${e}`,{operation:e,result:"success",...t}),this.currentCorrelationId=null}operationError(e,t,s){this.log("error",`[ERROR] ${e}`,{operation:e,errorMessage:t.message,errorStack:t.stack,...s}),this.currentCorrelationId=null}verbose(e,t){J()&&this.log("debug",`[VERBOSE] ${e}`,t)}async onload(){await this.loadSettings(),this.audioRecorder=new y,this.transcriptionService=new v(this.settings.serverUrl,this.settings.openaiApiKey),this.calendarService=new S(this.settings.serverUrl,this.settings.userEmail),this.smartTagService=new T(this.settings.serverUrl,this.settings.openaiApiKey),this.registerView(E,e=>new k(e,this)),this.audioRecorder.onStateChange(e=>{this.recordingStatusBar&&this.recordingStatusBar.updateState(e)}),this.accountSuggester=new P(this.app,this),this.registerEditorSuggest(this.accountSuggester),this.ribbonIcon=this.addRibbonIcon("microphone","Transcribe Meeting",async()=>{await this.toggleRecording()}),this.addRibbonIcon("calendar","Open Calendar",async()=>{await this.activateCalendarView()}),this.addRibbonIcon("refresh-cw","Sync Salesforce Accounts",async()=>{await this.syncAccounts()}),this.addCommand({id:"start-recording",name:"Start Transcribing Meeting",callback:async()=>{this.isRecording||await this.startRecording()}}),this.addCommand({id:"stop-recording",name:"Stop & Generate Summary",callback:async()=>{this.isRecording&&await this.stopRecording()}}),this.addCommand({id:"toggle-recording",name:"Toggle Meeting Transcription",callback:async()=>{await this.toggleRecording()}}),this.addCommand({id:"open-calendar",name:"Open Calendar View",callback:async()=>{await this.activateCalendarView()}}),this.addCommand({id:"pause-recording",name:"Pause/Resume Transcription",callback:()=>{this.isRecording&&this.togglePause()}}),this.addCommand({id:"sync-salesforce-accounts",name:"Sync Salesforce Accounts",callback:async()=>{await this.syncAccounts()}}),this.addCommand({id:"sync-note-to-salesforce",name:"Sync Current Note to Salesforce",callback:async()=>{await this.syncNoteToSalesforce()}}),this.addCommand({id:"fetch-meeting-context",name:"Fetch Pre-Call Context",callback:async()=>{await this.fetchAndInsertContext()}}),this.addCommand({id:"create-meeting-note",name:"Create New Meeting Note",callback:async()=>{await this.createMeetingNote()}}),this.registerEvent(this.app.vault.on("create",async e=>{e instanceof c.TFile&&e.extension==="md"&&e.path.startsWith(this.settings.accountsFolder+"/")&&(await this.app.vault.read(e)).trim()===""&&await this.applyMeetingTemplate(e)})),this.addSettingTab(new M(this.app,this)),this.addCommand({id:"run-setup-wizard",name:"Run Setup Wizard",callback:()=>{new A(this.app,this,()=>{}).open()}}),this.settings.setupCompleted?this.settings.syncOnStartup&&setTimeout(()=>{this.syncAccounts(!0)},2e3):setTimeout(()=>{new A(this.app,this,()=>{this.syncAccounts(!0)}).open()},1500)}async loadSettings(){this.settings=Object.assign({},q,await this.loadData())}async saveSettings(){await this.saveData(this.settings),this.transcriptionService&&(this.transcriptionService.setServerUrl(this.settings.serverUrl),this.transcriptionService.setOpenAIKey(this.settings.openaiApiKey))}async toggleRecording(){this.isRecording?await this.stopRecording():await this.startRecording()}async startRecording(){if(this.isRecording)return;let e=this.operationStart("startRecording");if(!y.isSupported()){new c.Notice("Audio recording is not supported in this browser"),this.log("error","Audio recording not supported",{correlationId:e});return}let t=this.app.workspace.getActiveFile();if(!t){new c.Notice("Please open or create a note first"),this.log("warn","No active file for recording",{correlationId:e});return}try{this.log("info","Starting audio recorder",{file:t.path,correlationId:e}),await this.audioRecorder.startRecording(),this.isRecording=!0,this.isPaused=!1,this.ribbonIcon&&this.ribbonIcon.addClass("eudia-ribbon-recording"),this.recordingStatusBar=new R(()=>this.togglePause(),()=>this.togglePause(),()=>this.stopRecording(),()=>this.cancelRecording()),this.recordingStatusBar.show(),new c.Notice("Transcription started"),this.operationSuccess("startRecording",{file:t.path}),this.autoDetectCurrentMeeting(t)}catch(s){this.operationError("startRecording",s,{correlationId:e}),new c.Notice(`Failed to start recording: ${s.message}`),this.isRecording=!1}}async autoDetectCurrentMeeting(e){if(!this.settings.userEmail){this.verbose("Calendar auto-detect skipped: no user email configured");return}let t=this.operationStart("autoDetectCurrentMeeting",{file:e.path});try{let s=await(0,c.requestUrl)({url:`${this.settings.serverUrl}/api/calendar/${this.settings.userEmail}/today`,method:"GET",headers:{Accept:"application/json"}});if(!s.json.success||!s.json.meetings?.length){this.log("info","No meetings found for today",{correlationId:t});return}let i=new Date,o=s.json.meetings.map(p=>{let m=new Date(p.start),N=new Date(p.end),$=new Date(m.getTime()-15*60*1e3),F=i>=$&&i<=N,_=Math.abs(i.getTime()-m.getTime());return{meeting:p,isInWindow:F,distanceFromStart:_}}).filter(p=>p.isInWindow).sort((p,m)=>p.distanceFromStart-m.distanceFromStart)[0];if(!o){this.log("info","No meeting happening now",{correlationId:t});return}let l=o.meeting;this.log("info","Current meeting detected",{correlationId:t,subject:l.subject});let d=l.attendees?.filter(p=>!p.email?.includes("@eudia.com")&&!p.email?.includes("@eudia.ai"))||[],g=d.map(p=>p.name||p.email).slice(0,5).join(", "),u="";d.length>0&&(u=await this.matchAccountFromAttendees(d));let f={meeting_title:l.subject,attendees:g,meeting_start:l.start};u&&((await this.app.vault.read(e)).match(/^account:\s*\S+/m)||(f.account=u,this.log("info","Account matched from attendees",{correlationId:t,account:u}))),await this.updateFrontmatter(e,f),this.operationSuccess("autoDetectCurrentMeeting",{correlationId:t,meeting:l.subject,account:u||"no match"})}catch(s){this.log("warn","Calendar auto-detect failed (non-fatal)",{correlationId:t,error:s.message})}}async matchAccountFromAttendees(e){if(!this.settings.cachedAccounts?.length)return"";let t=new Set;for(let s of e)if(s.email){let i=s.email.split("@")[1]?.toLowerCase();i&&!i.includes("gmail")&&!i.includes("outlook")&&!i.includes("yahoo")&&!i.includes("hotmail")&&t.add(i)}for(let s of t){let r=s.split(".")[0],a=this.settings.cachedAccounts.find(o=>o.name.toLowerCase().includes(r)||r.includes(o.name.toLowerCase().replace(/[^a-z0-9]/g,"")));if(a)return a.name}return""}async stopRecording(){if(!this.isRecording)return;let e=this.operationStart("stopRecording");try{this.recordingStatusBar&&this.recordingStatusBar.setProcessing(),this.log("info","Stopping audio recorder",{correlationId:e});let t=await this.audioRecorder.stopRecording();this.isRecording=!1,this.isPaused=!1,this.recordingStatusBar&&(this.recordingStatusBar.hide(),this.recordingStatusBar=null),this.ribbonIcon&&this.ribbonIcon.removeClass("eudia-ribbon-recording");let s=this.app.workspace.getActiveFile();if(!s){new c.Notice("No active file to save transcription"),this.log("warn","No active file found for transcription",{correlationId:e});return}this.log("info","Ensuring template is applied",{file:s.path,correlationId:e}),await this.ensureTemplateApplied(s);let i=t.duration?t.duration/1e3:void 0;await this.insertProcessingPlaceholder(s,i),new c.Notice("Processing audio... You can continue working."),this.log("info","Starting background transcription",{correlationId:e,audioDurationSec:i}),this.processRecordingInBackground(t,s)}catch(t){this.operationError("stopRecording",t,{correlationId:e}),this.isRecording=!1,this.recordingStatusBar&&(this.recordingStatusBar.hide(),this.recordingStatusBar=null),this.ribbonIcon&&this.ribbonIcon.removeClass("eudia-ribbon-recording"),new c.Notice(`Error stopping recording: ${t.message}`)}}async insertProcessingPlaceholder(e,t){let s=await this.app.vault.read(e),i="";if(t){let o=Math.max(1,Math.ceil(t/4/60));i=o<=1?"< 1 minute":`~${o} minutes`}let r=`
---

> **Transcription in progress${i?` (${i})`:""}...**  
> Your audio is being processed. This section will update automatically when complete.

---

`,a=s.match(/^(---\n[\s\S]*?\n---\n)?# [^\n]+\n/);if(a){let o=a[0].length;s=s.substring(0,o)+r+s.substring(o)}else{let o=s.match(/^---\n[\s\S]*?\n---\n/);if(o){let l=o[0].length;s=s.substring(0,l)+r+s.substring(l)}else s=r+s}await this.app.vault.modify(e,s)}async processRecordingInBackground(e,t){let s=this.operationStart("processRecordingInBackground",{file:t.path});try{let i=this.detectAccountFromPath(t.path);this.log("info","Account detected from path",{correlationId:s,account:i?.name||"none"});let r;i&&(r=await this.transcriptionService.getMeetingContext(i.id)),this.log("info","Converting audio to base64",{correlationId:s});let a=await y.blobToBase64(e.audioBlob),o;this.settings.saveAudioFiles&&(o=await this.saveAudioFile(e,t),this.log("info","Audio file saved",{correlationId:s,path:o})),this.log("info","Starting transcription API call",{correlationId:s});let l=await this.transcriptionService.transcribeAndSummarize(a,e.mimeType,i?.name,i?.id,r);if(!l.success){this.log("error","Transcription failed",{correlationId:s,error:l.error}),await this.replaceProcessingPlaceholder(t,`> **Transcription failed:** ${l.error}
> 
> Try recording again or check your settings.`),new c.Notice(`Transcription failed: ${l.error}`);return}if(this.log("info","Inserting transcription results into note",{correlationId:s}),await this.insertTranscriptionResults(t,l,o),this.log("info","Transcription results inserted successfully",{correlationId:s}),new c.Notice("Transcription complete"),this.settings.enableSmartTags){this.log("info","Starting smart tag extraction (post-transcription)",{correlationId:s});try{let d=await this.smartTagService.extractTags(l.sections);d.success&&d.tags&&(this.log("info","Smart tags extracted, applying to frontmatter",{correlationId:s,products:d.tags.product_interest,dealHealth:d.tags.deal_health}),await this.applySmartTags(t,d.tags),this.log("info","Smart tags applied successfully",{correlationId:s}))}catch(d){this.log("warn","Smart tag extraction failed (non-fatal)",{correlationId:s,error:d.message})}}this.settings.autoSyncAfterTranscription&&i&&(this.log("info","Auto-syncing to Salesforce",{correlationId:s,accountId:i.id}),await this.transcriptionService.syncToSalesforce(i.id,i.name,t.basename,l.sections,l.transcript),new c.Notice("Synced to Salesforce")),this.operationSuccess("processRecordingInBackground",{correlationId:s})}catch(i){this.operationError("processRecordingInBackground",i,{correlationId:s}),new c.Notice(`Transcription failed: ${i.message}`);try{await this.replaceProcessingPlaceholder(t,`> **Transcription failed:** ${i.message}`)}catch{}}}async applySmartTags(e,t){let s={};t.product_interest.length>0&&(s.product_interest=t.product_interest),t.meddicc_signals.length>0&&(s.meddicc_signals=t.meddicc_signals),s.deal_health=t.deal_health,s.meeting_type=t.meeting_type,t.key_stakeholders.length>0&&(s.key_stakeholders=t.key_stakeholders),s.tag_confidence=Math.round(t.confidence*100),await this.updateFrontmatter(e,s)}async replaceProcessingPlaceholder(e,t){let s=await this.app.vault.read(e),i=/\n---\n\n> \*\*Transcription in progress\.\.\.\*\*[\s\S]*?\n\n---\n/;i.test(s)&&(s=s.replace(i,`
${t}

`),await this.app.vault.modify(e,s))}togglePause(){this.isRecording&&(this.isPaused?(this.audioRecorder.resumeRecording(),this.isPaused=!1):(this.audioRecorder.pauseRecording(),this.isPaused=!0))}cancelRecording(){this.isRecording&&(this.audioRecorder.cancelRecording(),this.isRecording=!1,this.isPaused=!1,this.recordingStatusBar&&(this.recordingStatusBar.hide(),this.recordingStatusBar=null),this.ribbonIcon&&this.ribbonIcon.removeClass("eudia-ribbon-recording"),new c.Notice("Transcription cancelled"))}async processRecording(e,t){let s=this.app.workspace.getActiveFile();if(!s)throw new Error("No active file");let i=this.detectAccountFromPath(s.path),r;i&&(t.setMessage("Fetching account context..."),r=await this.transcriptionService.getMeetingContext(i.id)),t.setMessage("Preparing audio...");let a=await y.blobToBase64(e.audioBlob),o;this.settings.saveAudioFiles&&(t.setMessage("Saving audio file..."),o=await this.saveAudioFile(e,s)),t.setMessage("Transcribing audio...");let l=await this.transcriptionService.transcribeAndSummarize(a,e.mimeType,i?.name,i?.id,r);if(!l.success)throw new Error(l.error||"Transcription failed");t.setMessage("Updating note..."),await this.insertTranscriptionResults(s,l,o),this.settings.autoSyncAfterTranscription&&i&&(t.setMessage("Syncing to Salesforce..."),await this.transcriptionService.syncToSalesforce(i.id,i.name,s.basename,l.sections,l.transcript))}detectAccountFromPath(e){let t=this.settings.accountsFolder;if(!e.startsWith(t+"/"))return null;let i=e.substring(t.length+1).split("/")[0];return i&&this.settings.cachedAccounts.find(a=>this.sanitizeFolderName(a.name).toLowerCase()===i.toLowerCase())||null}async saveAudioFile(e,t){try{await this.ensureFolderExists(this.settings.recordingsFolder);let s=`${t.basename}-${e.filename}`,i=`${this.settings.recordingsFolder}/${s}`,r=await y.blobToArrayBuffer(e.audioBlob);return await this.app.vault.createBinary(i,r),s}catch(s){console.warn("Failed to save audio file:",s);return}}async insertTranscriptionResults(e,t,s){let i=await this.app.vault.read(e),r=/\n---\n\n> \*\*Transcription in progress\.\.\.\*\*[\s\S]*?\n\n---\n/;i=i.replace(r,`
`);let a=v.formatSectionsWithAudio(t.sections,this.settings.appendTranscript?t.transcript:void 0,s),o=i.match(/^---\n[\s\S]*?\n---\n/),l=i.match(/^(---\n[\s\S]*?\n---\n)?# [^\n]+\n/);if(l){let d=l[0].length;i=i.substring(0,d)+`
`+a+i.substring(d)}else if(o){let d=o[0].length;i=i.substring(0,d)+`
`+a+i.substring(d)}else i=a+i;await this.app.vault.modify(e,i),await this.updateFrontmatter(e,{transcribed:!0,transcribed_at:new Date().toISOString(),duration_seconds:t.duration})}async createMeetingNote(){new C(this.app,this,async e=>{if(!e){new c.Notice("No account selected");return}let s=new Date().toISOString().split("T")[0],i=`${s} Meeting.md`,r=`${this.settings.accountsFolder}/${this.sanitizeFolderName(e.name)}`;await this.ensureFolderExists(r);let a=`${r}/${i}`,o=this.app.vault.getAbstractFileByPath(a);if(o){await this.app.workspace.getLeaf().openFile(o);return}let l=this.getMeetingTemplate(e.name,s),d=await this.app.vault.create(a,l);await this.app.workspace.getLeaf().openFile(d),new c.Notice(`Created meeting note for ${e.name}`)}).open()}async applyMeetingTemplate(e){let t=this.detectAccountFromPath(e.path);if(!t)return;let s=new Date().toISOString().split("T")[0],i=this.getMeetingTemplate(t.name,s);await this.app.vault.modify(e,i)}getMeetingTemplate(e,t,s="",i="discovery"){return`---
title: Meeting with ${e||"TBD"}
date: ${t}
account: ${e||""}
attendees: ${s}
sync_to_salesforce: false
products: []
meeting_type: ${i}
deal_health: early-stage
auto_tags: []
recording_date: ${t}
---

# Meeting with ${e||"TBD"}

## Agenda
- 

## Pre-Call Notes


---

*To transcribe: Click the microphone icon in the sidebar or use Cmd/Ctrl+P \u2192 "Start Transcribing Meeting"*

`}hasTemplateFrontmatter(e){return e.includes(`---
`)&&(e.includes("account:")||e.includes("sync_to_salesforce:"))}async ensureTemplateApplied(e){let t=await this.app.vault.read(e);if(!this.hasTemplateFrontmatter(t)){this.log("info","Applying template to blank file",{file:e.path});let s=this.detectAccountFromPath(e.path),i=new Date().toISOString().split("T")[0],r=s?.name||"",a=this.getMeetingTemplate(r,i);if(t.trim()){let o=t.trim();await this.app.vault.modify(e,a+`

`+o)}else await this.app.vault.modify(e,a)}}async fetchAndInsertContext(){let e=this.app.workspace.getActiveFile();if(!e){new c.Notice("No active note");return}let t=this.detectAccountFromPath(e.path);if(!t){new c.Notice("Could not detect account from folder path");return}new c.Notice("Fetching meeting context...");let s=await this.transcriptionService.getMeetingContext(t.id);if(!s.success){new c.Notice(`Failed to fetch context: ${s.error}`);return}let i=v.formatContextForNote(s),r=await this.app.vault.read(e),a=r.match(/^(---\n[\s\S]*?\n---\n)?# [^\n]+\n/);if(a){let o=a[0].length;r=r.substring(0,o)+`
`+i+r.substring(o)}else r=i+r;await this.app.vault.modify(e,r),new c.Notice("Meeting context added")}async syncAccounts(e=!1){try{e||new c.Notice("Syncing Salesforce accounts...");let t=await this.fetchAccounts();if(t.length===0){e||new c.Notice("No accounts found or server unavailable");return}this.settings.cachedAccounts=t,await this.ensureFolderExists(this.settings.accountsFolder);let s=this.getExistingAccountFolders(),i=0;for(let r of t){let a=this.sanitizeFolderName(r.name),o=`${this.settings.accountsFolder}/${a}`;s.includes(a.toLowerCase())||(await this.ensureFolderExists(o),i++)}this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings(),e||(i>0?new c.Notice(`Sync complete! Created ${i} new account folders. ${t.length} accounts available for autocomplete.`):new c.Notice(`Sync complete. All ${t.length} accounts ready for autocomplete.`))}catch(t){console.error("Eudia Sync error:",t),e||new c.Notice(`Sync failed: ${t.message}`)}}async fetchAccounts(){try{let t=(await(0,c.requestUrl)({url:`${this.settings.serverUrl}/api/accounts/obsidian`,method:"GET",headers:{Accept:"application/json"}})).json;if(!t.success)throw new Error("API returned unsuccessful response");return t.accounts||[]}catch(e){throw console.error("Failed to fetch accounts:",e),new Error("Could not connect to GTM Brain server")}}async checkServerHealth(){try{let e=await(0,c.requestUrl)({url:`${this.settings.serverUrl}/health`,method:"GET",headers:{"Content-Type":"application/json"},throw:!1});if(e.status!==200)return{healthy:!1,salesforceConnected:!1,error:`Server returned ${e.status}`};let t=e.json;return{healthy:t.status==="ok",salesforceConnected:t.salesforce?.connected===!0,error:t.salesforce?.lastError||void 0}}catch(e){return{healthy:!1,salesforceConnected:!1,error:e.message||"Cannot connect to server"}}}getSyncErrorMessage(e,t){return e.message?.includes("ECONNREFUSED")||e.message?.includes("ENOTFOUND")?"Cannot connect to GTM Brain server. Is it running?":e.message?.includes("timeout")||e.message?.includes("ETIMEDOUT")?"Connection timed out. Server may be starting up.":e.message?.includes("CORS")||e.message?.includes("NetworkError")?"Network error. Check your internet connection.":t&&!t.healthy?"GTM Brain server is not responding. It may be restarting.":t&&!t.salesforceConnected?`Salesforce not connected: ${t.error||"Check server configuration"}`:e.status===401||e.status===403?"Authentication error. Check API credentials.":e.status===404?"API endpoint not found. Server may need updating.":e.status===500?"Server error. Check server logs for details.":e.message||"Unknown error occurred"}async syncNoteToSalesforce(){let e=this.app.workspace.getActiveFile();if(!e){new c.Notice("No active note to sync");return}try{let t=await this.checkServerHealth();if(!t.healthy){new c.Notice(`Cannot sync: ${t.error||"Server not available"}`,8e3);return}if(!t.salesforceConnected){new c.Notice(`Cannot sync: Salesforce not connected. ${t.error||"Check server config."}`,8e3);return}let s=await this.app.vault.read(e),i=this.parseFrontmatter(s),r=null;if(i.account&&(r=this.settings.cachedAccounts.find(d=>d.name.toLowerCase()===i.account.toLowerCase())||null),r||(r=this.detectAccountFromPath(e.path)),!r&&this.settings.cachedAccounts.length===0){new c.Notice("Fetching accounts from Salesforce...",3e3);try{await this.syncAccounts(),i.account&&(r=this.settings.cachedAccounts.find(d=>d.name.toLowerCase()===i.account.toLowerCase())||null),r||(r=this.detectAccountFromPath(e.path))}catch(d){console.warn("Failed to fetch accounts:",d)}}if(!r){new c.Notice('No account found. Add an "account" property or move note to an account folder.',5e3),new C(this.app,this,async d=>{d&&(await this.updateFrontmatter(e,{account:d.name}),new c.Notice(`Account set to ${d.name}. Try syncing again.`))}).open();return}new c.Notice("Syncing note to Salesforce...");let a=null,o=2;for(let d=0;d<=o;d++)try{let g=await(0,c.requestUrl)({url:`${this.settings.serverUrl}/api/notes/sync`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:r.id,accountName:r.name,noteTitle:e.basename,notePath:e.path,content:s,frontmatter:i,syncedAt:new Date().toISOString()})});if(g.json.success){new c.Notice("\u2713 Note synced to Salesforce"),await this.updateFrontmatter(e,{synced_to_salesforce:!0,last_synced:new Date().toISOString()});return}else{a=new Error(g.json.error||"Unknown error");break}}catch(g){a=g,d<o&&await new Promise(u=>setTimeout(u,1e3*(d+1)))}let l=this.getSyncErrorMessage(a,t);new c.Notice(`Sync failed: ${l}`,8e3),console.error("Sync to Salesforce failed after retries:",a)}catch(t){console.error("Sync to Salesforce failed:",t);let s=this.getSyncErrorMessage(t,null);new c.Notice(`Sync failed: ${s}`,8e3)}}parseFrontmatter(e){let t=e.match(/^---\n([\s\S]*?)\n---/);if(!t)return{};let s={},i=t[1].split(`
`);for(let r of i){let a=r.indexOf(":");if(a>0){let o=r.substring(0,a).trim(),l=r.substring(a+1).trim();s[o]=l}}return s}async updateFrontmatter(e,t){let s=await this.app.vault.read(e),i=s.match(/^---\n([\s\S]*?)\n---/);if(i){let r=i[1];for(let[a,o]of Object.entries(t)){if(o==null)continue;let l;if(Array.isArray(o)){if(o.length===0)continue;l=`
${o.map(u=>`  - ${u}`).join(`
`)}`}else typeof o=="object"?l=JSON.stringify(o):l=String(o);let d=`${a}:${Array.isArray(o)?l:` ${l}`}`,g=new RegExp(`^${a}:.*(?:\\n  - .*)*`,"m");g.test(r)?r=r.replace(g,d):r+=`
${d}`}s=s.replace(/^---\n[\s\S]*?\n---/,`---
${r}
---`),await this.app.vault.modify(e,s)}}getExistingAccountFolders(){let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);return!e||!(e instanceof c.TFolder)?[]:e.children.filter(t=>t instanceof c.TFolder).map(t=>t.name.toLowerCase())}async ensureFolderExists(e){this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e)}sanitizeFolderName(e){return e.replace(/[<>:"/\\|?*]/g,"_").replace(/\s+/g," ").trim()}async activateCalendarView(){let{workspace:e}=this.app,t=null,s=e.getLeavesOfType(E);s.length>0?t=s[0]:(t=e.getRightLeaf(!1),t&&await t.setViewState({type:E,active:!0})),t&&e.revealLeaf(t)}},k=class extends c.ItemView{constructor(e,t){super(e);this.refreshInterval=null;this.plugin=t}getViewType(){return E}getDisplayText(){return"Calendar"}getIcon(){return"calendar"}async onOpen(){await this.render(),this.refreshInterval=window.setInterval(()=>{this.render()},5*60*1e3)}async onClose(){this.refreshInterval&&window.clearInterval(this.refreshInterval)}async render(){let e=this.containerEl.children[1];e.empty(),e.addClass("eudia-calendar-view");let t=e.createDiv({cls:"eudia-calendar-header"});t.createEl("h4",{text:"Upcoming Meetings"});let s=t.createEl("button",{cls:"eudia-calendar-refresh"});if(s.innerHTML="\u21BB",s.title="Refresh",s.onclick=()=>this.render(),!this.plugin.settings.userEmail){e.createDiv({cls:"eudia-calendar-empty"}).createEl("p",{text:"Configure your email in plugin settings to see your calendar."});return}let i=e.createDiv({cls:"eudia-calendar-loading"});i.textContent="Loading calendar...";try{let a=await new S(this.plugin.settings.serverUrl,this.plugin.settings.userEmail).getWeekMeetings();if(i.remove(),!a.success||Object.keys(a.byDay).length===0){e.createDiv({cls:"eudia-calendar-empty"}).createEl("p",{text:a.error||"No upcoming meetings found."});return}let o=Object.keys(a.byDay).sort();for(let l of o){let d=a.byDay[l];if(d.length===0)continue;let g=e.createDiv({cls:"eudia-calendar-day"});g.createEl("div",{cls:"eudia-calendar-day-header",text:S.getDayName(l)});for(let u of d){let f=g.createDiv({cls:`eudia-calendar-meeting ${u.isCustomerMeeting?"customer":"internal"}`});f.createEl("div",{cls:"eudia-calendar-time",text:S.formatTime(u.start)});let p=f.createDiv({cls:"eudia-calendar-details"});p.createEl("div",{cls:"eudia-calendar-subject",text:u.subject}),u.accountName?p.createEl("div",{cls:"eudia-calendar-account",text:u.accountName}):u.attendees.length>0&&p.createEl("div",{cls:"eudia-calendar-attendees",text:u.attendees.slice(0,2).map(m=>m.name||m.email.split("@")[0]).join(", ")}),f.onclick=async()=>{await this.createNoteForMeeting(u)},f.title="Click to create meeting note"}}}catch(r){i.remove(),e.createDiv({cls:"eudia-calendar-error"}).createEl("p",{text:`Error loading calendar: ${r.message}`})}}async createNoteForMeeting(e){let t=e.start.split("T")[0],s=this.plugin.settings.accountsFolder;if(e.accountName){let f=e.accountName.replace(/[<>:"/\\|?*]/g,"_").replace(/\s+/g," ").trim(),p=`${this.plugin.settings.accountsFolder}/${f}`,m=this.app.vault.getAbstractFileByPath(p);m&&m instanceof c.TFolder&&(s=p)}let i=e.subject.replace(/[<>:"/\\|?*]/g,"_").replace(/\s+/g," ").trim().substring(0,50),r=`${t} ${i}.md`,a=`${s}/${r}`,o=this.app.vault.getAbstractFileByPath(a);if(o&&o instanceof c.TFile){await this.app.workspace.getLeaf().openFile(o);return}let l=e.attendees.map(f=>f.name||f.email.split("@")[0]).slice(0,5).join(", "),d=`---
title: ${e.subject}
date: ${t}
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

*To transcribe: Click the microphone icon or use Cmd/Ctrl+P \u2192 "Start Transcribing Meeting"*

`,g=await this.app.vault.create(a,d);await this.app.workspace.getLeaf().openFile(g),new c.Notice(`Created meeting note for ${e.subject}`)}},M=class extends c.PluginSettingTab{constructor(n,e){super(n,e),this.plugin=e}display(){let{containerEl:n}=this;if(n.empty(),n.createEl("h2",{text:"Eudia Sync & Scribe Settings"}),n.createEl("h3",{text:"Connection"}),new c.Setting(n).setName("GTM Brain Server URL").setDesc("The URL of your GTM Brain server").addText(t=>t.setPlaceholder("https://gtm-brain.onrender.com").setValue(this.plugin.settings.serverUrl).onChange(async s=>{this.plugin.settings.serverUrl=s,await this.plugin.saveSettings()})),new c.Setting(n).setName("OpenAI API Key").setDesc("Your OpenAI API key for transcription. Required if server is unavailable.").addText(t=>{t.setPlaceholder("sk-...").setValue(this.plugin.settings.openaiApiKey).onChange(async s=>{this.plugin.settings.openaiApiKey=s,await this.plugin.saveSettings()}),t.inputEl.type="password",t.inputEl.style.width="300px"}),n.createEl("h3",{text:"Folders"}),new c.Setting(n).setName("Accounts Folder").setDesc("Folder where account subfolders will be created").addText(t=>t.setPlaceholder("Accounts").setValue(this.plugin.settings.accountsFolder).onChange(async s=>{this.plugin.settings.accountsFolder=s||"Accounts",await this.plugin.saveSettings()})),new c.Setting(n).setName("Recordings Folder").setDesc("Folder where audio recordings will be saved").addText(t=>t.setPlaceholder("Recordings").setValue(this.plugin.settings.recordingsFolder).onChange(async s=>{this.plugin.settings.recordingsFolder=s||"Recordings",await this.plugin.saveSettings()})),n.createEl("h3",{text:"Recording"}),new c.Setting(n).setName("Save Audio Files").setDesc("Save the original audio recording alongside the note").addToggle(t=>t.setValue(this.plugin.settings.saveAudioFiles).onChange(async s=>{this.plugin.settings.saveAudioFiles=s,await this.plugin.saveSettings()})),new c.Setting(n).setName("Append Full Transcript").setDesc("Include the full transcript at the end of the structured summary").addToggle(t=>t.setValue(this.plugin.settings.appendTranscript).onChange(async s=>{this.plugin.settings.appendTranscript=s,await this.plugin.saveSettings()})),n.createEl("h3",{text:"Salesforce Sync"}),new c.Setting(n).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle(t=>t.setValue(this.plugin.settings.syncOnStartup).onChange(async s=>{this.plugin.settings.syncOnStartup=s,await this.plugin.saveSettings()})),new c.Setting(n).setName("Auto-Sync After Transcription").setDesc("Automatically sync meeting notes to Salesforce after transcription").addToggle(t=>t.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async s=>{this.plugin.settings.autoSyncAfterTranscription=s,await this.plugin.saveSettings()})),n.createEl("h3",{text:"Status"}),this.plugin.settings.lastSyncTime){let t=new Date(this.plugin.settings.lastSyncTime);n.createEl("p",{text:`Last synced: ${t.toLocaleString()}`,cls:"setting-item-description"})}n.createEl("p",{text:`Cached accounts: ${this.plugin.settings.cachedAccounts.length}`,cls:"setting-item-description"});let e=y.isSupported();n.createEl("p",{text:`Audio recording: ${e?"\u2713 Supported":"\u2717 Not supported"}`,cls:"setting-item-description"}),n.createEl("h3",{text:"Actions"}),new c.Setting(n).setName("Sync Accounts").setDesc("Manually sync Salesforce accounts and create folders").addButton(t=>t.setButtonText("Sync Now").setCta().onClick(async()=>{await this.plugin.syncAccounts(),this.display()})),new c.Setting(n).setName("Sync Current Note").setDesc("Push the current note's data to Salesforce").addButton(t=>t.setButtonText("Sync to Salesforce").onClick(async()=>{await this.plugin.syncNoteToSalesforce()})),new c.Setting(n).setName("Fetch Context").setDesc("Get pre-call context for the current note").addButton(t=>t.setButtonText("Fetch Context").onClick(async()=>{await this.plugin.fetchAndInsertContext()}))}};
