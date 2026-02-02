var I=Object.defineProperty;var O=Object.getOwnPropertyDescriptor;var F=Object.getOwnPropertyNames;var j=Object.prototype.hasOwnProperty;var U=(h,t)=>{for(var e in t)I(h,e,{get:t[e],enumerable:!0})},B=(h,t,e,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let s of F(t))!j.call(h,s)&&s!==e&&I(h,s,{get:()=>t[s],enumerable:!(n=O(t,s))||n.enumerable});return h};var z=h=>B(I({},"__esModule",{value:!0}),h);var Y={};U(Y,{default:()=>x});module.exports=z(Y);var c=require("obsidian");var w=class{constructor(){this.mediaRecorder=null;this.audioChunks=[];this.stream=null;this.startTime=0;this.pausedDuration=0;this.pauseStartTime=0;this.durationInterval=null;this.audioContext=null;this.analyser=null;this.levelInterval=null;this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0};this.stateCallback=null}onStateChange(t){this.stateCallback=t}getSupportedMimeType(){let t=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];for(let e of t)if(MediaRecorder.isTypeSupported(e))return e;return"audio/webm"}async startRecording(){if(this.state.isRecording)throw new Error("Already recording");try{this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0,sampleRate:48e3,channelCount:1}}),this.setupAudioAnalysis();let t=this.getSupportedMimeType();this.mediaRecorder=new MediaRecorder(this.stream,{mimeType:t,audioBitsPerSecond:96e3}),this.audioChunks=[],this.mediaRecorder.ondataavailable=e=>{e.data.size>0&&this.audioChunks.push(e.data)},this.mediaRecorder.start(1e3),this.startTime=Date.now(),this.pausedDuration=0,this.state={isRecording:!0,isPaused:!1,duration:0,audioLevel:0},this.startDurationTracking(),this.startLevelTracking(),this.notifyStateChange()}catch(t){throw this.cleanup(),new Error(`Failed to start recording: ${t.message}`)}}setupAudioAnalysis(){if(this.stream)try{this.audioContext=new AudioContext;let t=this.audioContext.createMediaStreamSource(this.stream);this.analyser=this.audioContext.createAnalyser(),this.analyser.fftSize=256,t.connect(this.analyser)}catch(t){console.warn("Failed to set up audio analysis:",t)}}startDurationTracking(){this.durationInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused){let t=Date.now()-this.startTime-this.pausedDuration;this.state.duration=Math.floor(t/1e3),this.notifyStateChange()}},100)}startLevelTracking(){if(!this.analyser)return;let t=new Uint8Array(this.analyser.frequencyBinCount);this.levelInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused&&this.analyser){this.analyser.getByteFrequencyData(t);let e=0;for(let s=0;s<t.length;s++)e+=t[s];let n=e/t.length;this.state.audioLevel=Math.min(100,Math.round(n/255*100*2)),this.notifyStateChange()}},50)}pauseRecording(){!this.state.isRecording||this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="recording"&&(this.mediaRecorder.pause(),this.pauseStartTime=Date.now(),this.state.isPaused=!0,this.notifyStateChange())}resumeRecording(){!this.state.isRecording||!this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="paused"&&(this.mediaRecorder.resume(),this.pausedDuration+=Date.now()-this.pauseStartTime,this.state.isPaused=!1,this.notifyStateChange())}async stopRecording(){return new Promise((t,e)=>{if(!this.mediaRecorder||!this.state.isRecording){e(new Error("Not currently recording"));return}let n=this.mediaRecorder.mimeType,s=this.state.duration,i=!1,r=setTimeout(()=>{if(!i){i=!0,console.warn("AudioRecorder: onstop timeout, forcing completion");try{let a=new Blob(this.audioChunks,{type:n}),o=new Date,u=o.toISOString().split("T")[0],g=o.toTimeString().split(" ")[0].replace(/:/g,"-"),l=n.includes("webm")?"webm":n.includes("mp4")?"m4a":n.includes("ogg")?"ogg":"webm",p=`recording-${u}-${g}.${l}`;this.cleanup(),t({audioBlob:a,duration:s,mimeType:n,filename:p})}catch{this.cleanup(),e(new Error("Failed to process recording after timeout"))}}},1e4);this.mediaRecorder.onstop=()=>{if(!i){i=!0,clearTimeout(r);try{console.log(`[AudioRecorder] Chunks collected: ${this.audioChunks.length}`);let a=new Blob(this.audioChunks,{type:n});console.log(`[AudioRecorder] Blob size: ${a.size} bytes`);let o=new Date,u=o.toISOString().split("T")[0],g=o.toTimeString().split(" ")[0].replace(/:/g,"-"),l=n.includes("webm")?"webm":n.includes("mp4")?"m4a":n.includes("ogg")?"ogg":"webm",p=`recording-${u}-${g}.${l}`;this.cleanup(),t({audioBlob:a,duration:s,mimeType:n,filename:p})}catch(a){this.cleanup(),e(a)}}},this.mediaRecorder.onerror=a=>{i||(i=!0,clearTimeout(r),this.cleanup(),e(new Error("Recording error occurred")))},this.mediaRecorder.state==="recording"&&this.mediaRecorder.requestData(),setTimeout(()=>{this.mediaRecorder&&this.mediaRecorder.state!=="inactive"&&this.mediaRecorder.stop()},100)})}cancelRecording(){this.cleanup()}cleanup(){this.durationInterval&&(clearInterval(this.durationInterval),this.durationInterval=null),this.levelInterval&&(clearInterval(this.levelInterval),this.levelInterval=null),this.audioContext&&(this.audioContext.close().catch(()=>{}),this.audioContext=null,this.analyser=null),this.stream&&(this.stream.getTracks().forEach(t=>t.stop()),this.stream=null),this.mediaRecorder=null,this.audioChunks=[],this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0},this.notifyStateChange()}getState(){return{...this.state}}static isSupported(){return!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder)}notifyStateChange(){this.stateCallback&&this.stateCallback({...this.state})}static formatDuration(t){let e=Math.floor(t/60),n=t%60;return`${e.toString().padStart(2,"0")}:${n.toString().padStart(2,"0")}`}static async blobToBase64(t){return new Promise((e,n)=>{let s=new FileReader;s.onload=()=>{let r=s.result.split(",")[1];e(r)},s.onerror=n,s.readAsDataURL(t)})}static async blobToArrayBuffer(t){return t.arrayBuffer()}async start(){return this.startRecording()}async stop(){return this.stopRecording()}pause(){return this.pauseRecording()}resume(){return this.resumeRecording()}cancel(){return this.cancelRecording()}isRecording(){return this.state.isRecording}};var b=require("obsidian");var $=class{constructor(){this.salesforceAccounts=[]}setAccounts(t){this.salesforceAccounts=t}detectAccount(t,e,n){if(t){let s=this.detectFromTitle(t);if(s.confidence>=70)return s}if(n){let s=this.detectFromFilePath(n);if(s.confidence>=70)return s}if(e&&e.length>0){let s=this.detectFromAttendees(e);if(s.confidence>=50)return s}return{account:null,accountId:null,confidence:0,source:"none",evidence:"No account detected from available context"}}detectFromTitle(t){if(!t)return{account:null,accountId:null,confidence:0,source:"title",evidence:"No title"};let e=[{regex:/^([A-Za-z0-9][^-–—]+?)\s*[-–—]\s*(?:[A-Z][a-z]+|[A-Za-z]{2,})/,confidence:85},{regex:/(?:call|meeting|sync|check-in|demo|discovery)\s+(?:with|re:?|@)\s+([^-–—]+?)(?:\s*[-–—]|$)/i,confidence:80},{regex:/^([A-Za-z][^-–—]+?)\s+(?:discovery|demo|review|kickoff|intro|onboarding|sync)\s*(?:call)?$/i,confidence:75},{regex:/^([^:]+?):\s+/i,confidence:70},{regex:/^\[([^\]]+)\]/,confidence:75}],n=["weekly","daily","monthly","internal","team","1:1","one on one","standup","sync","meeting","call","notes","monday","tuesday","wednesday","thursday","friday","untitled","new","test"];for(let s of e){let i=t.match(s.regex);if(i&&i[1]){let r=i[1].trim();if(n.some(o=>r.toLowerCase()===o)||r.length<2)continue;let a=this.fuzzyMatchSalesforce(r);return a?{account:a.name,accountId:a.id,confidence:Math.min(s.confidence+10,100),source:"salesforce_match",evidence:`Matched "${r}" from title to Salesforce account "${a.name}"`}:{account:r,accountId:null,confidence:s.confidence,source:"title",evidence:"Extracted from meeting title pattern"}}}return{account:null,accountId:null,confidence:0,source:"title",evidence:"No pattern matched"}}detectFromFilePath(t){let e=t.match(/Accounts\/([^\/]+)\//i);if(e&&e[1]){let n=e[1].trim(),s=this.fuzzyMatchSalesforce(n);return s?{account:s.name,accountId:s.id,confidence:95,source:"salesforce_match",evidence:`File in account folder "${n}" matched to "${s.name}"`}:{account:n,accountId:null,confidence:85,source:"title",evidence:`File located in Accounts/${n} folder`}}return{account:null,accountId:null,confidence:0,source:"none",evidence:"Not in Accounts folder"}}detectFromAttendees(t){let e=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com"],n=new Set;for(let a of t){let u=a.toLowerCase().match(/@([a-z0-9.-]+)/);if(u){let g=u[1];!g.includes("eudia.com")&&!e.includes(g)&&n.add(g)}}if(n.size===0)return{account:null,accountId:null,confidence:0,source:"attendee_domain",evidence:"No external domains"};for(let a of n){let o=a.split(".")[0],u=o.charAt(0).toUpperCase()+o.slice(1),g=this.fuzzyMatchSalesforce(u);if(g)return{account:g.name,accountId:g.id,confidence:75,source:"salesforce_match",evidence:`Matched attendee domain ${a} to "${g.name}"`}}let s=Array.from(n)[0],i=s.split(".")[0];return{account:i.charAt(0).toUpperCase()+i.slice(1),accountId:null,confidence:50,source:"attendee_domain",evidence:`Guessed from external attendee domain: ${s}`}}fuzzyMatchSalesforce(t){if(!t||this.salesforceAccounts.length===0)return null;let e=t.toLowerCase().trim();for(let n of this.salesforceAccounts)if(n.name?.toLowerCase()===e)return n;for(let n of this.salesforceAccounts)if(n.name?.toLowerCase().startsWith(e))return n;for(let n of this.salesforceAccounts)if(n.name?.toLowerCase().includes(e))return n;for(let n of this.salesforceAccounts)if(e.includes(n.name?.toLowerCase()))return n;return null}suggestAccounts(t,e=10){if(!t||t.length<2)return this.salesforceAccounts.slice(0,e).map(i=>({...i,score:0}));let n=t.toLowerCase(),s=[];for(let i of this.salesforceAccounts){let r=i.name?.toLowerCase()||"",a=0;r===n?a=100:r.startsWith(n)?a=90:r.includes(n)?a=70:n.includes(r)&&(a=50),a>0&&s.push({...i,score:a})}return s.sort((i,r)=>r.score-i.score).slice(0,e)}},X=new $;function _(h,t){let e="";return(t?.account||t?.opportunities?.length)&&(e=`
ACCOUNT CONTEXT (use to inform your analysis):
${t.account?`- Account: ${t.account.name}`:""}
${t.account?.owner?`- Account Owner: ${t.account.owner}`:""}
${t.opportunities?.length?`- Open Opportunities: ${t.opportunities.map(n=>`${n.name} (${n.stage}, $${(n.acv/1e3).toFixed(0)}k)`).join("; ")}`:""}
${t.contacts?.length?`- Known Contacts: ${t.contacts.slice(0,5).map(n=>`${n.name} - ${n.title}`).join("; ")}`:""}
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
- Action items have clear owners`}var E=class{constructor(t,e){this.openaiApiKey=null;this.serverUrl=t,this.openaiApiKey=e||null}setServerUrl(t){this.serverUrl=t}setOpenAIKey(t){this.openaiApiKey=t}async transcribeAndSummarize(t,e,n,s,i){try{let r=await(0,b.requestUrl)({url:`${this.serverUrl}/api/transcribe-and-summarize`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:t,mimeType:e,accountName:n,accountId:s,openaiApiKey:this.openaiApiKey,context:i?{customerBrain:i.account?.customerBrain,opportunities:i.opportunities,contacts:i.contacts}:void 0,systemPrompt:_(n,i)})});return r.json.success?{success:!0,transcript:r.json.transcript||"",sections:this.normalizeSections(r.json.sections),duration:r.json.duration||0}:r.json.error?.includes("OpenAI not initialized")&&this.openaiApiKey?(console.log("Server OpenAI unavailable, trying local fallback..."),this.transcribeLocal(t,e,n,i)):{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:r.json.error||"Transcription failed"}}catch(r){return console.error("Server transcription error:",r),this.openaiApiKey?(console.log("Server unreachable, trying local OpenAI fallback..."),this.transcribeLocal(t,e,n,i)):{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:`Server unavailable: ${r.message}. Add OpenAI API key in settings for offline mode.`}}}async transcribeLocal(t,e,n,s){if(!this.openaiApiKey)return{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:"No OpenAI API key configured. Add it in plugin settings."};try{let i=atob(t),r=new Uint8Array(i.length);for(let m=0;m<i.length;m++)r[m]=i.charCodeAt(m);let a=new Blob([r],{type:e}),o=new FormData,u=e.includes("webm")?"webm":e.includes("mp4")?"m4a":"ogg";o.append("file",a,`audio.${u}`),o.append("model","whisper-1"),o.append("response_format","verbose_json"),o.append("language","en");let g=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`},body:o});if(!g.ok){let m=await g.text();throw new Error(`Whisper API error: ${g.status} - ${m}`)}let l=await g.json(),p=l.text||"",d=l.duration||0,f=await this.summarizeLocal(p,n,s);return{success:!0,transcript:p,sections:f,duration:d}}catch(i){return console.error("Local transcription error:",i),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:i.message||"Local transcription failed"}}}async summarizeLocal(t,e,n){if(!this.openaiApiKey)return this.getEmptySections();try{let s=_(e,n),i=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o",messages:[{role:"system",content:s},{role:"user",content:`Analyze this meeting transcript:

${t.substring(0,1e5)}`}],temperature:.2,max_tokens:6e3})});if(!i.ok)return console.warn("GPT summarization failed, returning empty sections"),this.getEmptySections();let a=(await i.json()).choices?.[0]?.message?.content||"";return this.parseSections(a)}catch(s){return console.error("Local summarization error:",s),this.getEmptySections()}}parseSections(t){let e=this.getEmptySections(),n={summary:"summary",attendees:"attendees","meddicc signals":"meddiccSignals","product interest":"productInterest","pain points":"painPoints","buying triggers":"buyingTriggers","key dates":"keyDates","next steps":"nextSteps","action items":"actionItems","action items (internal)":"actionItems","deal signals":"dealSignals","risks & objections":"risksObjections","risks and objections":"risksObjections","competitive intelligence":"competitiveIntel"},s=/## ([^\n]+)\n([\s\S]*?)(?=## |$)/g,i;for(;(i=s.exec(t))!==null;){let r=i[1].trim().toLowerCase(),a=i[2].trim(),o=n[r];o&&(e[o]=a)}return e}normalizeSections(t){let e=this.getEmptySections();return t?{...e,...t}:e}async getMeetingContext(t){try{let e=await(0,b.requestUrl)({url:`${this.serverUrl}/api/meeting-context/${t}`,method:"GET",headers:{Accept:"application/json"}});return e.json.success?{success:!0,account:e.json.account,opportunities:e.json.opportunities,contacts:e.json.contacts,lastMeeting:e.json.lastMeeting}:{success:!1,error:e.json.error||"Failed to fetch context"}}catch(e){return console.error("Meeting context error:",e),{success:!1,error:e.message||"Network error"}}}async syncToSalesforce(t,e,n,s,i,r){try{let a=await(0,b.requestUrl)({url:`${this.serverUrl}/api/transcription/sync-to-salesforce`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:t,accountName:e,noteTitle:n,sections:s,transcript:i,meetingDate:r||new Date().toISOString(),syncedAt:new Date().toISOString()})});return a.json.success?{success:!0,customerBrainUpdated:a.json.customerBrainUpdated,eventCreated:a.json.eventCreated,eventId:a.json.eventId,contactsCreated:a.json.contactsCreated,tasksCreated:a.json.tasksCreated}:{success:!1,error:a.json.error||"Sync failed"}}catch(a){return console.error("Salesforce sync error:",a),{success:!1,error:a.message||"Network error"}}}getEmptySections(){return{summary:"",attendees:"",meddiccSignals:"",productInterest:"",painPoints:"",buyingTriggers:"",keyDates:"",nextSteps:"",actionItems:"",dealSignals:"",risksObjections:"",competitiveIntel:""}}static formatSectionsForNote(t,e){let n="";return t.summary&&(n+=`## TL;DR

${t.summary}

`),t.painPoints&&!t.painPoints.includes("None explicitly stated")&&(n+=`## Pain Points

${t.painPoints}

`),t.productInterest&&!t.productInterest.includes("None identified")&&(n+=`## Product Interest

${t.productInterest}

`),t.meddiccSignals&&(n+=`## MEDDICC Signals

${t.meddiccSignals}

`),t.nextSteps&&(n+=`## Next Steps

${t.nextSteps}

`),t.actionItems&&(n+=`## Action Items (Internal)

${t.actionItems}

`),t.keyDates&&!t.keyDates.includes("No specific dates")&&(n+=`## Key Dates

${t.keyDates}

`),t.buyingTriggers&&(n+=`## Buying Triggers

${t.buyingTriggers}

`),t.dealSignals&&(n+=`## Deal Signals

${t.dealSignals}

`),t.risksObjections&&!t.risksObjections.includes("None raised")&&(n+=`## Risks & Objections

${t.risksObjections}

`),t.competitiveIntel&&!t.competitiveIntel.includes("No competitive")&&(n+=`## Competitive Intelligence

${t.competitiveIntel}

`),t.attendees&&(n+=`## Attendees

${t.attendees}

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

`,e}async blobToBase64(t){return new Promise((e,n)=>{let s=new FileReader;s.onload=()=>{let r=s.result.split(",")[1];e(r)},s.onerror=n,s.readAsDataURL(t)})}async transcribeAudio(t,e){try{let n=await this.blobToBase64(t),s=t.type||"audio/webm",i=await this.transcribeAndSummarize(n,s,e?.accountName,e?.accountId);return{text:i.transcript,confidence:i.success?.95:0,duration:i.duration,sections:i.sections}}catch(n){return console.error("transcribeAudio error:",n),{text:"",confidence:0,duration:0,sections:this.getEmptySections()}}}async processTranscription(t,e){if(!t||t.trim().length===0)return this.getEmptySections();try{if(this.openaiApiKey){let n=`Analyze this meeting transcript and extract structured information:

TRANSCRIPT:
${t}

Extract the following in JSON format:
{
  "summary": "2-3 sentence meeting summary",
  "keyPoints": ["key point 1", "key point 2", ...],
  "nextSteps": ["action item 1", "action item 2", ...],
  "meddiccSignals": [{"category": "Metrics|Economic Buyer|Decision Criteria|Decision Process|Identify Pain|Champion|Competition", "signal": "the signal text", "confidence": 0.8}],
  "attendees": ["name 1", "name 2", ...]
}`,s=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:"You are a sales meeting analyst. Extract structured information from transcripts. Return valid JSON only."},{role:"user",content:n}],temperature:.3,max_tokens:2e3})});if(s.ok){let a=((await s.json()).choices?.[0]?.message?.content||"").match(/\{[\s\S]*\}/);if(a){let o=JSON.parse(a[0]),u=d=>Array.isArray(d)?d.map(f=>`- [ ] ${f}`).join(`
`):d||"",g=d=>Array.isArray(d)?d.map(f=>`- ${f}`).join(`
`):d||"",l=d=>Array.isArray(d)?d.map(f=>typeof f=="object"&&f.category?`**${f.category}**: ${f.signal||f.insight||""}`:`- ${f}`).join(`
`):d||"",p=d=>Array.isArray(d)?d.map(f=>`- ${f}`).join(`
`):d||"";return{summary:o.summary||"",painPoints:g(o.keyPoints||o.painPoints),productInterest:"",meddiccSignals:l(o.meddiccSignals),nextSteps:u(o.nextSteps),actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:p(o.attendees),transcript:t}}}}return{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:t}}catch(n){return console.error("processTranscription error:",n),{summary:"",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:t}}}};var T=require("obsidian"),S=class{constructor(t,e){this.serverUrl=t,this.userEmail=e.toLowerCase()}setUserEmail(t){this.userEmail=t.toLowerCase()}setServerUrl(t){this.serverUrl=t}async getTodaysMeetings(){if(!this.userEmail)return{success:!1,date:new Date().toISOString().split("T")[0],email:"",meetingCount:0,meetings:[],error:"User email not configured"};try{return(await(0,T.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/today`,method:"GET",headers:{Accept:"application/json"}})).json}catch(t){return console.error("Failed to fetch today's meetings:",t),{success:!1,date:new Date().toISOString().split("T")[0],email:this.userEmail,meetingCount:0,meetings:[],error:t.message||"Failed to fetch calendar"}}}async getWeekMeetings(){if(!this.userEmail)return{success:!1,startDate:"",endDate:"",email:"",totalMeetings:0,byDay:{},error:"User email not configured"};try{return(await(0,T.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/week`,method:"GET",headers:{Accept:"application/json"}})).json}catch(t){return console.error("Failed to fetch week's meetings:",t),{success:!1,startDate:"",endDate:"",email:this.userEmail,totalMeetings:0,byDay:{},error:t.message||"Failed to fetch calendar"}}}async getMeetingsInRange(t,e){if(!this.userEmail)return[];try{let n=t.toISOString().split("T")[0],s=e.toISOString().split("T")[0],i=await(0,T.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${n}&end=${s}`,method:"GET",headers:{Accept:"application/json"}});return i.json.success?i.json.meetings||[]:[]}catch(n){return console.error("Failed to fetch calendar range:",n),[]}}async getCurrentMeeting(){let t=await this.getTodaysMeetings();if(!t.success||t.meetings.length===0)return{meeting:null,isNow:!1};let e=new Date;for(let n of t.meetings){let s=new Date(n.start),i=new Date(n.end);if(e>=s&&e<=i)return{meeting:n,isNow:!0};let r=(s.getTime()-e.getTime())/(1e3*60);if(r>0&&r<=15)return{meeting:n,isNow:!1,minutesUntilStart:Math.ceil(r)}}return{meeting:null,isNow:!1}}async getMeetingsForAccount(t){let e=await this.getWeekMeetings();if(!e.success)return[];let n=[];Object.values(e.byDay).forEach(i=>{n.push(...i)});let s=t.toLowerCase();return n.filter(i=>i.accountName?.toLowerCase().includes(s)||i.subject.toLowerCase().includes(s)||i.attendees.some(r=>r.email.toLowerCase().includes(s.split(" ")[0])))}static formatMeetingForNote(t){let e=t.attendees.filter(n=>n.isExternal!==!1).map(n=>n.name||n.email.split("@")[0]).slice(0,5).join(", ");return{title:t.subject,attendees:e,meetingStart:t.start,accountName:t.accountName}}static getDayName(t){let e=new Date(t),n=new Date;n.setHours(0,0,0,0);let s=new Date(e);s.setHours(0,0,0,0);let i=(s.getTime()-n.getTime())/(1e3*60*60*24);return i===0?"Today":i===1?"Tomorrow":e.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}static formatTime(t){return new Date(t).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0})}static getMeetingDuration(t,e){let n=new Date(t),s=new Date(e);return Math.round((s.getTime()-n.getTime())/(1e3*60))}};var H=["ai-contracting-tech","ai-contracting-services","ai-compliance-tech","ai-compliance-services","ai-ma-tech","ai-ma-services","sigma"],W=["metrics-identified","economic-buyer-identified","decision-criteria-discussed","decision-process-discussed","pain-confirmed","champion-identified","competition-mentioned"],K=["progressing","stalled","at-risk","champion-engaged","early-stage"],G=["discovery","demo","negotiation","qbr","implementation","follow-up"],q=`You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

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
}`,A=class{constructor(t,e){this.openaiApiKey=null;this.serverUrl=t,this.openaiApiKey=e||null}setOpenAIKey(t){this.openaiApiKey=t}setServerUrl(t){this.serverUrl=t}async extractTags(t){let e=this.buildTagContext(t);if(!e.trim())return{success:!1,tags:this.getEmptyTags(),error:"No content to analyze"};try{return await this.extractTagsViaServer(e)}catch(n){return console.warn("Server tag extraction failed, trying local:",n.message),this.openaiApiKey?await this.extractTagsLocal(e):this.extractTagsRuleBased(t)}}buildTagContext(t){let e=[];return t.summary&&e.push(`SUMMARY:
${t.summary}`),t.productInterest&&e.push(`PRODUCT INTEREST:
${t.productInterest}`),t.meddiccSignals&&e.push(`MEDDICC SIGNALS:
${t.meddiccSignals}`),t.dealSignals&&e.push(`DEAL SIGNALS:
${t.dealSignals}`),t.painPoints&&e.push(`PAIN POINTS:
${t.painPoints}`),t.attendees&&e.push(`ATTENDEES:
${t.attendees}`),e.join(`

`)}async extractTagsViaServer(t){let e=await fetch(`${this.serverUrl}/api/extract-tags`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:t,openaiApiKey:this.openaiApiKey})});if(!e.ok)throw new Error(`Server returned ${e.status}`);let n=await e.json();if(!n.success)throw new Error(n.error||"Tag extraction failed");return{success:!0,tags:this.validateAndNormalizeTags(n.tags)}}async extractTagsLocal(t){if(!this.openaiApiKey)return{success:!1,tags:this.getEmptyTags(),error:"No OpenAI API key configured"};try{let e=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:q},{role:"user",content:`Extract tags from this meeting content:

${t}`}],temperature:.1,response_format:{type:"json_object"}})});if(!e.ok)throw new Error(`OpenAI returned ${e.status}`);let s=(await e.json()).choices?.[0]?.message?.content;if(!s)throw new Error("No content in response");let i=JSON.parse(s);return{success:!0,tags:this.validateAndNormalizeTags(i)}}catch(e){return console.error("Local tag extraction error:",e),{success:!1,tags:this.getEmptyTags(),error:e.message||"Tag extraction failed"}}}extractTagsRuleBased(t){let e=Object.values(t).join(" ").toLowerCase(),n={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:.4};return(e.includes("contract")||e.includes("contracting"))&&(e.includes("service")?n.product_interest.push("ai-contracting-services"):n.product_interest.push("ai-contracting-tech")),e.includes("compliance")&&n.product_interest.push("ai-compliance-tech"),(e.includes("m&a")||e.includes("due diligence")||e.includes("acquisition"))&&n.product_interest.push("ai-ma-tech"),e.includes("sigma")&&n.product_interest.push("sigma"),(e.includes("metric")||e.includes("%")||e.includes("roi")||e.includes("save"))&&n.meddicc_signals.push("metrics-identified"),(e.includes("budget")||e.includes("cfo")||e.includes("economic buyer"))&&n.meddicc_signals.push("economic-buyer-identified"),(e.includes("pain")||e.includes("challenge")||e.includes("problem")||e.includes("struggle"))&&n.meddicc_signals.push("pain-confirmed"),(e.includes("champion")||e.includes("advocate")||e.includes("sponsor"))&&n.meddicc_signals.push("champion-identified"),(e.includes("competitor")||e.includes("alternative")||e.includes("vs")||e.includes("compared to"))&&n.meddicc_signals.push("competition-mentioned"),(e.includes("next step")||e.includes("follow up")||e.includes("schedule"))&&(n.deal_health="progressing"),(e.includes("concern")||e.includes("objection")||e.includes("hesitant")||e.includes("risk"))&&(n.deal_health="at-risk"),e.includes("demo")||e.includes("show you")||e.includes("demonstration")?n.meeting_type="demo":e.includes("pricing")||e.includes("negotiat")||e.includes("contract terms")?n.meeting_type="negotiation":e.includes("quarterly")||e.includes("qbr")||e.includes("review")?n.meeting_type="qbr":(e.includes("implementation")||e.includes("onboard")||e.includes("rollout"))&&(n.meeting_type="implementation"),{success:!0,tags:n}}validateAndNormalizeTags(t){let e={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:t.confidence||.8};return Array.isArray(t.product_interest)&&(e.product_interest=t.product_interest.filter(n=>H.includes(n))),Array.isArray(t.meddicc_signals)&&(e.meddicc_signals=t.meddicc_signals.filter(n=>W.includes(n))),K.includes(t.deal_health)&&(e.deal_health=t.deal_health),G.includes(t.meeting_type)&&(e.meeting_type=t.meeting_type),Array.isArray(t.key_stakeholders)&&(e.key_stakeholders=t.key_stakeholders.slice(0,10)),e}getEmptyTags(){return{product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:0}}static formatTagsForFrontmatter(t){return{product_interest:t.product_interest.length>0?t.product_interest:null,meddicc_signals:t.meddicc_signals.length>0?t.meddicc_signals:null,deal_health:t.deal_health,meeting_type:t.meeting_type,key_stakeholders:t.key_stakeholders.length>0?t.key_stakeholders:null,tag_confidence:Math.round(t.confidence*100)}}static generateTagSummary(t){let e=[];return t.product_interest.length>0&&e.push(`**Products:** ${t.product_interest.join(", ")}`),t.meddicc_signals.length>0&&e.push(`**MEDDICC:** ${t.meddicc_signals.join(", ")}`),e.push(`**Deal Health:** ${t.deal_health}`),e.push(`**Meeting Type:** ${t.meeting_type}`),e.join(" | ")}};var V={serverUrl:"https://gtm-wizard.onrender.com",accountsFolder:"Accounts",recordingsFolder:"Recordings",syncOnStartup:!0,autoSyncAfterTranscription:!0,saveAudioFiles:!0,appendTranscript:!0,lastSyncTime:null,cachedAccounts:[],enableSmartTags:!0,showCalendarView:!0,userEmail:"",setupCompleted:!1,calendarConfigured:!1,openaiApiKey:""},C="eudia-calendar-view",P=class extends c.EditorSuggest{constructor(t,e){super(t),this.plugin=e}onTrigger(t,e,n){let s=e.getLine(t.line),i=e.getValue(),r=e.posToOffset(t),a=i.indexOf("---"),o=i.indexOf("---",a+3);if(a===-1||r<a||r>o)return null;let u=s.match(/^account:\s*(.*)$/);if(!u)return null;let g=u[1].trim(),l=s.indexOf(":")+1,p=s.substring(l).match(/^\s*/)?.[0].length||0;return{start:{line:t.line,ch:l+p},end:t,query:g}}getSuggestions(t){let e=t.query.toLowerCase(),n=this.plugin.settings.cachedAccounts;return e?n.filter(s=>s.name.toLowerCase().includes(e)).sort((s,i)=>{let r=s.name.toLowerCase().startsWith(e),a=i.name.toLowerCase().startsWith(e);return r&&!a?-1:a&&!r?1:s.name.localeCompare(i.name)}).slice(0,10):n.slice(0,10)}renderSuggestion(t,e){e.createEl("div",{text:t.name,cls:"suggestion-title"})}selectSuggestion(t,e){this.context&&this.context.editor.replaceRange(t.name,this.context.start,this.context.end)}},D=class{constructor(t,e,n,s){this.containerEl=null;this.waveformBars=[];this.durationEl=null;this.waveformData=new Array(16).fill(0);this.onPause=t,this.onResume=e,this.onStop=n,this.onCancel=s}show(){if(this.containerEl)return;this.containerEl=document.createElement("div"),this.containerEl.className="eudia-transcription-bar active";let t=document.createElement("div");t.className="eudia-recording-dot",this.containerEl.appendChild(t);let e=document.createElement("div");e.className="eudia-waveform",this.waveformBars=[];for(let r=0;r<16;r++){let a=document.createElement("div");a.className="eudia-waveform-bar",a.style.height="2px",e.appendChild(a),this.waveformBars.push(a)}this.containerEl.appendChild(e),this.durationEl=document.createElement("div"),this.durationEl.className="eudia-duration",this.durationEl.textContent="0:00",this.containerEl.appendChild(this.durationEl);let n=document.createElement("div");n.className="eudia-controls-minimal";let s=document.createElement("button");s.className="eudia-control-btn stop",s.innerHTML='<span class="eudia-stop-icon"></span>',s.title="Stop and summarize",s.onclick=()=>this.onStop(),n.appendChild(s);let i=document.createElement("button");i.className="eudia-control-btn cancel",i.textContent="Cancel",i.onclick=()=>this.onCancel(),n.appendChild(i),this.containerEl.appendChild(n),document.body.appendChild(this.containerEl)}hide(){this.containerEl&&(this.containerEl.remove(),this.containerEl=null,this.waveformBars=[],this.durationEl=null)}updateState(t){if(this.containerEl){if(this.waveformData.shift(),this.waveformData.push(t.audioLevel),this.waveformBars.forEach((e,n)=>{let s=this.waveformData[n]||0,i=Math.max(2,Math.min(24,s*.24));e.style.height=`${i}px`}),this.durationEl){let e=Math.floor(t.duration/60),n=Math.floor(t.duration%60);this.durationEl.textContent=`${e}:${n.toString().padStart(2,"0")}`}this.containerEl.className=t.isPaused?"eudia-transcription-bar paused":"eudia-transcription-bar active"}}showProcessing(){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar processing";let t=document.createElement("div");t.className="eudia-processing-spinner",this.containerEl.appendChild(t);let e=document.createElement("div");e.className="eudia-processing-text",e.textContent="Processing...",this.containerEl.appendChild(e)}showComplete(t){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar complete";let e=document.createElement("div");e.className="eudia-complete-checkmark",this.containerEl.appendChild(e);let n=document.createElement("div");if(n.className="eudia-complete-content",t.summaryPreview){let o=document.createElement("div");o.className="eudia-summary-preview",o.textContent=t.summaryPreview.length>80?t.summaryPreview.substring(0,80)+"...":t.summaryPreview,n.appendChild(o)}let s=document.createElement("div");s.className="eudia-complete-stats-row";let i=Math.floor(t.duration/60),r=Math.floor(t.duration%60);s.textContent=`${i}:${r.toString().padStart(2,"0")} recorded`,t.nextStepsCount>0&&(s.textContent+=` | ${t.nextStepsCount} action${t.nextStepsCount>1?"s":""}`),t.meddiccCount>0&&(s.textContent+=` | ${t.meddiccCount} signals`),n.appendChild(s),this.containerEl.appendChild(n);let a=document.createElement("button");a.className="eudia-control-btn close",a.textContent="Dismiss",a.onclick=()=>this.hide(),this.containerEl.appendChild(a),setTimeout(()=>this.hide(),8e3)}},R=class extends c.Modal{constructor(e){super(e);this.steps=[]}onOpen(){let{contentEl:e}=this;e.empty(),e.addClass("eudia-processing-modal"),e.createEl("div",{text:"Processing recording",cls:"eudia-processing-title"}),this.stepsContainer=e.createDiv({cls:"eudia-processing-steps"});let n=["Transcribing audio","Analyzing content","Extracting insights"];this.steps=n.map((s,i)=>{let r=this.stepsContainer.createDiv({cls:"eudia-processing-step"}),a=r.createDiv({cls:"eudia-step-indicator"});return i===0&&a.addClass("active"),r.createSpan({text:s,cls:"eudia-step-label"}),{el:r,completed:!1}}),e.createEl("div",{text:"This may take a moment for longer recordings.",cls:"eudia-processing-note"})}setMessage(e){let n=e.toLowerCase().includes("transcrib")?0:e.toLowerCase().includes("summary")||e.toLowerCase().includes("analyz")?1:2;this.steps.forEach((s,i)=>{let r=s.el.querySelector(".eudia-step-indicator");i<n?(s.completed=!0,r?.removeClass("active"),r?.addClass("completed")):i===n&&r?.addClass("active")})}onClose(){this.contentEl.empty()}},k=class extends c.Modal{constructor(t,e,n){super(t),this.plugin=e,this.onSelect=n}onOpen(){let{contentEl:t}=this;t.empty(),t.addClass("eudia-account-selector"),t.createEl("h3",{text:"Select Account for Meeting Note"}),this.searchInput=t.createEl("input",{type:"text",placeholder:"Search accounts..."}),this.searchInput.style.cssText="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);",this.resultsContainer=t.createDiv({cls:"eudia-account-results"}),this.resultsContainer.style.cssText="max-height: 300px; overflow-y: auto;",this.updateResults(""),this.searchInput.addEventListener("input",()=>this.updateResults(this.searchInput.value)),this.searchInput.focus()}updateResults(t){this.resultsContainer.empty();let e=this.plugin.settings.cachedAccounts,n=t?e.filter(s=>s.name.toLowerCase().includes(t.toLowerCase())).slice(0,15):e.slice(0,15);if(n.length===0){this.resultsContainer.createDiv({cls:"eudia-no-results",text:"No accounts found"});return}n.forEach(s=>{let i=this.resultsContainer.createDiv({cls:"eudia-account-item",text:s.name});i.onclick=()=>{this.onSelect(s),this.close()}})}onClose(){this.contentEl.empty()}},N=class extends c.Modal{constructor(e,n){super(e);this.currentStep=0;this.plugin=n,this.steps=[{id:"email",label:"Setting up your profile",status:"pending"},{id:"accounts",label:"Syncing Salesforce accounts",status:"pending"},{id:"calendar",label:"Connecting calendar",status:"pending"}]}onOpen(){let{contentEl:e}=this;e.empty(),e.addClass("eudia-setup-wizard"),this.renderWelcome()}renderWelcome(){let{contentEl:e}=this;e.empty(),e.createEl("h2",{text:"Welcome to Eudia"}),e.createEl("p",{text:"Let's get you set up in 30 seconds."});let n=e.createDiv({cls:"eudia-setup-info"});n.innerHTML=`
      <p style="margin: 0 0 8px 0;"><strong>Transcribe meetings</strong> with one click</p>
      <p style="margin: 0 0 8px 0;"><strong>View your calendar</strong> and create notes</p>
      <p style="margin: 0;"><strong>Sync to Salesforce</strong> automatically</p>
    `;let s=e.createDiv({cls:"eudia-setup-section"});s.createEl("h3",{text:"Your Eudia Email"});let i=s.createEl("input",{type:"email",placeholder:"yourname@eudia.com"});i.addClass("eudia-email-input"),this.plugin.settings.userEmail&&(i.value=this.plugin.settings.userEmail);let r=e.createDiv({cls:"eudia-setup-buttons"}),a=r.createEl("button",{text:"Skip for now"});a.onclick=()=>this.close();let o=r.createEl("button",{text:"Get Started \u2192"});o.setCssStyles({background:"var(--interactive-accent)",color:"white"}),o.onclick=async()=>{let u=i.value.trim().toLowerCase();if(!u||!u.endsWith("@eudia.com")){new c.Notice("Please enter your @eudia.com email address");return}this.plugin.settings.userEmail=u,await this.plugin.saveSettings(),await this.runSetup()}}async runSetup(){let{contentEl:e}=this;e.empty(),e.createEl("h2",{text:"Setting Up..."});let n=e.createDiv({cls:"eudia-setup-status-list"});this.steps.forEach(s=>{let i=n.createDiv({cls:"eudia-setup-step"});i.id=`step-${s.id}`,i.createSpan({text:"-",cls:"step-icon"}),i.createSpan({text:s.label,cls:"step-label"})}),this.updateStep("email","complete"),this.updateStep("accounts","running");try{await this.plugin.scanLocalAccountFolders(),this.updateStep("accounts","complete")}catch{this.updateStep("accounts","error")}this.updateStep("calendar","running"),this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),this.updateStep("calendar","complete"),this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),await new Promise(s=>setTimeout(s,500)),this.renderSuccess()}updateStep(e,n){let s=this.steps.find(r=>r.id===e);s&&(s.status=n);let i=document.getElementById(`step-${e}`);if(i){let r=i.querySelector(".step-icon");r&&(n==="running"?r.textContent="...":n==="complete"?r.textContent="[done]":n==="error"&&(r.textContent="[x]")),i.className=`eudia-setup-step ${n}`}}renderSuccess(){let{contentEl:e}=this;e.empty(),e.createEl("h2",{text:"Setup Complete"});let n=e.createDiv({cls:"eudia-setup-tips"});n.innerHTML=`
      <p style="margin: 0 0 12px 0; font-weight: 600;">Quick Reference:</p>
      <p style="margin: 0 0 8px 0;">1. <strong>Calendar</strong> - Click calendar icon in left sidebar to view meetings</p>
      <p style="margin: 0 0 8px 0;">2. <strong>Transcription</strong> - Click microphone icon or Cmd/Ctrl+P and search "Transcribe"</p>
      <p style="margin: 0 0 8px 0;">3. <strong>Accounts</strong> - Pre-loaded folders are in the Accounts directory</p>
      <p style="margin: 0;">4. <strong>Create notes</strong> - Click any meeting to create a note in the correct account folder</p>
    `;let s=e.createEl("button",{text:"Continue"});s.setCssStyles({background:"var(--interactive-accent)",color:"white",marginTop:"16px",padding:"12px 24px",cursor:"pointer"}),s.onclick=()=>{this.close(),this.plugin.activateCalendarView()}}onClose(){this.contentEl.empty()}},M=class extends c.ItemView{constructor(e,n){super(e);this.refreshInterval=null;this.lastError=null;this.plugin=n}getViewType(){return C}getDisplayText(){return"Calendar"}getIcon(){return"calendar"}async onOpen(){await this.render(),this.refreshInterval=window.setInterval(()=>this.render(),5*60*1e3)}async onClose(){this.refreshInterval&&window.clearInterval(this.refreshInterval)}async render(){let e=this.containerEl.children[1];if(e.empty(),e.addClass("eudia-calendar-view"),!this.plugin.settings.userEmail){this.renderSetupPanel(e);return}this.renderHeader(e),await this.renderCalendarContent(e)}renderHeader(e){let n=e.createDiv({cls:"eudia-calendar-header"}),s=n.createDiv({cls:"eudia-calendar-title-row"});s.createEl("h4",{text:"Your Meetings"});let i=s.createDiv({cls:"eudia-calendar-actions"}),r=i.createEl("button",{cls:"eudia-btn-icon",text:"\u21BB"});r.title="Refresh",r.onclick=async()=>{r.addClass("spinning"),await this.render(),r.removeClass("spinning")};let a=i.createEl("button",{cls:"eudia-btn-icon",text:"\u2699"});a.title="Settings",a.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")};let o=n.createDiv({cls:"eudia-status-bar"});this.renderConnectionStatus(o)}async renderConnectionStatus(e){let n={server:"connecting",calendar:"not_configured",salesforce:"not_configured"},s=this.plugin.settings.serverUrl,i=this.plugin.settings.userEmail;try{(await(0,c.requestUrl)({url:`${s}/api/health`,method:"GET",throw:!1})).status===200?(n.server="connected",n.serverMessage="Server online"):(n.server="error",n.serverMessage="Server unavailable")}catch{n.server="error",n.serverMessage="Cannot reach server"}if(i&&n.server==="connected")try{let l=await(0,c.requestUrl)({url:`${s}/api/calendar/validate/${encodeURIComponent(i)}`,method:"GET",throw:!1});l.status===200&&l.json?.authorized?(n.calendar="connected",n.calendarMessage="Calendar synced"):(n.calendar="not_authorized",n.calendarMessage="Not authorized")}catch{n.calendar="error",n.calendarMessage="Error checking access"}if(i&&n.server==="connected")try{let l=await(0,c.requestUrl)({url:`${s}/api/sf/auth/status?email=${encodeURIComponent(i)}`,method:"GET",throw:!1});l.status===200&&l.json?.connected?(n.salesforce="connected",n.salesforceMessage="Salesforce connected"):(n.salesforce="not_configured",n.salesforceMessage="Not connected")}catch{n.salesforce="not_configured"}let r=e.createDiv({cls:"eudia-status-indicators"}),a=r.createSpan({cls:`eudia-status-dot ${n.server}`});a.title=n.serverMessage||"Server";let o=r.createSpan({cls:`eudia-status-dot ${n.calendar}`});o.title=n.calendarMessage||"Calendar";let u=r.createSpan({cls:`eudia-status-dot ${n.salesforce}`});if(u.title=n.salesforceMessage||"Salesforce",e.createDiv({cls:"eudia-status-labels"}).createSpan({cls:"eudia-status-label",text:this.plugin.settings.userEmail}),n.calendar==="not_authorized"){let l=e.createDiv({cls:"eudia-status-warning"});l.innerHTML=`<strong>${i}</strong> is not authorized for calendar access. Contact your admin.`}}async renderCalendarContent(e){let n=e.createDiv({cls:"eudia-calendar-content"}),s=n.createDiv({cls:"eudia-calendar-loading"});s.innerHTML='<div class="eudia-spinner"></div><span>Loading meetings...</span>';try{let i=new S(this.plugin.settings.serverUrl,this.plugin.settings.userEmail),r=await i.getWeekMeetings();if(s.remove(),!r.success){this.renderError(n,r.error||"Failed to load calendar");return}let a=Object.keys(r.byDay||{}).sort();if(a.length===0){this.renderEmptyState(n);return}await this.renderCurrentMeeting(n,i);for(let o of a){let u=r.byDay[o];!u||u.length===0||this.renderDaySection(n,o,u)}}catch(i){s.remove(),this.renderError(n,i.message||"Failed to load calendar")}}async renderCurrentMeeting(e,n){try{let s=await n.getCurrentMeeting();if(s.meeting){let i=e.createDiv({cls:"eudia-now-card"});s.isNow?i.createDiv({cls:"eudia-now-badge",text:"\u25CF NOW"}):i.createDiv({cls:"eudia-now-badge soon",text:`In ${s.minutesUntilStart}m`});let r=i.createDiv({cls:"eudia-now-content"});r.createEl("div",{cls:"eudia-now-subject",text:s.meeting.subject}),s.meeting.accountName&&r.createEl("div",{cls:"eudia-now-account",text:s.meeting.accountName});let a=i.createEl("button",{cls:"eudia-now-action",text:"Create Note"});a.onclick=()=>this.createNoteForMeeting(s.meeting)}}catch{}}renderDaySection(e,n,s){let i=e.createDiv({cls:"eudia-calendar-day"});i.createEl("div",{cls:"eudia-calendar-day-header",text:S.getDayName(n)});for(let r of s){let a=i.createDiv({cls:`eudia-calendar-meeting ${r.isCustomerMeeting?"customer":"internal"}`});a.createEl("div",{cls:"eudia-calendar-time",text:S.formatTime(r.start)});let o=a.createDiv({cls:"eudia-calendar-details"});if(o.createEl("div",{cls:"eudia-calendar-subject",text:r.subject}),r.accountName)o.createEl("div",{cls:"eudia-calendar-account",text:r.accountName});else if(r.attendees&&r.attendees.length>0){let u=r.attendees.slice(0,2).map(g=>g.name||g.email?.split("@")[0]||"Unknown").join(", ");o.createEl("div",{cls:"eudia-calendar-attendees",text:u})}a.onclick=()=>this.createNoteForMeeting(r),a.title="Click to create meeting note"}}renderEmptyState(e){let n=e.createDiv({cls:"eudia-calendar-empty"});n.innerHTML=`
      <div class="eudia-empty-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <p class="eudia-empty-title">No meetings this week</p>
      <p class="eudia-empty-subtitle">Enjoy your focus time!</p>
    `}renderError(e,n){let s=e.createDiv({cls:"eudia-calendar-error"}),i="",r="Unable to load calendar",a="";n.includes("not authorized")||n.includes("403")?(i="\u{1F512}",r="Calendar Access Required",a="Contact your admin to be added to the authorized users list."):n.includes("network")||n.includes("fetch")?(i="\u{1F4E1}",r="Connection Issue",a="Check your internet connection and try again."):(n.includes("server")||n.includes("500"))&&(i="\u{1F527}",r="Server Unavailable",a="The server may be waking up. Try again in 30 seconds."),s.innerHTML=`
      <div class="eudia-error-icon">${i}</div>
      <p class="eudia-error-title">${r}</p>
      <p class="eudia-error-message">${n}</p>
      ${a?`<p class="eudia-error-action">${a}</p>`:""}
    `;let o=s.createEl("button",{cls:"eudia-btn-retry",text:"Try Again"});o.onclick=()=>this.render()}renderSetupPanel(e){let n=e.createDiv({cls:"eudia-calendar-setup-panel"});n.innerHTML=`
      <div class="eudia-setup-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <h3 class="eudia-setup-title">Connect Your Calendar</h3>
      <p class="eudia-setup-desc">Enter your Eudia email to see your meetings and create notes with one click.</p>
    `;let s=n.createDiv({cls:"eudia-setup-input-group"}),i=s.createEl("input",{type:"email",placeholder:"yourname@eudia.com"});i.addClass("eudia-setup-email");let r=s.createEl("button",{cls:"eudia-setup-connect",text:"Connect"}),a=n.createDiv({cls:"eudia-setup-status"});r.onclick=async()=>{let o=i.value.trim().toLowerCase();if(!o||!o.endsWith("@eudia.com")){a.textContent="Please use your @eudia.com email",a.className="eudia-setup-status error";return}r.disabled=!0,r.textContent="Connecting...",a.textContent="";try{if(!(await(0,c.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${o}`,method:"GET"})).json?.authorized){a.innerHTML=`<strong>${o}</strong> is not authorized. Contact your admin to be added.`,a.className="eudia-setup-status error",r.disabled=!1,r.textContent="Connect";return}this.plugin.settings.userEmail=o,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),a.textContent="Connected",a.className="eudia-setup-status success",this.plugin.scanLocalAccountFolders().catch(()=>{}),setTimeout(()=>this.render(),500)}catch(u){let g=u.message||"Connection failed";g.includes("403")?a.innerHTML=`<strong>${o}</strong> is not authorized for calendar access.`:a.textContent=g,a.className="eudia-setup-status error",r.disabled=!1,r.textContent="Connect"}},i.onkeydown=o=>{o.key==="Enter"&&r.click()},n.createEl("p",{cls:"eudia-setup-help",text:"Your calendar syncs automatically via Microsoft 365."})}extractAccountFromAttendees(e){if(!e||e.length===0)return null;let n=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com","live.com","msn.com","aol.com","protonmail.com"],s=[];for(let o of e){if(!o.email)continue;let g=o.email.toLowerCase().match(/@([a-z0-9.-]+)/);if(g){let l=g[1];!l.includes("eudia.com")&&!n.includes(l)&&s.push(l)}}if(s.length===0)return null;let i=s[0],r=i.split(".")[0],a=r.charAt(0).toUpperCase()+r.slice(1);return console.log(`[Eudia Calendar] Extracted company "${a}" from attendee domain ${i}`),a}extractAccountFromSubject(e){if(!e)return null;let n=e.match(/^([^\/]+)\s*\/\s*Eudia|Eudia\s*\/\s*([^\/\-|]+)/i);if(n){let i=(n[1]||n[2]||"").trim();if(i.toLowerCase()!=="eudia")return i}let s=e.match(/^Eudia\s*[-–]\s*([^|]+)|^([^-–]+)\s*[-–]\s*Eudia/i);if(s){let r=(s[1]||s[2]||"").trim().replace(/\s+(Connect|Weekly|Call|Meeting|Intro|Demo|Check\s*in|Sync).*$/i,"").trim();if(r.toLowerCase()!=="eudia"&&r.length>0)return r}if(!e.toLowerCase().includes("eudia")){let i=e.match(/^([^-–|]+)/);if(i){let r=i[1].trim();if(r.length>2&&r.length<50)return r}}return null}findAccountFolder(e){if(!e)return null;let n=this.plugin.settings.accountsFolder||"Accounts",s=this.app.vault.getAbstractFileByPath(n);if(!(s instanceof c.TFolder))return console.log(`[Eudia Calendar] Accounts folder "${n}" not found`),null;let i=e.toLowerCase().trim(),r=[];for(let p of s.children)p instanceof c.TFolder&&r.push(p.name);console.log(`[Eudia Calendar] Searching for "${i}" in ${r.length} folders`);let a=r.find(p=>p.toLowerCase()===i);if(a)return console.log(`[Eudia Calendar] Exact match found: ${a}`),`${n}/${a}`;let o=r.find(p=>p.toLowerCase().startsWith(i));if(o)return console.log(`[Eudia Calendar] Folder starts with match: ${o}`),`${n}/${o}`;let u=r.find(p=>i.startsWith(p.toLowerCase()));if(u)return console.log(`[Eudia Calendar] Search starts with folder match: ${u}`),`${n}/${u}`;let g=r.find(p=>{let d=p.toLowerCase();return d.length>=3&&i.includes(d)});if(g)return console.log(`[Eudia Calendar] Search contains folder match: ${g}`),`${n}/${g}`;let l=r.find(p=>{let d=p.toLowerCase();return i.length>=3&&d.includes(i)});return l?(console.log(`[Eudia Calendar] Folder contains search match: ${l}`),`${n}/${l}`):(console.log(`[Eudia Calendar] No folder match found for "${i}"`),null)}async createNoteForMeeting(e){let n=e.start.split("T")[0],s=e.subject.replace(/[<>:"/\\|?*]/g,"_").substring(0,50),i=`${n} - ${s}.md`,r=null,a=e.accountName||null,o=null;if(console.log(`[Eudia Calendar] === Creating note for meeting: "${e.subject}" ===`),console.log(`[Eudia Calendar] Attendees: ${JSON.stringify(e.attendees?.map(d=>d.email)||[])}`),!r&&e.attendees&&e.attendees.length>0){let d=this.extractAccountFromAttendees(e.attendees);console.log(`[Eudia Calendar] Extracted domain company name: "${d||"none"}"`),d&&(r=this.findAccountFolder(d),console.log(`[Eudia Calendar] Domain-based "${d}" -> folder: ${r||"not found"}`),r&&!a&&(a=r.split("/").pop()||d))}if(!r&&e.accountName&&(r=this.findAccountFolder(e.accountName),console.log(`[Eudia Calendar] Server accountName "${e.accountName}" -> folder: ${r||"not found"}`)),!r){let d=this.extractAccountFromSubject(e.subject);d&&(r=this.findAccountFolder(d),console.log(`[Eudia Calendar] Subject-based "${d}" -> folder: ${r||"not found"}`),r&&!a&&(a=r.split("/").pop()||d))}if(!r){let d=this.plugin.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(d)instanceof c.TFolder&&(r=d,console.log(`[Eudia Calendar] No match found, using Accounts root: ${r}`))}if(a){let d=this.plugin.settings.cachedAccounts.find(f=>f.name.toLowerCase()===a?.toLowerCase());d&&(o=d.id,a=d.name,console.log(`[Eudia Calendar] Matched to cached account: ${d.name} (${d.id})`))}let u=r?`${r}/${i}`:i,g=this.app.vault.getAbstractFileByPath(u);if(g instanceof c.TFile){await this.app.workspace.getLeaf().openFile(g),new c.Notice(`Opened existing note: ${i}`);return}let l=(e.attendees||[]).map(d=>d.name||d.email?.split("@")[0]||"Unknown").slice(0,5).join(", "),p=`---
title: "${e.subject}"
date: ${n}
attendees: [${l}]
account: "${a||""}"
account_id: "${o||""}"
meeting_start: ${e.start}
meeting_type: discovery
sync_to_salesforce: false
clo_meeting: false
source: ""
transcribed: false
---

# ${e.subject}

## Attendees
${(e.attendees||[]).map(d=>`- ${d.name||d.email}`).join(`
`)}

## Pre-Call Notes

*Add any prep notes, context, or questions before the meeting*



---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` \u2192 **"Transcribe Meeting"**

