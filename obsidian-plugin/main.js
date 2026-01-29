var b=Object.defineProperty;var R=Object.getOwnPropertyDescriptor;var I=Object.getOwnPropertyNames;var F=Object.prototype.hasOwnProperty;var k=(u,n)=>{for(var e in n)b(u,e,{get:n[e],enumerable:!0})},$=(u,n,e,t)=>{if(n&&typeof n=="object"||typeof n=="function")for(let s of I(n))!F.call(u,s)&&s!==e&&b(u,s,{get:()=>n[s],enumerable:!(t=R(n,s))||t.enumerable});return u};var N=u=>$(b({},"__esModule",{value:!0}),u);var D={};k(D,{default:()=>w});module.exports=N(D);var o=require("obsidian");var g=class{constructor(){this.mediaRecorder=null;this.audioChunks=[];this.stream=null;this.startTime=0;this.pausedDuration=0;this.pauseStartTime=0;this.durationInterval=null;this.audioContext=null;this.analyser=null;this.levelInterval=null;this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0};this.stateCallback=null}onStateChange(n){this.stateCallback=n}getSupportedMimeType(){let n=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];for(let e of n)if(MediaRecorder.isTypeSupported(e))return e;return"audio/webm"}async startRecording(){if(this.state.isRecording)throw new Error("Already recording");try{this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0,sampleRate:44100}}),this.setupAudioAnalysis();let n=this.getSupportedMimeType();this.mediaRecorder=new MediaRecorder(this.stream,{mimeType:n,audioBitsPerSecond:48e3}),this.audioChunks=[],this.mediaRecorder.ondataavailable=e=>{e.data.size>0&&this.audioChunks.push(e.data)},this.mediaRecorder.start(1e3),this.startTime=Date.now(),this.pausedDuration=0,this.state={isRecording:!0,isPaused:!1,duration:0,audioLevel:0},this.startDurationTracking(),this.startLevelTracking(),this.notifyStateChange()}catch(n){throw this.cleanup(),new Error(`Failed to start recording: ${n.message}`)}}setupAudioAnalysis(){if(this.stream)try{this.audioContext=new AudioContext;let n=this.audioContext.createMediaStreamSource(this.stream);this.analyser=this.audioContext.createAnalyser(),this.analyser.fftSize=256,n.connect(this.analyser)}catch(n){console.warn("Failed to set up audio analysis:",n)}}startDurationTracking(){this.durationInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused){let n=Date.now()-this.startTime-this.pausedDuration;this.state.duration=Math.floor(n/1e3),this.notifyStateChange()}},100)}startLevelTracking(){if(!this.analyser)return;let n=new Uint8Array(this.analyser.frequencyBinCount);this.levelInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused&&this.analyser){this.analyser.getByteFrequencyData(n);let e=0;for(let s=0;s<n.length;s++)e+=n[s];let t=e/n.length;this.state.audioLevel=Math.min(100,Math.round(t/255*100*2)),this.notifyStateChange()}},50)}pauseRecording(){!this.state.isRecording||this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="recording"&&(this.mediaRecorder.pause(),this.pauseStartTime=Date.now(),this.state.isPaused=!0,this.notifyStateChange())}resumeRecording(){!this.state.isRecording||!this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="paused"&&(this.mediaRecorder.resume(),this.pausedDuration+=Date.now()-this.pauseStartTime,this.state.isPaused=!1,this.notifyStateChange())}async stopRecording(){return new Promise((n,e)=>{if(!this.mediaRecorder||!this.state.isRecording){e(new Error("Not currently recording"));return}let t=this.mediaRecorder.mimeType,s=this.state.duration,i=!1,r=setTimeout(()=>{if(!i){i=!0,console.warn("AudioRecorder: onstop timeout, forcing completion");try{let a=new Blob(this.audioChunks,{type:t}),c=new Date,l=c.toISOString().split("T")[0],d=c.toTimeString().split(" ")[0].replace(/:/g,"-"),p=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm",h=`recording-${l}-${d}.${p}`;this.cleanup(),n({audioBlob:a,duration:s,mimeType:t,filename:h})}catch{this.cleanup(),e(new Error("Failed to process recording after timeout"))}}},1e4);this.mediaRecorder.onstop=()=>{if(!i){i=!0,clearTimeout(r);try{let a=new Blob(this.audioChunks,{type:t}),c=new Date,l=c.toISOString().split("T")[0],d=c.toTimeString().split(" ")[0].replace(/:/g,"-"),p=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm",h=`recording-${l}-${d}.${p}`;this.cleanup(),n({audioBlob:a,duration:s,mimeType:t,filename:h})}catch(a){this.cleanup(),e(a)}}},this.mediaRecorder.onerror=a=>{i||(i=!0,clearTimeout(r),this.cleanup(),e(new Error("Recording error occurred")))},this.mediaRecorder.stop()})}cancelRecording(){this.cleanup()}cleanup(){this.durationInterval&&(clearInterval(this.durationInterval),this.durationInterval=null),this.levelInterval&&(clearInterval(this.levelInterval),this.levelInterval=null),this.audioContext&&(this.audioContext.close().catch(()=>{}),this.audioContext=null,this.analyser=null),this.stream&&(this.stream.getTracks().forEach(n=>n.stop()),this.stream=null),this.mediaRecorder=null,this.audioChunks=[],this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0},this.notifyStateChange()}getState(){return{...this.state}}static isSupported(){return!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder)}notifyStateChange(){this.stateCallback&&this.stateCallback({...this.state})}static formatDuration(n){let e=Math.floor(n/60),t=n%60;return`${e.toString().padStart(2,"0")}:${t.toString().padStart(2,"0")}`}static async blobToBase64(n){return new Promise((e,t)=>{let s=new FileReader;s.onload=()=>{let r=s.result.split(",")[1];e(r)},s.onerror=t,s.readAsDataURL(n)})}static async blobToArrayBuffer(n){return n.arrayBuffer()}};var y=require("obsidian");function A(u,n){let e="";return(n?.account||n?.opportunities?.length)&&(e=`
ACCOUNT CONTEXT (use to inform your analysis):
${n.account?`- Account: ${n.account.name}`:""}
${n.account?.owner?`- Account Owner: ${n.account.owner}`:""}
${n.opportunities?.length?`- Open Opportunities: ${n.opportunities.map(t=>`${t.name} (${t.stage}, $${(t.acv/1e3).toFixed(0)}k)`).join("; ")}`:""}
${n.contacts?.length?`- Known Contacts: ${n.contacts.slice(0,5).map(t=>`${t.name} - ${t.title}`).join("; ")}`:""}
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
- Action items have clear owners`}var f=class{constructor(n,e){this.openaiApiKey=null;this.serverUrl=n,this.openaiApiKey=e||null}setServerUrl(n){this.serverUrl=n}setOpenAIKey(n){this.openaiApiKey=n}async transcribeAndSummarize(n,e,t,s,i){try{let r=await(0,y.requestUrl)({url:`${this.serverUrl}/api/transcribe-and-summarize`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:n,mimeType:e,accountName:t,accountId:s,openaiApiKey:this.openaiApiKey,context:i?{customerBrain:i.account?.customerBrain,opportunities:i.opportunities,contacts:i.contacts}:void 0,systemPrompt:A(t,i)})});return r.json.success?{success:!0,transcript:r.json.transcript||"",sections:this.normalizeSections(r.json.sections),duration:r.json.duration||0}:r.json.error?.includes("OpenAI not initialized")&&this.openaiApiKey?(console.log("Server OpenAI unavailable, trying local fallback..."),this.transcribeLocal(n,e,t,i)):{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:r.json.error||"Transcription failed"}}catch(r){return console.error("Server transcription error:",r),this.openaiApiKey?(console.log("Server unreachable, trying local OpenAI fallback..."),this.transcribeLocal(n,e,t,i)):{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:`Server unavailable: ${r.message}. Add OpenAI API key in settings for offline mode.`}}}async transcribeLocal(n,e,t,s){if(!this.openaiApiKey)return{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:"No OpenAI API key configured. Add it in plugin settings."};try{let i=atob(n),r=new Uint8Array(i.length);for(let m=0;m<i.length;m++)r[m]=i.charCodeAt(m);let a=new Blob([r],{type:e}),c=new FormData,l=e.includes("webm")?"webm":e.includes("mp4")?"m4a":"ogg";c.append("file",a,`audio.${l}`),c.append("model","whisper-1"),c.append("response_format","verbose_json"),c.append("language","en");let d=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`},body:c});if(!d.ok){let m=await d.text();throw new Error(`Whisper API error: ${d.status} - ${m}`)}let p=await d.json(),h=p.text||"",x=p.duration||0,P=await this.summarizeLocal(h,t,s);return{success:!0,transcript:h,sections:P,duration:x}}catch(i){return console.error("Local transcription error:",i),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:i.message||"Local transcription failed"}}}async summarizeLocal(n,e,t){if(!this.openaiApiKey)return this.getEmptySections();try{let s=A(e,t),i=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o",messages:[{role:"system",content:s},{role:"user",content:`Analyze this meeting transcript:

${n.substring(0,1e5)}`}],temperature:.2,max_tokens:6e3})});if(!i.ok)return console.warn("GPT summarization failed, returning empty sections"),this.getEmptySections();let a=(await i.json()).choices?.[0]?.message?.content||"";return this.parseSections(a)}catch(s){return console.error("Local summarization error:",s),this.getEmptySections()}}parseSections(n){let e=this.getEmptySections(),t={summary:"summary",attendees:"attendees","meddicc signals":"meddiccSignals","product interest":"productInterest","pain points":"painPoints","buying triggers":"buyingTriggers","key dates":"keyDates","next steps":"nextSteps","action items":"actionItems","action items (internal)":"actionItems","deal signals":"dealSignals","risks & objections":"risksObjections","risks and objections":"risksObjections","competitive intelligence":"competitiveIntel"},s=/## ([^\n]+)\n([\s\S]*?)(?=## |$)/g,i;for(;(i=s.exec(n))!==null;){let r=i[1].trim().toLowerCase(),a=i[2].trim(),c=t[r];c&&(e[c]=a)}return e}normalizeSections(n){let e=this.getEmptySections();return n?{...e,...n}:e}async getMeetingContext(n){try{let e=await(0,y.requestUrl)({url:`${this.serverUrl}/api/meeting-context/${n}`,method:"GET",headers:{Accept:"application/json"}});return e.json.success?{success:!0,account:e.json.account,opportunities:e.json.opportunities,contacts:e.json.contacts,lastMeeting:e.json.lastMeeting}:{success:!1,error:e.json.error||"Failed to fetch context"}}catch(e){return console.error("Meeting context error:",e),{success:!1,error:e.message||"Network error"}}}async syncToSalesforce(n,e,t,s,i,r){try{let a=await(0,y.requestUrl)({url:`${this.serverUrl}/api/transcription/sync-to-salesforce`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:n,accountName:e,noteTitle:t,sections:s,transcript:i,meetingDate:r||new Date().toISOString(),syncedAt:new Date().toISOString()})});return a.json.success?{success:!0,customerBrainUpdated:a.json.customerBrainUpdated,eventCreated:a.json.eventCreated,eventId:a.json.eventId,contactsCreated:a.json.contactsCreated,tasksCreated:a.json.tasksCreated}:{success:!1,error:a.json.error||"Sync failed"}}catch(a){return console.error("Salesforce sync error:",a),{success:!1,error:a.message||"Network error"}}}getEmptySections(){return{summary:"",attendees:"",meddiccSignals:"",productInterest:"",painPoints:"",buyingTriggers:"",keyDates:"",nextSteps:"",actionItems:"",dealSignals:"",risksObjections:"",competitiveIntel:""}}static formatSectionsForNote(n,e){let t="";return n.summary&&(t+=`## Summary

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

`,e}};var M={serverUrl:"https://gtm-brain.onrender.com",accountsFolder:"Accounts",recordingsFolder:"Recordings",syncOnStartup:!0,autoSyncAfterTranscription:!0,saveAudioFiles:!0,appendTranscript:!1,lastSyncTime:null,cachedAccounts:[],userEmail:"",setupCompleted:!1,calendarConfigured:!1,openaiApiKey:""},C=class extends o.EditorSuggest{constructor(n,e){super(n),this.plugin=e}onTrigger(n,e,t){let s=e.getLine(n.line),i=e.getValue(),r=e.posToOffset(n),a=i.indexOf("---"),c=i.indexOf("---",a+3);if(a===-1||r<a||r>c)return null;let l=s.match(/^account:\s*(.*)$/);if(!l)return null;let d=l[1].trim(),p=s.indexOf(":")+1,h=s.substring(p).match(/^\s*/)?.[0].length||0;return{start:{line:n.line,ch:p+h},end:n,query:d}}getSuggestions(n){let e=n.query.toLowerCase(),t=this.plugin.settings.cachedAccounts;return e?t.filter(s=>s.name.toLowerCase().includes(e)).sort((s,i)=>{let r=s.name.toLowerCase().startsWith(e),a=i.name.toLowerCase().startsWith(e);return r&&!a?-1:a&&!r?1:s.name.localeCompare(i.name)}).slice(0,10):t.slice(0,10)}renderSuggestion(n,e){e.createEl("div",{text:n.name,cls:"suggestion-title"})}selectSuggestion(n,e){if(!this.context)return;this.context.editor.replaceRange(n.name,this.context.start,this.context.end)}},E=class{constructor(n,e,t,s){this.containerEl=null;this.durationEl=null;this.levelBarEl=null;this.statusTextEl=null;this.onPause=n,this.onResume=e,this.onStop=t,this.onCancel=s}show(){if(this.containerEl)return;this.containerEl=document.createElement("div"),this.containerEl.className="eudia-recording-bar recording";let n=document.createElement("div");n.className="eudia-recording-indicator",this.containerEl.appendChild(n),this.durationEl=document.createElement("div"),this.durationEl.className="eudia-duration",this.durationEl.textContent="00:00",this.containerEl.appendChild(this.durationEl);let e=document.createElement("div");e.className="eudia-level-container",this.levelBarEl=document.createElement("div"),this.levelBarEl.className="eudia-level-bar",this.levelBarEl.style.width="0%",e.appendChild(this.levelBarEl),this.containerEl.appendChild(e),this.statusTextEl=document.createElement("div"),this.statusTextEl.className="eudia-status-text",this.statusTextEl.textContent="Recording...",this.containerEl.appendChild(this.statusTextEl);let t=document.createElement("div");t.className="eudia-controls";let s=document.createElement("button");s.className="eudia-control-btn pause",s.innerHTML="\u23F8",s.title="Pause",s.onclick=()=>this.onPause(),t.appendChild(s);let i=document.createElement("button");i.className="eudia-control-btn stop",i.innerHTML="\u23F9",i.title="Stop & Transcribe",i.onclick=()=>this.onStop(),t.appendChild(i);let r=document.createElement("button");r.className="eudia-control-btn cancel",r.innerHTML="\u2715",r.title="Cancel",r.onclick=()=>this.onCancel(),t.appendChild(r),this.containerEl.appendChild(t),document.body.appendChild(this.containerEl)}hide(){this.containerEl&&(this.containerEl.remove(),this.containerEl=null)}updateState(n){this.containerEl&&(this.durationEl&&(this.durationEl.textContent=g.formatDuration(n.duration)),this.levelBarEl&&(this.levelBarEl.style.width=`${n.audioLevel}%`),n.isPaused?(this.containerEl.className="eudia-recording-bar paused",this.statusTextEl&&(this.statusTextEl.textContent="Paused")):(this.containerEl.className="eudia-recording-bar recording",this.statusTextEl&&(this.statusTextEl.textContent="Recording...")))}setProcessing(){if(!this.containerEl)return;this.containerEl.className="eudia-recording-bar processing",this.statusTextEl&&(this.statusTextEl.textContent="Transcribing..."),this.containerEl.querySelectorAll("button").forEach(e=>e.setAttribute("disabled","true"))}};var S=class extends o.Modal{constructor(n,e,t){super(n),this.plugin=e,this.onSelect=t}onOpen(){let{contentEl:n}=this;n.empty(),n.addClass("eudia-account-selector"),n.createEl("h3",{text:"Select Account for Meeting Note"}),this.searchInput=n.createEl("input",{type:"text",placeholder:"Search accounts..."}),this.searchInput.style.width="100%",this.searchInput.style.padding="10px",this.searchInput.style.marginBottom="10px",this.searchInput.style.borderRadius="6px",this.searchInput.style.border="1px solid var(--background-modifier-border)",this.resultsContainer=n.createDiv({cls:"eudia-account-results"}),this.resultsContainer.style.maxHeight="300px",this.resultsContainer.style.overflowY="auto",this.updateResults(""),this.searchInput.addEventListener("input",()=>{this.updateResults(this.searchInput.value)}),this.searchInput.focus()}updateResults(n){this.resultsContainer.empty();let e=this.plugin.settings.cachedAccounts,t=n.toLowerCase(),s=n?e.filter(i=>i.name.toLowerCase().includes(t)):e.slice(0,20);if(s.length===0){this.resultsContainer.createEl("div",{text:n?"No accounts found":'No accounts cached. Run "Sync Accounts" first.',cls:"eudia-no-results"}).style.padding="10px";return}for(let i of s.slice(0,20)){let r=this.resultsContainer.createEl("div",{cls:"eudia-account-item"});r.style.padding="8px 12px",r.style.cursor="pointer",r.style.borderRadius="4px",r.createEl("span",{text:i.name}),r.addEventListener("mouseenter",()=>{r.style.background="var(--background-modifier-hover)"}),r.addEventListener("mouseleave",()=>{r.style.background=""}),r.addEventListener("click",()=>{this.onSelect(i),this.close()})}}onClose(){let{contentEl:n}=this;n.empty()}},v=class extends o.Modal{constructor(n,e,t){super(n),this.plugin=e,this.onComplete=t}onOpen(){let{contentEl:n}=this;n.empty(),n.addClass("eudia-setup-wizard"),n.createEl("h2",{text:"Welcome to Eudia Sales Intelligence"}),n.createEl("p",{text:"Quick setup to get you recording meetings and syncing to Salesforce.",cls:"setting-item-description"});let e=n.createDiv({cls:"eudia-setup-section"});e.createEl("h3",{text:"1. Enter Your Email"}),e.createEl("p",{text:"Your Eudia work email (used for calendar sync)",cls:"setting-item-description"}),this.emailInput=e.createEl("input",{type:"email",placeholder:"yourname@eudia.com",cls:"eudia-email-input"}),this.emailInput.style.width="100%",this.emailInput.style.padding="8px 12px",this.emailInput.style.marginTop="8px",this.emailInput.style.borderRadius="6px",this.emailInput.style.border="1px solid var(--background-modifier-border)";let t=n.createDiv({cls:"eudia-setup-section"});t.style.marginTop="20px",t.createEl("h3",{text:"2. What Gets Configured"});let s=t.createEl("ul");s.style.fontSize="13px",s.style.color="var(--text-muted)",["Salesforce account folders synced","Calendar connected for meeting context","Recording, transcription, and summary ready","Auto-sync to Salesforce Customer Brain"].forEach(l=>s.createEl("li",{text:l})),this.statusEl=n.createDiv({cls:"eudia-setup-status"}),this.statusEl.style.marginTop="16px",this.statusEl.style.padding="12px",this.statusEl.style.borderRadius="8px",this.statusEl.style.display="none";let r=n.createDiv({cls:"eudia-setup-buttons"});r.style.marginTop="24px",r.style.display="flex",r.style.justifyContent="flex-end",r.style.gap="12px";let a=r.createEl("button",{text:"Skip for Now"});a.onclick=()=>this.close();let c=r.createEl("button",{text:"Complete Setup",cls:"mod-cta"});c.onclick=()=>this.runSetup()}async runSetup(){let n=this.emailInput.value.trim().toLowerCase();if(!n||!n.includes("@")){this.showStatus("Please enter a valid email address","error");return}this.showStatus("Setting up...","info");try{this.plugin.settings.userEmail=n,await this.plugin.saveSettings(),this.showStatus("Syncing Salesforce accounts...","info"),await this.plugin.syncAccounts(!0),this.showStatus("Configuring calendar...","info"),await this.configureCalendar(n),this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.showStatus("Setup complete. You're ready to record meetings.","success"),setTimeout(()=>{this.close(),this.onComplete(),new o.Notice("Eudia is ready. Click the mic icon to record.")},1500)}catch(e){this.showStatus(`Setup failed: ${e.message}`,"error")}}async configureCalendar(n){try{let e=".obsidian/plugins/full-calendar/data.json",t=this.app.vault.getAbstractFileByPath(e),i={defaultCalendar:0,recursiveLocal:!1,calendars:[{type:"ical",name:"Work Calendar",url:`${this.plugin.settings.serverUrl}/api/calendar/${n}/feed.ics`,color:"#8e99e1"}],firstDay:0,initialView:{desktop:"timeGridWeek",mobile:"timeGrid3Days"}};t&&t instanceof o.TFile?await this.app.vault.modify(t,JSON.stringify(i,null,2)):(this.app.vault.getAbstractFileByPath(".obsidian/plugins/full-calendar")||await this.app.vault.createFolder(".obsidian/plugins/full-calendar"),await this.app.vault.create(e,JSON.stringify(i,null,2))),this.plugin.settings.calendarConfigured=!0}catch(e){console.warn("Could not configure Full Calendar:",e)}}showStatus(n,e){this.statusEl.style.display="block",this.statusEl.textContent=n,e==="success"?(this.statusEl.style.background="var(--background-modifier-success)",this.statusEl.style.color="var(--text-success)"):e==="error"?(this.statusEl.style.background="var(--background-modifier-error)",this.statusEl.style.color="var(--text-error)"):(this.statusEl.style.background="var(--background-secondary)",this.statusEl.style.color="var(--text-muted)")}onClose(){let{contentEl:n}=this;n.empty()}},w=class extends o.Plugin{constructor(){super(...arguments);this.recordingStatusBar=null;this.ribbonIcon=null;this.isRecording=!1;this.isPaused=!1}async onload(){await this.loadSettings(),this.audioRecorder=new g,this.transcriptionService=new f(this.settings.serverUrl,this.settings.openaiApiKey),this.audioRecorder.onStateChange(e=>{this.recordingStatusBar&&this.recordingStatusBar.updateState(e)}),this.accountSuggester=new C(this.app,this),this.registerEditorSuggest(this.accountSuggester),this.ribbonIcon=this.addRibbonIcon("microphone","Record Meeting",async()=>{await this.toggleRecording()}),this.addRibbonIcon("refresh-cw","Sync Salesforce Accounts",async()=>{await this.syncAccounts()}),this.addCommand({id:"start-recording",name:"Start Recording",callback:async()=>{this.isRecording||await this.startRecording()}}),this.addCommand({id:"stop-recording",name:"Stop Recording & Transcribe",callback:async()=>{this.isRecording&&await this.stopRecording()}}),this.addCommand({id:"toggle-recording",name:"Toggle Recording",callback:async()=>{await this.toggleRecording()}}),this.addCommand({id:"pause-recording",name:"Pause/Resume Recording",callback:()=>{this.isRecording&&this.togglePause()}}),this.addCommand({id:"sync-salesforce-accounts",name:"Sync Salesforce Accounts",callback:async()=>{await this.syncAccounts()}}),this.addCommand({id:"sync-note-to-salesforce",name:"Sync Current Note to Salesforce",callback:async()=>{await this.syncNoteToSalesforce()}}),this.addCommand({id:"fetch-meeting-context",name:"Fetch Pre-Call Context",callback:async()=>{await this.fetchAndInsertContext()}}),this.addCommand({id:"create-meeting-note",name:"Create New Meeting Note",callback:async()=>{await this.createMeetingNote()}}),this.registerEvent(this.app.vault.on("create",async e=>{e instanceof o.TFile&&e.extension==="md"&&e.path.startsWith(this.settings.accountsFolder+"/")&&(await this.app.vault.read(e)).trim()===""&&await this.applyMeetingTemplate(e)})),this.addSettingTab(new T(this.app,this)),this.addCommand({id:"run-setup-wizard",name:"Run Setup Wizard",callback:()=>{new v(this.app,this,()=>{}).open()}}),this.settings.setupCompleted?this.settings.syncOnStartup&&setTimeout(()=>{this.syncAccounts(!0)},2e3):setTimeout(()=>{new v(this.app,this,()=>{this.syncAccounts(!0)}).open()},1500)}async loadSettings(){this.settings=Object.assign({},M,await this.loadData())}async saveSettings(){await this.saveData(this.settings),this.transcriptionService&&(this.transcriptionService.setServerUrl(this.settings.serverUrl),this.transcriptionService.setOpenAIKey(this.settings.openaiApiKey))}async toggleRecording(){this.isRecording?await this.stopRecording():await this.startRecording()}async startRecording(){if(this.isRecording)return;if(!g.isSupported()){new o.Notice("Audio recording is not supported in this browser");return}let e=this.app.workspace.getActiveFile();if(!e){new o.Notice("Please open or create a note first");return}try{await this.audioRecorder.startRecording(),this.isRecording=!0,this.isPaused=!1,this.ribbonIcon&&this.ribbonIcon.addClass("eudia-ribbon-recording"),this.recordingStatusBar=new E(()=>this.togglePause(),()=>this.togglePause(),()=>this.stopRecording(),()=>this.cancelRecording()),this.recordingStatusBar.show(),new o.Notice("Recording started"),this.autoDetectCurrentMeeting(e)}catch(t){new o.Notice(`Failed to start recording: ${t.message}`),this.isRecording=!1}}async autoDetectCurrentMeeting(e){if(this.settings.userEmail)try{let t=await(0,o.requestUrl)({url:`${this.settings.serverUrl}/api/calendar/${this.settings.userEmail}/today`,method:"GET",headers:{Accept:"application/json"}});if(!t.json.success||!t.json.meetings?.length)return;let s=new Date,r=t.json.meetings.find(c=>{let l=new Date(c.start),d=new Date(c.end),p=new Date(l.getTime()-15*60*1e3);return s>=p&&s<=d});if(!r)return;let a=r.attendees?.filter(c=>!c.email?.includes("@eudia.com"))?.map(c=>c.name||c.email)?.slice(0,5)?.join(", ")||"";await this.updateFrontmatter(e,{meeting_title:r.subject,attendees:a,meeting_start:r.start}),console.log("Auto-detected meeting:",r.subject)}catch(t){console.warn("Calendar auto-detect failed:",t.message)}}async stopRecording(){if(this.isRecording)try{this.recordingStatusBar&&this.recordingStatusBar.setProcessing();let e=await this.audioRecorder.stopRecording();this.isRecording=!1,this.isPaused=!1,this.recordingStatusBar&&(this.recordingStatusBar.hide(),this.recordingStatusBar=null),this.ribbonIcon&&this.ribbonIcon.removeClass("eudia-ribbon-recording");let t=this.app.workspace.getActiveFile();if(!t){new o.Notice("No active file to save transcription");return}await this.insertProcessingPlaceholder(t),new o.Notice("Processing audio... You can continue working."),this.processRecordingInBackground(e,t)}catch(e){this.isRecording=!1,this.recordingStatusBar&&(this.recordingStatusBar.hide(),this.recordingStatusBar=null),this.ribbonIcon&&this.ribbonIcon.removeClass("eudia-ribbon-recording"),new o.Notice(`Error stopping recording: ${e.message}`)}}async insertProcessingPlaceholder(e){let t=await this.app.vault.read(e),s=`
---

> **Transcription in progress...**  
> Your audio is being processed. This section will update automatically when complete.

---

`,i=t.match(/^(---\n[\s\S]*?\n---\n)?# [^\n]+\n/);if(i){let r=i[0].length;t=t.substring(0,r)+s+t.substring(r)}else{let r=t.match(/^---\n[\s\S]*?\n---\n/);if(r){let a=r[0].length;t=t.substring(0,a)+s+t.substring(a)}else t=s+t}await this.app.vault.modify(e,t)}async processRecordingInBackground(e,t){try{let s=this.detectAccountFromPath(t.path),i;s&&(i=await this.transcriptionService.getMeetingContext(s.id));let r=await g.blobToBase64(e.audioBlob),a;this.settings.saveAudioFiles&&(a=await this.saveAudioFile(e,t));let c=await this.transcriptionService.transcribeAndSummarize(r,e.mimeType,s?.name,s?.id,i);if(!c.success){await this.replaceProcessingPlaceholder(t,`> **Transcription failed:** ${c.error}
> 
> Try recording again or check your settings.`),new o.Notice(`Transcription failed: ${c.error}`);return}await this.insertTranscriptionResults(t,c,a),new o.Notice("Transcription complete"),this.settings.autoSyncAfterTranscription&&s&&(await this.transcriptionService.syncToSalesforce(s.id,s.name,t.basename,c.sections,c.transcript),new o.Notice("Synced to Salesforce"))}catch(s){console.error("Background transcription error:",s),new o.Notice(`Transcription failed: ${s.message}`);try{await this.replaceProcessingPlaceholder(t,`> **Transcription failed:** ${s.message}`)}catch{}}}async replaceProcessingPlaceholder(e,t){let s=await this.app.vault.read(e),i=/\n---\n\n> \*\*Transcription in progress\.\.\.\*\*[\s\S]*?\n\n---\n/;i.test(s)&&(s=s.replace(i,`
${t}

`),await this.app.vault.modify(e,s))}togglePause(){this.isRecording&&(this.isPaused?(this.audioRecorder.resumeRecording(),this.isPaused=!1):(this.audioRecorder.pauseRecording(),this.isPaused=!0))}cancelRecording(){this.isRecording&&(this.audioRecorder.cancelRecording(),this.isRecording=!1,this.isPaused=!1,this.recordingStatusBar&&(this.recordingStatusBar.hide(),this.recordingStatusBar=null),this.ribbonIcon&&this.ribbonIcon.removeClass("eudia-ribbon-recording"),new o.Notice("Recording cancelled"))}async processRecording(e,t){let s=this.app.workspace.getActiveFile();if(!s)throw new Error("No active file");let i=this.detectAccountFromPath(s.path),r;i&&(t.setMessage("Fetching account context..."),r=await this.transcriptionService.getMeetingContext(i.id)),t.setMessage("Preparing audio...");let a=await g.blobToBase64(e.audioBlob),c;this.settings.saveAudioFiles&&(t.setMessage("Saving audio file..."),c=await this.saveAudioFile(e,s)),t.setMessage("Transcribing audio...");let l=await this.transcriptionService.transcribeAndSummarize(a,e.mimeType,i?.name,i?.id,r);if(!l.success)throw new Error(l.error||"Transcription failed");t.setMessage("Updating note..."),await this.insertTranscriptionResults(s,l,c),this.settings.autoSyncAfterTranscription&&i&&(t.setMessage("Syncing to Salesforce..."),await this.transcriptionService.syncToSalesforce(i.id,i.name,s.basename,l.sections,l.transcript))}detectAccountFromPath(e){let t=this.settings.accountsFolder;if(!e.startsWith(t+"/"))return null;let i=e.substring(t.length+1).split("/")[0];return i&&this.settings.cachedAccounts.find(a=>this.sanitizeFolderName(a.name).toLowerCase()===i.toLowerCase())||null}async saveAudioFile(e,t){try{await this.ensureFolderExists(this.settings.recordingsFolder);let s=`${t.basename}-${e.filename}`,i=`${this.settings.recordingsFolder}/${s}`,r=await g.blobToArrayBuffer(e.audioBlob);return await this.app.vault.createBinary(i,r),s}catch(s){console.warn("Failed to save audio file:",s);return}}async insertTranscriptionResults(e,t,s){let i=await this.app.vault.read(e),r=/\n---\n\n> \*\*Transcription in progress\.\.\.\*\*[\s\S]*?\n\n---\n/;i=i.replace(r,`
`);let a=f.formatSectionsWithAudio(t.sections,this.settings.appendTranscript?t.transcript:void 0,s),c=i.match(/^---\n[\s\S]*?\n---\n/),l=i.match(/^(---\n[\s\S]*?\n---\n)?# [^\n]+\n/);if(l){let d=l[0].length;i=i.substring(0,d)+`
`+a+i.substring(d)}else if(c){let d=c[0].length;i=i.substring(0,d)+`
`+a+i.substring(d)}else i=a+i;await this.app.vault.modify(e,i),await this.updateFrontmatter(e,{transcribed:!0,transcribed_at:new Date().toISOString(),duration_seconds:t.duration})}async createMeetingNote(){new S(this.app,this,async e=>{if(!e){new o.Notice("No account selected");return}let s=new Date().toISOString().split("T")[0],i=`${s} Meeting.md`,r=`${this.settings.accountsFolder}/${this.sanitizeFolderName(e.name)}`;await this.ensureFolderExists(r);let a=`${r}/${i}`,c=this.app.vault.getAbstractFileByPath(a);if(c){await this.app.workspace.getLeaf().openFile(c);return}let l=this.getMeetingTemplate(e.name,s),d=await this.app.vault.create(a,l);await this.app.workspace.getLeaf().openFile(d),new o.Notice(`Created meeting note for ${e.name}`)}).open()}async applyMeetingTemplate(e){let t=this.detectAccountFromPath(e.path);if(!t)return;let s=new Date().toISOString().split("T")[0],i=this.getMeetingTemplate(t.name,s);await this.app.vault.modify(e,i)}getMeetingTemplate(e,t){return`---
title: Meeting with ${e}
date: ${t}
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

`}async fetchAndInsertContext(){let e=this.app.workspace.getActiveFile();if(!e){new o.Notice("No active note");return}let t=this.detectAccountFromPath(e.path);if(!t){new o.Notice("Could not detect account from folder path");return}new o.Notice("Fetching meeting context...");let s=await this.transcriptionService.getMeetingContext(t.id);if(!s.success){new o.Notice(`Failed to fetch context: ${s.error}`);return}let i=f.formatContextForNote(s),r=await this.app.vault.read(e),a=r.match(/^(---\n[\s\S]*?\n---\n)?# [^\n]+\n/);if(a){let c=a[0].length;r=r.substring(0,c)+`
`+i+r.substring(c)}else r=i+r;await this.app.vault.modify(e,r),new o.Notice("Meeting context added")}async syncAccounts(e=!1){try{e||new o.Notice("Syncing Salesforce accounts...");let t=await this.fetchAccounts();if(t.length===0){e||new o.Notice("No accounts found or server unavailable");return}this.settings.cachedAccounts=t,await this.ensureFolderExists(this.settings.accountsFolder);let s=this.getExistingAccountFolders(),i=0;for(let r of t){let a=this.sanitizeFolderName(r.name),c=`${this.settings.accountsFolder}/${a}`;s.includes(a.toLowerCase())||(await this.ensureFolderExists(c),i++)}this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings(),e||(i>0?new o.Notice(`Sync complete! Created ${i} new account folders. ${t.length} accounts available for autocomplete.`):new o.Notice(`Sync complete. All ${t.length} accounts ready for autocomplete.`))}catch(t){console.error("Eudia Sync error:",t),e||new o.Notice(`Sync failed: ${t.message}`)}}async fetchAccounts(){try{let t=(await(0,o.requestUrl)({url:`${this.settings.serverUrl}/api/accounts/obsidian`,method:"GET",headers:{Accept:"application/json"}})).json;if(!t.success)throw new Error("API returned unsuccessful response");return t.accounts||[]}catch(e){throw console.error("Failed to fetch accounts:",e),new Error("Could not connect to GTM Brain server")}}async syncNoteToSalesforce(){let e=this.app.workspace.getActiveFile();if(!e){new o.Notice("No active note to sync");return}try{let t=await this.app.vault.read(e),s=this.parseFrontmatter(t),i=null;if(s.account&&(i=this.settings.cachedAccounts.find(a=>a.name.toLowerCase()===s.account.toLowerCase())||null),i||(i=this.detectAccountFromPath(e.path)),!i){new o.Notice('No account found. Add an "account" property or move note to an account folder.',5e3),new S(this.app,this,async a=>{a&&(await this.updateFrontmatter(e,{account:a.name}),new o.Notice(`Account set to ${a.name}. Try syncing again.`))}).open();return}new o.Notice("Syncing note to Salesforce...");let r=await(0,o.requestUrl)({url:`${this.settings.serverUrl}/api/notes/sync`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:i.id,accountName:i.name,noteTitle:e.basename,notePath:e.path,content:t,frontmatter:s,syncedAt:new Date().toISOString()})});r.json.success?(new o.Notice("Note synced to Salesforce"),await this.updateFrontmatter(e,{synced_to_salesforce:!0,last_synced:new Date().toISOString()})):new o.Notice(`Sync failed: ${r.json.error||"Unknown error"}`)}catch(t){console.error("Sync to Salesforce failed:",t),new o.Notice(`Sync failed: ${t.message}`)}}parseFrontmatter(e){let t=e.match(/^---\n([\s\S]*?)\n---/);if(!t)return{};let s={},i=t[1].split(`
`);for(let r of i){let a=r.indexOf(":");if(a>0){let c=r.substring(0,a).trim(),l=r.substring(a+1).trim();s[c]=l}}return s}async updateFrontmatter(e,t){let s=await this.app.vault.read(e),i=s.match(/^---\n([\s\S]*?)\n---/);if(i){let r=i[1];for(let[a,c]of Object.entries(t)){let l=new RegExp(`^${a}:.*$`,"m"),d=`${a}: ${c}`;l.test(r)?r=r.replace(l,d):r+=`
${d}`}s=s.replace(/^---\n[\s\S]*?\n---/,`---
${r}
---`),await this.app.vault.modify(e,s)}}getExistingAccountFolders(){let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);return!e||!(e instanceof o.TFolder)?[]:e.children.filter(t=>t instanceof o.TFolder).map(t=>t.name.toLowerCase())}async ensureFolderExists(e){this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e)}sanitizeFolderName(e){return e.replace(/[<>:"/\\|?*]/g,"_").replace(/\s+/g," ").trim()}},T=class extends o.PluginSettingTab{constructor(n,e){super(n,e),this.plugin=e}display(){let{containerEl:n}=this;if(n.empty(),n.createEl("h2",{text:"Eudia Sync & Scribe Settings"}),n.createEl("h3",{text:"Connection"}),new o.Setting(n).setName("GTM Brain Server URL").setDesc("The URL of your GTM Brain server").addText(t=>t.setPlaceholder("https://gtm-brain.onrender.com").setValue(this.plugin.settings.serverUrl).onChange(async s=>{this.plugin.settings.serverUrl=s,await this.plugin.saveSettings()})),new o.Setting(n).setName("OpenAI API Key").setDesc("Your OpenAI API key for transcription. Required if server is unavailable.").addText(t=>{t.setPlaceholder("sk-...").setValue(this.plugin.settings.openaiApiKey).onChange(async s=>{this.plugin.settings.openaiApiKey=s,await this.plugin.saveSettings()}),t.inputEl.type="password",t.inputEl.style.width="300px"}),n.createEl("h3",{text:"Folders"}),new o.Setting(n).setName("Accounts Folder").setDesc("Folder where account subfolders will be created").addText(t=>t.setPlaceholder("Accounts").setValue(this.plugin.settings.accountsFolder).onChange(async s=>{this.plugin.settings.accountsFolder=s||"Accounts",await this.plugin.saveSettings()})),new o.Setting(n).setName("Recordings Folder").setDesc("Folder where audio recordings will be saved").addText(t=>t.setPlaceholder("Recordings").setValue(this.plugin.settings.recordingsFolder).onChange(async s=>{this.plugin.settings.recordingsFolder=s||"Recordings",await this.plugin.saveSettings()})),n.createEl("h3",{text:"Recording"}),new o.Setting(n).setName("Save Audio Files").setDesc("Save the original audio recording alongside the note").addToggle(t=>t.setValue(this.plugin.settings.saveAudioFiles).onChange(async s=>{this.plugin.settings.saveAudioFiles=s,await this.plugin.saveSettings()})),new o.Setting(n).setName("Append Full Transcript").setDesc("Include the full transcript at the end of the structured summary").addToggle(t=>t.setValue(this.plugin.settings.appendTranscript).onChange(async s=>{this.plugin.settings.appendTranscript=s,await this.plugin.saveSettings()})),n.createEl("h3",{text:"Salesforce Sync"}),new o.Setting(n).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle(t=>t.setValue(this.plugin.settings.syncOnStartup).onChange(async s=>{this.plugin.settings.syncOnStartup=s,await this.plugin.saveSettings()})),new o.Setting(n).setName("Auto-Sync After Transcription").setDesc("Automatically sync meeting notes to Salesforce after transcription").addToggle(t=>t.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async s=>{this.plugin.settings.autoSyncAfterTranscription=s,await this.plugin.saveSettings()})),n.createEl("h3",{text:"Status"}),this.plugin.settings.lastSyncTime){let t=new Date(this.plugin.settings.lastSyncTime);n.createEl("p",{text:`Last synced: ${t.toLocaleString()}`,cls:"setting-item-description"})}n.createEl("p",{text:`Cached accounts: ${this.plugin.settings.cachedAccounts.length}`,cls:"setting-item-description"});let e=g.isSupported();n.createEl("p",{text:`Audio recording: ${e?"\u2713 Supported":"\u2717 Not supported"}`,cls:"setting-item-description"}),n.createEl("h3",{text:"Actions"}),new o.Setting(n).setName("Sync Accounts").setDesc("Manually sync Salesforce accounts and create folders").addButton(t=>t.setButtonText("Sync Now").setCta().onClick(async()=>{await this.plugin.syncAccounts(),this.display()})),new o.Setting(n).setName("Sync Current Note").setDesc("Push the current note's data to Salesforce").addButton(t=>t.setButtonText("Sync to Salesforce").onClick(async()=>{await this.plugin.syncNoteToSalesforce()})),new o.Setting(n).setName("Fetch Context").setDesc("Get pre-call context for the current note").addButton(t=>t.setButtonText("Fetch Context").onClick(async()=>{await this.plugin.fetchAndInsertContext()}))}};