---

`;try{let d=await this.app.vault.create(u,p);await this.app.workspace.getLeaf().openFile(d),new c.Notice(`Created: ${u}`)}catch(d){console.error("[Eudia Calendar] Failed to create note:",d),new c.Notice(`Could not create note: ${d.message||"Unknown error"}`)}}},x=class extends c.Plugin{constructor(){super(...arguments);this.audioRecorder=null;this.recordingStatusBar=null}async onload(){await this.loadSettings(),this.transcriptionService=new E(this.settings.serverUrl,this.settings.openaiApiKey),this.calendarService=new S(this.settings.serverUrl,this.settings.userEmail),this.smartTagService=new A,this.registerView(C,e=>new M(e,this)),this.addRibbonIcon("calendar","Open Calendar",()=>this.activateCalendarView()),this.addRibbonIcon("microphone","Transcribe Meeting",async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}),this.addCommand({id:"transcribe-meeting",name:"Transcribe Meeting",callback:async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}}),this.addCommand({id:"open-calendar",name:"Open Calendar",callback:()=>this.activateCalendarView()}),this.addCommand({id:"sync-accounts",name:"Sync Salesforce Accounts",callback:()=>this.syncAccounts()}),this.addCommand({id:"sync-note",name:"Sync Note to Salesforce",callback:()=>this.syncNoteToSalesforce()}),this.addCommand({id:"new-meeting-note",name:"New Meeting Note",callback:()=>this.createMeetingNote()}),this.addSettingTab(new L(this.app,this)),this.registerEditorSuggest(new P(this.app,this)),this.app.workspace.onLayoutReady(async()=>{!this.settings.setupCompleted&&!this.settings.userEmail?new N(this.app,this).open():this.settings.syncOnStartup&&await this.scanLocalAccountFolders(),this.settings.showCalendarView&&this.settings.userEmail&&this.activateCalendarView()})}async onunload(){this.app.workspace.detachLeavesOfType(C)}async loadSettings(){this.settings=Object.assign({},V,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}async activateCalendarView(){let e=this.app.workspace,n=e.getLeavesOfType(C);if(n.length>0)e.revealLeaf(n[0]);else{let s=e.getRightLeaf(!1);s&&(await s.setViewState({type:C,active:!0}),e.revealLeaf(s))}}async startRecording(){if(!w.isSupported()){new c.Notice("Audio transcription is not supported in this browser");return}let e=this.app.workspace.getActiveFile();if(e||(await this.createMeetingNote(),e=this.app.workspace.getActiveFile()),!e){new c.Notice("Please open or create a note first");return}this.audioRecorder=new w,this.recordingStatusBar=new D(()=>this.audioRecorder?.pause(),()=>this.audioRecorder?.resume(),()=>this.stopRecording(),()=>this.cancelRecording());try{await this.audioRecorder.start(),this.recordingStatusBar.show();let n=setInterval(()=>{if(this.audioRecorder?.isRecording()){let s=this.audioRecorder.getState();this.recordingStatusBar?.updateState(s)}else clearInterval(n)},100);new c.Notice("Transcription started. Click stop when finished.")}catch(n){new c.Notice(`Failed to start transcription: ${n.message}`),this.recordingStatusBar?.hide(),this.recordingStatusBar=null}}async stopRecording(){if(!this.audioRecorder?.isRecording())return;let e=this.app.workspace.getActiveFile();if(!e){new c.Notice("No active file to save transcription"),this.cancelRecording();return}this.recordingStatusBar?.showProcessing();try{let n=await this.audioRecorder.stop();await this.processRecording(n,e)}catch(n){new c.Notice(`Transcription failed: ${n.message}`)}finally{this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null}}async cancelRecording(){this.audioRecorder?.isRecording()&&this.audioRecorder.cancel(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null,new c.Notice("Transcription cancelled")}async processRecording(e,n){let s=new R(this.app);s.open();try{let i,r=n.path.split("/");if(r.length>=2&&r[0]===this.settings.accountsFolder){let m=r[1],y=this.settings.cachedAccounts.find(v=>v.name.toLowerCase()===m.toLowerCase());y&&(i={accountName:y.name,accountId:y.id})}let a=[];try{let m=await this.calendarService.getCurrentMeeting();m.meeting?.attendees&&(a=m.meeting.attendees.map(y=>y.name||y.email.split("@")[0]).filter(Boolean).slice(0,10))}catch{}let o=e.audioBlob?.size||0;if(console.log(`[Eudia] Audio blob size: ${o} bytes, duration: ${e.duration}s`),o<1e3){s.close(),new c.Notice("Recording too short or no audio captured. Please try again.");return}s.setMessage("Transcribing audio...");let u=await this.transcriptionService.transcribeAudio(e.audioBlob,i?{...i,speakerHints:a}:{speakerHints:a});s.setMessage("Analyzing content...");let g=m=>m?!!(m.summary?.trim()||m.nextSteps?.trim()):!1,l=u.sections;if(g(l)||u.text?.trim()&&(s.setMessage("Extracting insights..."),l=await this.transcriptionService.processTranscription(u.text,i)),!g(l)&&!u.text?.trim()){s.close(),new c.Notice("No audio detected. Please try recording again.");return}let p=this.buildNoteContent(l,u);await this.app.vault.modify(n,p);let d=m=>m?Array.isArray(m)?m.length:typeof m=="string"?m.split(`
`).filter(y=>y.trim()).length:0:0,f=typeof l.summary=="string"?l.summary:"";this.recordingStatusBar?.showComplete({duration:e.duration,confidence:u.confidence,meddiccCount:d(l.meddiccSignals),nextStepsCount:d(l.nextSteps),summaryPreview:f}),s.close(),f?new c.Notice("Transcription complete"):u.text?.trim()?new c.Notice("Audio captured - summary processing"):new c.Notice("Recording saved"),this.settings.autoSyncAfterTranscription&&await this.syncNoteToSalesforce()}catch(i){throw s.close(),i}}buildNoteContent(e,n){let s=y=>y==null?"":Array.isArray(y)?y.map(v=>typeof v=="object"?v.category?`**${v.category}**: ${v.signal||v.insight||""}`:JSON.stringify(v):String(v)).join(`
`):typeof y=="object"?JSON.stringify(y):String(y),i=s(e.title)||"Meeting Notes",r=s(e.summary),a=s(e.painPoints),o=s(e.productInterest),u=s(e.meddiccSignals),g=s(e.nextSteps),l=s(e.actionItems),p=s(e.keyDates),d=s(e.risksObjections),f=s(e.attendees),m=`---
title: "${i}"
date: ${new Date().toISOString().split("T")[0]}
transcribed: true
sync_to_salesforce: false
clo_meeting: false
source: ""
confidence: ${n.confidence}
---

# ${i}

## Summary

${r||"*AI summary will appear here*"}

`;return a&&!a.includes("None explicitly")&&(m+=`## Pain Points

${a}

`),o&&!o.includes("None identified")&&(m+=`## Product Interest

${o}

`),u&&(m+=`## MEDDICC Signals

${u}

`),g&&(m+=`## Next Steps

${g}

`),l&&(m+=`## Action Items

${l}

`),p&&!p.includes("No specific dates")&&(m+=`## Key Dates

${p}

`),d&&!d.includes("None raised")&&(m+=`## Risks and Objections

${d}

`),f&&(m+=`## Attendees

${f}

`),this.settings.appendTranscript&&n.text&&(m+=`---

## Full Transcript

${n.text}
`),m}async syncAccounts(e=!1){e||new c.Notice("Syncing Salesforce accounts...");try{let s=(await(0,c.requestUrl)({url:`${this.settings.serverUrl}/api/accounts/obsidian`,method:"GET",headers:{Accept:"application/json"}})).json;if(!s.success||!s.accounts){e||new c.Notice("Failed to fetch accounts from server");return}this.settings.cachedAccounts=s.accounts.map(i=>({id:i.id,name:i.name})),this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings(),e||new c.Notice(`Synced ${s.accounts.length} accounts for matching`)}catch(n){e||new c.Notice(`Failed to sync accounts: ${n.message}`)}}async scanLocalAccountFolders(){try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!e||!(e instanceof c.TFolder))return;let n=[];for(let s of e.children)s instanceof c.TFolder&&n.push({id:`local-${s.name.replace(/\s+/g,"-").toLowerCase()}`,name:s.name});this.settings.cachedAccounts=n,this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings()}catch(e){console.error("Failed to scan local account folders:",e)}}async syncNoteToSalesforce(){let e=this.app.workspace.getActiveFile();if(!e){new c.Notice("No active file to sync");return}let n=await this.app.vault.read(e),s=this.app.metadataCache.getFileCache(e)?.frontmatter;if(!s?.sync_to_salesforce){new c.Notice("Set sync_to_salesforce: true in frontmatter to enable sync");return}let i=s.account_id,r=s.account;if(!i&&r){let a=this.settings.cachedAccounts.find(o=>o.name.toLowerCase()===r.toLowerCase());a&&(i=a.id)}if(!i){let a=e.path.split("/");if(a.length>=2&&a[0]===this.settings.accountsFolder){let o=a[1],u=this.settings.cachedAccounts.find(g=>g.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);u&&(i=u.id,r=u.name)}}if(!i){new c.Notice("Could not determine account for this note");return}try{new c.Notice("Syncing to Salesforce...");let a=await(0,c.requestUrl)({url:`${this.settings.serverUrl}/api/notes/sync`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:i,accountName:r,noteTitle:e.basename,notePath:e.path,content:n,frontmatter:s,syncedAt:new Date().toISOString(),userEmail:this.settings.userEmail})});a.json?.success?new c.Notice("Synced to Salesforce"):new c.Notice("Failed to sync: "+(a.json?.error||"Unknown error"))}catch(a){new c.Notice(`Sync failed: ${a.message}`)}}async createMeetingNote(){return new Promise(e=>{new k(this.app,this,async s=>{if(!s){e();return}let i=new Date().toISOString().split("T")[0],r=s.name.replace(/[<>:"/\\|?*]/g,"_").trim(),a=`${this.settings.accountsFolder}/${r}`,o=`${i} Meeting.md`,u=`${a}/${o}`;this.app.vault.getAbstractFileByPath(a)||await this.app.vault.createFolder(a);let g=`---
title: "Meeting with ${s.name}"
date: ${i}
account: "${s.name}"
account_id: "${s.id}"
meeting_type: discovery
sync_to_salesforce: false
transcribed: false
---

# Meeting with ${s.name}

## Pre-Call Notes

*Add context or questions here*



---

## Ready to Transcribe

Click the microphone icon or \`Cmd/Ctrl+P\` \u2192 "Transcribe Meeting"

---

`,l=await this.app.vault.create(u,g);await this.app.workspace.getLeaf().openFile(l),new c.Notice(`Created meeting note for ${s.name}`),e()}).open()})}async fetchAndInsertContext(){new c.Notice("Fetching pre-call context...")}},L=class extends c.PluginSettingTab{constructor(t,e){super(t,e),this.plugin=e}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Eudia Sync & Scribe"}),t.createEl("h3",{text:"Your Profile"}),new c.Setting(t).setName("Eudia Email").setDesc("Your @eudia.com email address for calendar and Salesforce sync").addText(l=>l.setPlaceholder("yourname@eudia.com").setValue(this.plugin.settings.userEmail).onChange(async p=>{this.plugin.settings.userEmail=p.trim().toLowerCase(),await this.plugin.saveSettings()})),t.createEl("h3",{text:"Salesforce Connection"});let e=t.createDiv();e.style.cssText="padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px;";let n=e.createDiv();n.style.cssText="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";let s=n.createSpan(),i=n.createSpan(),r=e.createDiv();r.style.cssText="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;",r.setText("Connect with Salesforce to sync notes with your user attribution.");let a=e.createEl("button");a.style.cssText="padding: 10px 20px; cursor: pointer; border-radius: 6px;";let o=null,u=async()=>{if(!this.plugin.settings.userEmail)return s.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);",i.setText("Enter email first"),a.setText("Setup Required"),a.disabled=!0,!1;try{return(await(0,c.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(s.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;",i.setText("Connected to Salesforce"),a.setText("Reconnect"),a.disabled=!1,!0):(s.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;",i.setText("Not connected"),a.setText("Connect to Salesforce"),a.disabled=!1,!1)}catch{return s.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;",i.setText("Status unavailable"),a.setText("Connect to Salesforce"),a.disabled=!1,!1}},g=()=>{o&&window.clearInterval(o);let l=0,p=30;o=window.setInterval(async()=>{l++,await u()?(o&&(window.clearInterval(o),o=null),new c.Notice("Salesforce connected successfully!")):l>=p&&o&&(window.clearInterval(o),o=null)},5e3)};a.onclick=async()=>{if(!this.plugin.settings.userEmail){new c.Notice("Please enter your email first");return}let l=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(l,"_blank"),new c.Notice("Complete the Salesforce login in the popup window",5e3),g()},u(),t.createEl("h3",{text:"Server"}),new c.Setting(t).setName("GTM Brain Server").setDesc("Server URL for calendar, accounts, and sync").addText(l=>l.setValue(this.plugin.settings.serverUrl).onChange(async p=>{this.plugin.settings.serverUrl=p,await this.plugin.saveSettings()})),new c.Setting(t).setName("OpenAI API Key").setDesc("For transcription (optional if server provides)").addText(l=>{l.setPlaceholder("sk-...").setValue(this.plugin.settings.openaiApiKey).onChange(async p=>{this.plugin.settings.openaiApiKey=p,await this.plugin.saveSettings()}),l.inputEl.type="password"}),t.createEl("h3",{text:"Transcription"}),new c.Setting(t).setName("Save Audio Files").setDesc("Keep original audio recordings").addToggle(l=>l.setValue(this.plugin.settings.saveAudioFiles).onChange(async p=>{this.plugin.settings.saveAudioFiles=p,await this.plugin.saveSettings()})),new c.Setting(t).setName("Append Full Transcript").setDesc("Include complete transcript in notes").addToggle(l=>l.setValue(this.plugin.settings.appendTranscript).onChange(async p=>{this.plugin.settings.appendTranscript=p,await this.plugin.saveSettings()})),t.createEl("h3",{text:"Sync"}),new c.Setting(t).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle(l=>l.setValue(this.plugin.settings.syncOnStartup).onChange(async p=>{this.plugin.settings.syncOnStartup=p,await this.plugin.saveSettings()})),new c.Setting(t).setName("Auto-Sync After Transcription").setDesc("Push notes to Salesforce after transcription").addToggle(l=>l.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async p=>{this.plugin.settings.autoSyncAfterTranscription=p,await this.plugin.saveSettings()})),t.createEl("h3",{text:"Folders"}),new c.Setting(t).setName("Accounts Folder").setDesc("Where account folders are stored").addText(l=>l.setValue(this.plugin.settings.accountsFolder).onChange(async p=>{this.plugin.settings.accountsFolder=p||"Accounts",await this.plugin.saveSettings()})),new c.Setting(t).setName("Recordings Folder").setDesc("Where audio files are saved").addText(l=>l.setValue(this.plugin.settings.recordingsFolder).onChange(async p=>{this.plugin.settings.recordingsFolder=p||"Recordings",await this.plugin.saveSettings()})),t.createEl("h3",{text:"Actions"}),new c.Setting(t).setName("Sync Accounts Now").setDesc(`${this.plugin.settings.cachedAccounts.length} accounts available for matching (folders are pre-loaded)`).addButton(l=>l.setButtonText("Sync").setCta().onClick(async()=>{await this.plugin.syncAccounts(),this.display()})),this.plugin.settings.lastSyncTime&&t.createEl("p",{text:`Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()}`,cls:"setting-item-description"}),t.createEl("p",{text:`Audio transcription: ${w.isSupported()?"Supported":"Not supported"}`,cls:"setting-item-description"})}};
