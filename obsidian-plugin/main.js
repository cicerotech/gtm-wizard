var P=Object.defineProperty;var H=Object.getOwnPropertyDescriptor;var U=Object.getOwnPropertyNames;var B=Object.prototype.hasOwnProperty;var G=(f,n)=>{for(var e in n)P(f,e,{get:n[e],enumerable:!0})},K=(f,n,e,t)=>{if(n&&typeof n=="object"||typeof n=="function")for(let i of U(n))!B.call(f,i)&&i!==e&&P(f,i,{get:()=>n[i],enumerable:!(t=H(n,i))||t.enumerable});return f};var z=f=>K(P({},"__esModule",{value:!0}),f);var Q={};G(Q,{default:()=>D});module.exports=z(Q);var l=require("obsidian");var I=class{constructor(){this.mediaRecorder=null;this.audioChunks=[];this.stream=null;this.startTime=0;this.pausedDuration=0;this.pauseStartTime=0;this.durationInterval=null;this.audioContext=null;this.analyser=null;this.levelInterval=null;this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0};this.stateCallback=null}onStateChange(n){this.stateCallback=n}getSupportedMimeType(){let n=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];for(let e of n)if(MediaRecorder.isTypeSupported(e))return e;return"audio/webm"}async startRecording(){if(this.state.isRecording)throw new Error("Already recording");try{this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0,sampleRate:48e3,channelCount:1}}),this.setupAudioAnalysis();let n=this.getSupportedMimeType();this.mediaRecorder=new MediaRecorder(this.stream,{mimeType:n,audioBitsPerSecond:96e3}),this.audioChunks=[],this.mediaRecorder.ondataavailable=e=>{e.data.size>0&&this.audioChunks.push(e.data)},this.mediaRecorder.start(1e3),this.startTime=Date.now(),this.pausedDuration=0,this.state={isRecording:!0,isPaused:!1,duration:0,audioLevel:0},this.startDurationTracking(),this.startLevelTracking(),this.notifyStateChange()}catch(n){throw this.cleanup(),new Error(`Failed to start recording: ${n.message}`)}}setupAudioAnalysis(){if(this.stream)try{this.audioContext=new AudioContext;let n=this.audioContext.createMediaStreamSource(this.stream);this.analyser=this.audioContext.createAnalyser(),this.analyser.fftSize=256,n.connect(this.analyser)}catch(n){console.warn("Failed to set up audio analysis:",n)}}startDurationTracking(){this.durationInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused){let n=Date.now()-this.startTime-this.pausedDuration;this.state.duration=Math.floor(n/1e3),this.notifyStateChange()}},100)}startLevelTracking(){if(!this.analyser)return;let n=new Uint8Array(this.analyser.frequencyBinCount);this.levelInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused&&this.analyser){this.analyser.getByteFrequencyData(n);let e=0;for(let i=0;i<n.length;i++)e+=n[i];let t=e/n.length;this.state.audioLevel=Math.min(100,Math.round(t/255*100*2)),this.notifyStateChange()}},50)}pauseRecording(){!this.state.isRecording||this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="recording"&&(this.mediaRecorder.pause(),this.pauseStartTime=Date.now(),this.state.isPaused=!0,this.notifyStateChange())}resumeRecording(){!this.state.isRecording||!this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="paused"&&(this.mediaRecorder.resume(),this.pausedDuration+=Date.now()-this.pauseStartTime,this.state.isPaused=!1,this.notifyStateChange())}async stopRecording(){return new Promise((n,e)=>{if(!this.mediaRecorder||!this.state.isRecording){e(new Error("Not currently recording"));return}let t=this.mediaRecorder.mimeType,i=this.state.duration,a=!1,s=setTimeout(()=>{if(!a){a=!0,console.warn("AudioRecorder: onstop timeout, forcing completion");try{let r=new Blob(this.audioChunks,{type:t}),o=new Date,c=o.toISOString().split("T")[0],p=o.toTimeString().split(" ")[0].replace(/:/g,"-"),d=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm",m=`recording-${c}-${p}.${d}`;this.cleanup(),n({audioBlob:r,duration:i,mimeType:t,filename:m})}catch{this.cleanup(),e(new Error("Failed to process recording after timeout"))}}},1e4);this.mediaRecorder.onstop=()=>{if(!a){a=!0,clearTimeout(s);try{console.log(`[AudioRecorder] Chunks collected: ${this.audioChunks.length}`);let r=new Blob(this.audioChunks,{type:t});console.log(`[AudioRecorder] Blob size: ${r.size} bytes`);let o=new Date,c=o.toISOString().split("T")[0],p=o.toTimeString().split(" ")[0].replace(/:/g,"-"),d=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm",m=`recording-${c}-${p}.${d}`;this.cleanup(),n({audioBlob:r,duration:i,mimeType:t,filename:m})}catch(r){this.cleanup(),e(r)}}},this.mediaRecorder.onerror=r=>{a||(a=!0,clearTimeout(s),this.cleanup(),e(new Error("Recording error occurred")))},this.mediaRecorder.state==="recording"&&this.mediaRecorder.requestData(),setTimeout(()=>{this.mediaRecorder&&this.mediaRecorder.state!=="inactive"&&this.mediaRecorder.stop()},100)})}cancelRecording(){this.cleanup()}cleanup(){this.durationInterval&&(clearInterval(this.durationInterval),this.durationInterval=null),this.levelInterval&&(clearInterval(this.levelInterval),this.levelInterval=null),this.audioContext&&(this.audioContext.close().catch(()=>{}),this.audioContext=null,this.analyser=null),this.stream&&(this.stream.getTracks().forEach(n=>n.stop()),this.stream=null),this.mediaRecorder=null,this.audioChunks=[],this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0},this.notifyStateChange()}getState(){return{...this.state}}static isSupported(){return!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder)}notifyStateChange(){this.stateCallback&&this.stateCallback({...this.state})}static formatDuration(n){let e=Math.floor(n/60),t=n%60;return`${e.toString().padStart(2,"0")}:${t.toString().padStart(2,"0")}`}static async blobToBase64(n){return new Promise((e,t)=>{let i=new FileReader;i.onload=()=>{let s=i.result.split(",")[1];e(s)},i.onerror=t,i.readAsDataURL(n)})}static async blobToArrayBuffer(n){return n.arrayBuffer()}async start(){return this.startRecording()}async stop(){return this.stopRecording()}pause(){return this.pauseRecording()}resume(){return this.resumeRecording()}cancel(){return this.cancelRecording()}isRecording(){return this.state.isRecording}};var x=require("obsidian");var M=class{constructor(){this.salesforceAccounts=[]}setAccounts(n){this.salesforceAccounts=n}detectAccount(n,e,t){if(n){let i=this.detectFromTitle(n);if(i.confidence>=70)return i}if(t){let i=this.detectFromFilePath(t);if(i.confidence>=70)return i}if(e&&e.length>0){let i=this.detectFromAttendees(e);if(i.confidence>=50)return i}return{account:null,accountId:null,confidence:0,source:"none",evidence:"No account detected from available context"}}detectFromTitle(n){if(!n)return{account:null,accountId:null,confidence:0,source:"title",evidence:"No title"};let e=[{regex:/^([A-Za-z0-9][^-–—]+?)\s*[-–—]\s*(?:[A-Z][a-z]+|[A-Za-z]{2,})/,confidence:85},{regex:/(?:call|meeting|sync|check-in|demo|discovery)\s+(?:with|re:?|@)\s+([^-–—]+?)(?:\s*[-–—]|$)/i,confidence:80},{regex:/^([A-Za-z][^-–—]+?)\s+(?:discovery|demo|review|kickoff|intro|onboarding|sync)\s*(?:call)?$/i,confidence:75},{regex:/^([^:]+?):\s+/i,confidence:70},{regex:/^\[([^\]]+)\]/,confidence:75}],t=["weekly","daily","monthly","internal","team","1:1","one on one","standup","sync","meeting","call","notes","monday","tuesday","wednesday","thursday","friday","untitled","new","test"];for(let i of e){let a=n.match(i.regex);if(a&&a[1]){let s=a[1].trim();if(t.some(o=>s.toLowerCase()===o)||s.length<2)continue;let r=this.fuzzyMatchSalesforce(s);return r?{account:r.name,accountId:r.id,confidence:Math.min(i.confidence+10,100),source:"salesforce_match",evidence:`Matched "${s}" from title to Salesforce account "${r.name}"`}:{account:s,accountId:null,confidence:i.confidence,source:"title",evidence:"Extracted from meeting title pattern"}}}return{account:null,accountId:null,confidence:0,source:"title",evidence:"No pattern matched"}}detectFromFilePath(n){let e=n.match(/Accounts\/([^\/]+)\//i);if(e&&e[1]){let t=e[1].trim(),i=this.fuzzyMatchSalesforce(t);return i?{account:i.name,accountId:i.id,confidence:95,source:"salesforce_match",evidence:`File in account folder "${t}" matched to "${i.name}"`}:{account:t,accountId:null,confidence:85,source:"title",evidence:`File located in Accounts/${t} folder`}}return{account:null,accountId:null,confidence:0,source:"none",evidence:"Not in Accounts folder"}}detectFromAttendees(n){let e=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com"],t=new Set;for(let r of n){let c=r.toLowerCase().match(/@([a-z0-9.-]+)/);if(c){let p=c[1];!p.includes("eudia.com")&&!e.includes(p)&&t.add(p)}}if(t.size===0)return{account:null,accountId:null,confidence:0,source:"attendee_domain",evidence:"No external domains"};for(let r of t){let o=r.split(".")[0],c=o.charAt(0).toUpperCase()+o.slice(1),p=this.fuzzyMatchSalesforce(c);if(p)return{account:p.name,accountId:p.id,confidence:75,source:"salesforce_match",evidence:`Matched attendee domain ${r} to "${p.name}"`}}let i=Array.from(t)[0],a=i.split(".")[0];return{account:a.charAt(0).toUpperCase()+a.slice(1),accountId:null,confidence:50,source:"attendee_domain",evidence:`Guessed from external attendee domain: ${i}`}}fuzzyMatchSalesforce(n){if(!n||this.salesforceAccounts.length===0)return null;let e=n.toLowerCase().trim();for(let t of this.salesforceAccounts)if(t.name?.toLowerCase()===e)return t;for(let t of this.salesforceAccounts)if(t.name?.toLowerCase().startsWith(e))return t;for(let t of this.salesforceAccounts)if(t.name?.toLowerCase().includes(e))return t;for(let t of this.salesforceAccounts)if(e.includes(t.name?.toLowerCase()))return t;return null}suggestAccounts(n,e=10){if(!n||n.length<2)return this.salesforceAccounts.slice(0,e).map(a=>({...a,score:0}));let t=n.toLowerCase(),i=[];for(let a of this.salesforceAccounts){let s=a.name?.toLowerCase()||"",r=0;s===t?r=100:s.startsWith(t)?r=90:s.includes(t)?r=70:t.includes(s)&&(r=50),r>0&&i.push({...a,score:r})}return i.sort((a,s)=>s.score-a.score).slice(0,e)}},ne=new M;function O(f,n){let e="";return(n?.account||n?.opportunities?.length)&&(e=`
ACCOUNT CONTEXT (use to inform your analysis):
${n.account?`- Account: ${n.account.name}`:""}
${n.account?.owner?`- Account Owner: ${n.account.owner}`:""}
${n.opportunities?.length?`- Open Opportunities: ${n.opportunities.map(t=>`${t.name} (${t.stage}, $${(t.acv/1e3).toFixed(0)}k)`).join("; ")}`:""}
${n.contacts?.length?`- Known Contacts: ${n.contacts.slice(0,5).map(t=>`${t.name} - ${t.title}`).join("; ")}`:""}
`),`You are a senior sales intelligence analyst for Eudia, an AI-powered legal technology company. Your role is to extract precise, actionable intelligence from sales meeting transcripts.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies. Our products help in-house legal teams work faster on contracting, compliance, and M&A due diligence. We sell to CLOs, General Counsels, VP Legal, Legal Ops Directors, and Deputy GCs.

${f?`CURRENT ACCOUNT: ${f}`:""}
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
- Action items have clear owners`}var T=class{constructor(n,e){this.openaiApiKey=null;this.serverUrl=n,this.openaiApiKey=e||null}setServerUrl(n){this.serverUrl=n}setOpenAIKey(n){this.openaiApiKey=n}async transcribeAndSummarize(n,e,t,i,a){try{let s=await(0,x.requestUrl)({url:`${this.serverUrl}/api/transcribe-and-summarize`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:n,mimeType:e,accountName:t,accountId:i,openaiApiKey:this.openaiApiKey,context:a?{customerBrain:a.account?.customerBrain,opportunities:a.opportunities,contacts:a.contacts}:void 0,systemPrompt:O(t,a)})});return s.json.success?{success:!0,transcript:s.json.transcript||"",sections:this.normalizeSections(s.json.sections),duration:s.json.duration||0}:{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:s.json.error||"Transcription failed"}}catch(s){console.error("Server transcription error:",s),s.response&&console.error("Server response:",s.response);let r="";try{s.response?.json?.error?r=s.response.json.error:typeof s.response=="string"&&(r=JSON.parse(s.response).error||"")}catch{}let o=r||`Transcription failed: ${s.message}`;return s.message?.includes("413")?o="Audio file too large for server. Try a shorter recording.":s.message?.includes("500")?o=r||"Server error during transcription. Please try again.":(s.message?.includes("Failed to fetch")||s.message?.includes("NetworkError"))&&(o="Could not reach transcription server. Check your internet connection."),console.error("Final error message:",o),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:o}}}async transcribeLocal(n,e,t,i){if(!this.openaiApiKey)return{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:"No OpenAI API key configured. Add it in plugin settings."};try{let a=atob(n),s=new Uint8Array(a.length);for(let h=0;h<a.length;h++)s[h]=a.charCodeAt(h);let r=new Blob([s],{type:e}),o=new FormData,c=e.includes("webm")?"webm":e.includes("mp4")?"m4a":"ogg";o.append("file",r,`audio.${c}`),o.append("model","whisper-1"),o.append("response_format","verbose_json"),o.append("language","en");let p=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`},body:o});if(!p.ok){let h=await p.text();throw new Error(`Whisper API error: ${p.status} - ${h}`)}let d=await p.json(),m=d.text||"",u=d.duration||0,g=await this.summarizeLocal(m,t,i);return{success:!0,transcript:m,sections:g,duration:u}}catch(a){return console.error("Local transcription error:",a),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:a.message||"Local transcription failed"}}}async summarizeLocal(n,e,t){if(!this.openaiApiKey)return this.getEmptySections();try{let i=O(e,t),a=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o",messages:[{role:"system",content:i},{role:"user",content:`Analyze this meeting transcript:

${n.substring(0,1e5)}`}],temperature:.2,max_tokens:6e3})});if(!a.ok)return console.warn("GPT summarization failed, returning empty sections"),this.getEmptySections();let r=(await a.json()).choices?.[0]?.message?.content||"";return this.parseSections(r)}catch(i){return console.error("Local summarization error:",i),this.getEmptySections()}}parseSections(n){let e=this.getEmptySections(),t={summary:"summary",attendees:"attendees","meddicc signals":"meddiccSignals","product interest":"productInterest","pain points":"painPoints","buying triggers":"buyingTriggers","key dates":"keyDates","next steps":"nextSteps","action items":"actionItems","action items (internal)":"actionItems","deal signals":"dealSignals","risks & objections":"risksObjections","risks and objections":"risksObjections","competitive intelligence":"competitiveIntel"},i=/## ([^\n]+)\n([\s\S]*?)(?=## |$)/g,a;for(;(a=i.exec(n))!==null;){let s=a[1].trim().toLowerCase(),r=a[2].trim(),o=t[s];o&&(e[o]=r)}return e}normalizeSections(n){let e=this.getEmptySections();return n?{...e,...n}:e}async getMeetingContext(n){try{let e=await(0,x.requestUrl)({url:`${this.serverUrl}/api/meeting-context/${n}`,method:"GET",headers:{Accept:"application/json"}});return e.json.success?{success:!0,account:e.json.account,opportunities:e.json.opportunities,contacts:e.json.contacts,lastMeeting:e.json.lastMeeting}:{success:!1,error:e.json.error||"Failed to fetch context"}}catch(e){return console.error("Meeting context error:",e),{success:!1,error:e.message||"Network error"}}}async syncToSalesforce(n,e,t,i,a,s){try{let r=await(0,x.requestUrl)({url:`${this.serverUrl}/api/transcription/sync-to-salesforce`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:n,accountName:e,noteTitle:t,sections:i,transcript:a,meetingDate:s||new Date().toISOString(),syncedAt:new Date().toISOString()})});return r.json.success?{success:!0,customerBrainUpdated:r.json.customerBrainUpdated,eventCreated:r.json.eventCreated,eventId:r.json.eventId,contactsCreated:r.json.contactsCreated,tasksCreated:r.json.tasksCreated}:{success:!1,error:r.json.error||"Sync failed"}}catch(r){return console.error("Salesforce sync error:",r),{success:!1,error:r.message||"Network error"}}}getEmptySections(){return{summary:"",attendees:"",meddiccSignals:"",productInterest:"",painPoints:"",buyingTriggers:"",keyDates:"",nextSteps:"",actionItems:"",dealSignals:"",risksObjections:"",competitiveIntel:""}}static formatSectionsForNote(n,e){let t="";return n.summary&&(t+=`## TL;DR

${n.summary}

`),n.painPoints&&!n.painPoints.includes("None explicitly stated")&&(t+=`## Pain Points

${n.painPoints}

`),n.productInterest&&!n.productInterest.includes("None identified")&&(t+=`## Product Interest

${n.productInterest}

`),n.meddiccSignals&&(t+=`## MEDDICC Signals

${n.meddiccSignals}

`),n.nextSteps&&(t+=`## Next Steps

${n.nextSteps}

`),n.actionItems&&(t+=`## Action Items (Internal)

${n.actionItems}

`),n.keyDates&&!n.keyDates.includes("No specific dates")&&(t+=`## Key Dates

${n.keyDates}

`),n.buyingTriggers&&(t+=`## Buying Triggers

${n.buyingTriggers}

`),n.dealSignals&&(t+=`## Deal Signals

${n.dealSignals}

`),n.risksObjections&&!n.risksObjections.includes("None raised")&&(t+=`## Risks & Objections

${n.risksObjections}

`),n.competitiveIntel&&!n.competitiveIntel.includes("No competitive")&&(t+=`## Competitive Intelligence

${n.competitiveIntel}

`),n.attendees&&(t+=`## Attendees

${n.attendees}

`),e&&(t+=`---

<details>
<summary><strong>Full Transcript</strong></summary>

${e}

</details>
`),t}static formatSectionsWithAudio(n,e,t){let i=this.formatSectionsForNote(n,e);return t&&(i+=`
---

## Recording

![[${t}]]
`),i}static formatContextForNote(n){if(!n.success)return"";let e=`## Pre-Call Context

`;if(n.account&&(e+=`**Account:** ${n.account.name}
`,e+=`**Owner:** ${n.account.owner}

`),n.opportunities&&n.opportunities.length>0){e+=`### Open Opportunities

`;for(let t of n.opportunities){let i=t.acv?`$${(t.acv/1e3).toFixed(0)}k`:"TBD";e+=`- **${t.name}** - ${t.stage} - ${i}`,t.targetSignDate&&(e+=` - Target: ${new Date(t.targetSignDate).toLocaleDateString()}`),e+=`
`}e+=`
`}if(n.contacts&&n.contacts.length>0){e+=`### Key Contacts

`;for(let t of n.contacts.slice(0,5))e+=`- **${t.name}**`,t.title&&(e+=` - ${t.title}`),e+=`
`;e+=`
`}if(n.lastMeeting&&(e+=`### Last Meeting

`,e+=`${new Date(n.lastMeeting.date).toLocaleDateString()} - ${n.lastMeeting.subject}

`),n.account?.customerBrain){let t=n.account.customerBrain.substring(0,500);t&&(e+=`### Recent Notes

`,e+=`${t}${n.account.customerBrain.length>500?"...":""}

`)}return e+=`---

`,e}async blobToBase64(n){return new Promise((e,t)=>{let i=new FileReader;i.onload=()=>{let s=i.result.split(",")[1];e(s)},i.onerror=t,i.readAsDataURL(n)})}async transcribeAudio(n,e){try{let t=await this.blobToBase64(n),i=n.type||"audio/webm",a=await this.transcribeAndSummarize(t,i,e?.accountName,e?.accountId);return{text:a.transcript,confidence:a.success?.95:0,duration:a.duration,sections:a.sections}}catch(t){return console.error("transcribeAudio error:",t),{text:"",confidence:0,duration:0,sections:this.getEmptySections()}}}async processTranscription(n,e){if(!n||n.trim().length===0)return this.getEmptySections();try{if(this.openaiApiKey){let t=`Analyze this meeting transcript and extract structured information:

TRANSCRIPT:
${n}

Extract the following in JSON format:
{
  "summary": "2-3 sentence meeting summary",
  "keyPoints": ["key point 1", "key point 2", ...],
  "nextSteps": ["action item 1", "action item 2", ...],
  "meddiccSignals": [{"category": "Metrics|Economic Buyer|Decision Criteria|Decision Process|Identify Pain|Champion|Competition", "signal": "the signal text", "confidence": 0.8}],
  "attendees": ["name 1", "name 2", ...]
}`,i=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:"You are a sales meeting analyst. Extract structured information from transcripts. Return valid JSON only."},{role:"user",content:t}],temperature:.3,max_tokens:2e3})});if(i.ok){let r=((await i.json()).choices?.[0]?.message?.content||"").match(/\{[\s\S]*\}/);if(r){let o=JSON.parse(r[0]),c=u=>Array.isArray(u)?u.map(g=>`- [ ] ${g}`).join(`
`):u||"",p=u=>Array.isArray(u)?u.map(g=>`- ${g}`).join(`
`):u||"",d=u=>Array.isArray(u)?u.map(g=>typeof g=="object"&&g.category?`**${g.category}**: ${g.signal||g.insight||""}`:`- ${g}`).join(`
`):u||"",m=u=>Array.isArray(u)?u.map(g=>`- ${g}`).join(`
`):u||"";return{summary:o.summary||"",painPoints:p(o.keyPoints||o.painPoints),productInterest:"",meddiccSignals:d(o.meddiccSignals),nextSteps:c(o.nextSteps),actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:m(o.attendees),transcript:n}}}}return{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:n}}catch(t){return console.error("processTranscription error:",t),{summary:"",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:n}}}};var k=require("obsidian"),A=class{constructor(n,e){this.serverUrl=n,this.userEmail=e.toLowerCase()}setUserEmail(n){this.userEmail=n.toLowerCase()}setServerUrl(n){this.serverUrl=n}async getTodaysMeetings(){if(!this.userEmail)return{success:!1,date:new Date().toISOString().split("T")[0],email:"",meetingCount:0,meetings:[],error:"User email not configured"};try{return(await(0,k.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/today`,method:"GET",headers:{Accept:"application/json"}})).json}catch(n){return console.error("Failed to fetch today's meetings:",n),{success:!1,date:new Date().toISOString().split("T")[0],email:this.userEmail,meetingCount:0,meetings:[],error:n.message||"Failed to fetch calendar"}}}async getWeekMeetings(){if(!this.userEmail)return{success:!1,startDate:"",endDate:"",email:"",totalMeetings:0,byDay:{},error:"User email not configured"};try{return(await(0,k.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/week`,method:"GET",headers:{Accept:"application/json"}})).json}catch(n){return console.error("Failed to fetch week's meetings:",n),{success:!1,startDate:"",endDate:"",email:this.userEmail,totalMeetings:0,byDay:{},error:n.message||"Failed to fetch calendar"}}}async getMeetingsInRange(n,e){if(!this.userEmail)return[];try{let t=n.toISOString().split("T")[0],i=e.toISOString().split("T")[0],a=await(0,k.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${t}&end=${i}`,method:"GET",headers:{Accept:"application/json"}});return a.json.success?a.json.meetings||[]:[]}catch(t){return console.error("Failed to fetch calendar range:",t),[]}}async getCurrentMeeting(){let n=await this.getTodaysMeetings();if(!n.success||n.meetings.length===0)return{meeting:null,isNow:!1};let e=new Date;for(let t of n.meetings){let i=new Date(t.start),a=new Date(t.end);if(e>=i&&e<=a)return{meeting:t,isNow:!0};let s=(i.getTime()-e.getTime())/(1e3*60);if(s>0&&s<=15)return{meeting:t,isNow:!1,minutesUntilStart:Math.ceil(s)}}return{meeting:null,isNow:!1}}async getMeetingsForAccount(n){let e=await this.getWeekMeetings();if(!e.success)return[];let t=[];Object.values(e.byDay).forEach(a=>{t.push(...a)});let i=n.toLowerCase();return t.filter(a=>a.accountName?.toLowerCase().includes(i)||a.subject.toLowerCase().includes(i)||a.attendees.some(s=>s.email.toLowerCase().includes(i.split(" ")[0])))}static formatMeetingForNote(n){let e=n.attendees.filter(t=>t.isExternal!==!1).map(t=>t.name||t.email.split("@")[0]).slice(0,5).join(", ");return{title:n.subject,attendees:e,meetingStart:n.start,accountName:n.accountName}}static getDayName(n){let e=new Date(n),t=new Date;t.setHours(0,0,0,0);let i=new Date(e);i.setHours(0,0,0,0);let a=(i.getTime()-t.getTime())/(1e3*60*60*24);return a===0?"Today":a===1?"Tomorrow":e.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}static formatTime(n){return new Date(n).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0})}static getMeetingDuration(n,e){let t=new Date(n),i=new Date(e);return Math.round((i.getTime()-t.getTime())/(1e3*60))}};var V=["ai-contracting-tech","ai-contracting-services","ai-compliance-tech","ai-compliance-services","ai-ma-tech","ai-ma-services","sigma"],Y=["metrics-identified","economic-buyer-identified","decision-criteria-discussed","decision-process-discussed","pain-confirmed","champion-identified","competition-mentioned"],q=["progressing","stalled","at-risk","champion-engaged","early-stage"],J=["discovery","demo","negotiation","qbr","implementation","follow-up"],X=`You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

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
}`,$=class{constructor(n,e){this.openaiApiKey=null;this.serverUrl=n,this.openaiApiKey=e||null}setOpenAIKey(n){this.openaiApiKey=n}setServerUrl(n){this.serverUrl=n}async extractTags(n){let e=this.buildTagContext(n);if(!e.trim())return{success:!1,tags:this.getEmptyTags(),error:"No content to analyze"};try{return await this.extractTagsViaServer(e)}catch(t){return console.warn("Server tag extraction failed, trying local:",t.message),this.openaiApiKey?await this.extractTagsLocal(e):this.extractTagsRuleBased(n)}}buildTagContext(n){let e=[];return n.summary&&e.push(`SUMMARY:
${n.summary}`),n.productInterest&&e.push(`PRODUCT INTEREST:
${n.productInterest}`),n.meddiccSignals&&e.push(`MEDDICC SIGNALS:
${n.meddiccSignals}`),n.dealSignals&&e.push(`DEAL SIGNALS:
${n.dealSignals}`),n.painPoints&&e.push(`PAIN POINTS:
${n.painPoints}`),n.attendees&&e.push(`ATTENDEES:
${n.attendees}`),e.join(`

`)}async extractTagsViaServer(n){let e=await fetch(`${this.serverUrl}/api/extract-tags`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:n,openaiApiKey:this.openaiApiKey})});if(!e.ok)throw new Error(`Server returned ${e.status}`);let t=await e.json();if(!t.success)throw new Error(t.error||"Tag extraction failed");return{success:!0,tags:this.validateAndNormalizeTags(t.tags)}}async extractTagsLocal(n){if(!this.openaiApiKey)return{success:!1,tags:this.getEmptyTags(),error:"No OpenAI API key configured"};try{let e=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:X},{role:"user",content:`Extract tags from this meeting content:

${n}`}],temperature:.1,response_format:{type:"json_object"}})});if(!e.ok)throw new Error(`OpenAI returned ${e.status}`);let i=(await e.json()).choices?.[0]?.message?.content;if(!i)throw new Error("No content in response");let a=JSON.parse(i);return{success:!0,tags:this.validateAndNormalizeTags(a)}}catch(e){return console.error("Local tag extraction error:",e),{success:!1,tags:this.getEmptyTags(),error:e.message||"Tag extraction failed"}}}extractTagsRuleBased(n){let e=Object.values(n).join(" ").toLowerCase(),t={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:.4};return(e.includes("contract")||e.includes("contracting"))&&(e.includes("service")?t.product_interest.push("ai-contracting-services"):t.product_interest.push("ai-contracting-tech")),e.includes("compliance")&&t.product_interest.push("ai-compliance-tech"),(e.includes("m&a")||e.includes("due diligence")||e.includes("acquisition"))&&t.product_interest.push("ai-ma-tech"),e.includes("sigma")&&t.product_interest.push("sigma"),(e.includes("metric")||e.includes("%")||e.includes("roi")||e.includes("save"))&&t.meddicc_signals.push("metrics-identified"),(e.includes("budget")||e.includes("cfo")||e.includes("economic buyer"))&&t.meddicc_signals.push("economic-buyer-identified"),(e.includes("pain")||e.includes("challenge")||e.includes("problem")||e.includes("struggle"))&&t.meddicc_signals.push("pain-confirmed"),(e.includes("champion")||e.includes("advocate")||e.includes("sponsor"))&&t.meddicc_signals.push("champion-identified"),(e.includes("competitor")||e.includes("alternative")||e.includes("vs")||e.includes("compared to"))&&t.meddicc_signals.push("competition-mentioned"),(e.includes("next step")||e.includes("follow up")||e.includes("schedule"))&&(t.deal_health="progressing"),(e.includes("concern")||e.includes("objection")||e.includes("hesitant")||e.includes("risk"))&&(t.deal_health="at-risk"),e.includes("demo")||e.includes("show you")||e.includes("demonstration")?t.meeting_type="demo":e.includes("pricing")||e.includes("negotiat")||e.includes("contract terms")?t.meeting_type="negotiation":e.includes("quarterly")||e.includes("qbr")||e.includes("review")?t.meeting_type="qbr":(e.includes("implementation")||e.includes("onboard")||e.includes("rollout"))&&(t.meeting_type="implementation"),{success:!0,tags:t}}validateAndNormalizeTags(n){let e={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:n.confidence||.8};return Array.isArray(n.product_interest)&&(e.product_interest=n.product_interest.filter(t=>V.includes(t))),Array.isArray(n.meddicc_signals)&&(e.meddicc_signals=n.meddicc_signals.filter(t=>Y.includes(t))),q.includes(n.deal_health)&&(e.deal_health=n.deal_health),J.includes(n.meeting_type)&&(e.meeting_type=n.meeting_type),Array.isArray(n.key_stakeholders)&&(e.key_stakeholders=n.key_stakeholders.slice(0,10)),e}getEmptyTags(){return{product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:0}}static formatTagsForFrontmatter(n){return{product_interest:n.product_interest.length>0?n.product_interest:null,meddicc_signals:n.meddicc_signals.length>0?n.meddicc_signals:null,deal_health:n.deal_health,meeting_type:n.meeting_type,key_stakeholders:n.key_stakeholders.length>0?n.key_stakeholders:null,tag_confidence:Math.round(n.confidence*100)}}static generateTagSummary(n){let e=[];return n.product_interest.length>0&&e.push(`**Products:** ${n.product_interest.join(", ")}`),n.meddicc_signals.length>0&&e.push(`**MEDDICC:** ${n.meddicc_signals.join(", ")}`),e.push(`**Deal Health:** ${n.deal_health}`),e.push(`**Meeting Type:** ${n.meeting_type}`),e.join(" | ")}};var w={version:"2026-02",lastUpdated:"2026-02-03",businessLeads:{"alex.fox@eudia.com":{email:"alex.fox@eudia.com",name:"Alex Fox",accounts:[{id:"001Wj00000mCFsTIAW",name:"Arabic Computer Systems"},{id:"001Wj00000fFuFMIA0",name:"Bank of Ireland"},{id:"001Wj00000mCFsuIAG",name:"Corrigan & Corrigan Solicitors LLP"},{id:"001Wj00000mCFscIAG",name:"Department of Children, Disability and Equality"},{id:"001Wj00000mCFsNIAW",name:"Department of Climate, Energy and the Environment"},{id:"001Wj00000mCFsUIAW",name:"ESB NI/Electric Ireland"},{id:"001Wj00000TV1WzIAL",name:"OpenAi"},{id:"001Wj00000mCFrMIAW",name:"Sisk Group"}]},"ananth@eudia.com":{email:"ananth@eudia.com",name:"Ananth Cherukupally",accounts:[{id:"001Wj00000RjuhjIAB",name:"Citadel"},{id:"001Wj00000cejJzIAI",name:"CVC"},{id:"001Wj00000Y64qhIAB",name:"Emigrant Bank"},{id:"001Hp00003kIrIIIA0",name:"GE Healthcare"},{id:"001Hp00003kIrIJIA0",name:"GE Vernova"},{id:"001Wj00000Z6zhPIAR",name:"Liberty Mutual Insurance"},{id:"001Wj00000bWBlQIAW",name:"Pegasystems"},{id:"001Wj00000bzz9MIAQ",name:"Peregrine Hospitality"},{id:"001Hp00003ljCJ8IAM",name:"Petco"},{id:"001Hp00003kKXSIIA4",name:"Pure Storage"},{id:"001Wj00000lxbYRIAY",name:"Spark Brighter Thinking"},{id:"001Wj00000tOAoEIAW",name:"TA Associates"},{id:"001Wj00000bn8VSIAY",name:"Vista Equity Partners"}]},"asad.hussain@eudia.com":{email:"asad.hussain@eudia.com",name:"Asad Hussain",accounts:[{id:"001Hp00003kIrCyIAK",name:"Airbnb"},{id:"001Hp00003kIrEeIAK",name:"Amazon"},{id:"001Hp00003kIrCzIAK",name:"American Express"},{id:"001Wj00000TUdXwIAL",name:"Anthropic"},{id:"001Wj00000Y0g8ZIAR",name:"Asana"},{id:"001Wj00000c0wRAIAY",name:"Away"},{id:"001Wj00000WTMCRIA5",name:"BNY Mellon"},{id:"001Wj00000mosEXIAY",name:"Carta"},{id:"001Wj00000ah6dkIAA",name:"Charlesbank Capital Partners"},{id:"001Hp00003kIrE5IAK",name:"Coherent"},{id:"001Hp00003kIrGzIAK",name:"Deloitte"},{id:"001Hp00003kIrE6IAK",name:"DHL"},{id:"001Wj00000W8ZKlIAN",name:"Docusign"},{id:"001Hp00003kIrHNIA0",name:"Ecolab"},{id:"001Hp00003kIrI3IAK",name:"Fluor"},{id:"001Hp00003kIrIAIA0",name:"Fox"},{id:"001Hp00003kJ9oeIAC",name:"Fresh Del Monte"},{id:"001Hp00003kIrIKIA0",name:"Geico"},{id:"001Wj00000oqVXgIAM",name:"Goosehead Insurance"},{id:"001Wj00000tuXZbIAM",name:"Gopuff"},{id:"001Hp00003kIrItIAK",name:"HSBC"},{id:"001Hp00003kIrIyIAK",name:"Huntsman"},{id:"001Wj00000hdoLxIAI",name:"Insight Enterprises Inc."},{id:"001Hp00003kIrKCIA0",name:"Mass Mutual Life Insurance"},{id:"001Hp00003kIrKOIA0",name:"Microsoft"},{id:"001Wj00000lyDQkIAM",name:"MidOcean Partners"},{id:"001Hp00003kIrKTIA0",name:"Morgan Stanley"},{id:"001Wj00000kNp2XIAS",name:"Plusgrade"},{id:"001Hp00003kIrMKIA0",name:"ServiceNow"},{id:"001Hp00003kIrECIA0",name:"Southwest Airlines"},{id:"001Wj00000tuRNoIAM",name:"Virtusa"},{id:"001Hp00003kIrNwIAK",name:"W.W. Grainger"},{id:"001Wj00000bzz9NIAQ",name:"Wealth Partners Capital Group"},{id:"001Wj00000tuolfIAA",name:"Wynn Las Vegas"},{id:"001Wj00000uzs1fIAA",name:"Zero RFI"}]},"conor.molloy@eudia.com":{email:"conor.molloy@eudia.com",name:"Conor Molloy",accounts:[{id:"001Hp00003kIrQDIA0",name:"Accenture"},{id:"001Wj00000qLixnIAC",name:"Al Dahra Group Llc"},{id:"001Hp00003kIrEyIAK",name:"Aramark Ireland"},{id:"001Wj00000mCFrgIAG",name:"Aryza"},{id:"001Wj00000mCFrkIAG",name:"Coillte"},{id:"001Wj00000mCFsHIAW",name:"Consensys"},{id:"001Wj00000mCFr2IAG",name:"ICON Clinical Research"},{id:"001Wj00000Y64qdIAB",name:"ION"},{id:"001Wj00000mCFtMIAW",name:"Kellanova"},{id:"001Wj00000mCFrIIAW",name:"Orsted"},{id:"001Wj00000mI9NmIAK",name:"Sequoia Climate Fund"},{id:"001Wj00000mCFs0IAG",name:"Taoglas Limited"},{id:"001Wj00000mCFtPIAW",name:"Teamwork.com"},{id:"001Wj00000mIBpNIAW",name:"Transworld Business Advisors"},{id:"001Wj00000ZLVpTIAX",name:"Wellspring Philanthropic Fund"}]},"emer.flynn@eudia.com":{email:"emer.flynn@eudia.com",name:"Emer Flynn",accounts:[{id:"001Wj00000mCFr6IAG",name:"NTMA"}]},"greg.machale@eudia.com":{email:"greg.machale@eudia.com",name:"Greg MacHale",accounts:[{id:"001Hp00003kIrEFIA0",name:"Abbott Laboratories"},{id:"001Wj00000mCFqrIAG",name:"Biomarin International Limited"},{id:"001Wj00000Y6VMdIAN",name:"BNP Paribas"},{id:"001Hp00003kIrFdIAK",name:"Booking Holdings"},{id:"001Wj00000X4OqNIAV",name:"BT Group"},{id:"001Wj00000uZ5J7IAK",name:"Canada Life"},{id:"001Wj00000mCFt9IAG",name:"Cerberus European Servicing"},{id:"001Wj00000Y6VMkIAN",name:"Computershare"},{id:"001Wj00000uP5x8IAC",name:"Cornmarket Financial Services"},{id:"001Wj00000Y6VMMIA3",name:"Diageo"},{id:"001Wj00000prFOXIA2",name:"Doosan Bobcat"},{id:"001Wj00000mCFrmIAG",name:"eShopWorld"},{id:"001Wj00000fFuFYIA0",name:"Grant Thornton"},{id:"001Wj00000uZ4A9IAK",name:"Great West Lifec co"},{id:"001Wj00000uZtcTIAS",name:"Ineos"},{id:"001Wj00000tWwYpIAK",name:"Mail Metrics"},{id:"001Wj00000vwSUXIA2",name:"Mercor"},{id:"001Wj00000mCFtUIAW",name:"Mercury Engineering"},{id:"001Wj00000lPFP3IAO",name:"Nomura"},{id:"001Wj00000mCFr1IAG",name:"Permanent TSB plc"},{id:"001Wj00000Y6QfRIAV",name:"Pernod Ricard"},{id:"001Hp00003kIrLiIAK",name:"Quest Diagnostics"},{id:"001Wj00000mCFsFIAW",name:"Regeneron"},{id:"001Wj00000mCFsRIAW",name:"Ryanair"},{id:"001Hp00003kIrMjIAK",name:"State Street"},{id:"001Wj00000mCFsSIAW",name:"Uniphar PLC"}]},"julie.stefanich@eudia.com":{email:"julie.stefanich@eudia.com",name:"Julie Stefanich",accounts:[{id:"001Wj00000asSHBIA2",name:"Airbus"},{id:"001Hp00003kIrElIAK",name:"Ameriprise Financial"},{id:"001Hp00003kIrEvIAK",name:"Apple"},{id:"001Hp00003kJ9pXIAS",name:"Bayer"},{id:"001Hp00003kIrE3IAK",name:"Cargill"},{id:"001Hp00003kIrGDIA0",name:"Charles Schwab"},{id:"001Hp00003kIrE4IAK",name:"Chevron"},{id:"001Hp00003kIrGeIAK",name:"Corebridge Financial"},{id:"001Hp00003kIrE7IAK",name:"ECMS"},{id:"001Wj00000iRzqvIAC",name:"Florida Crystals Corporation"},{id:"001Hp00003kIrIPIA0",name:"Genworth Financial"},{id:"001Hp00003kIrIXIA0",name:"Goldman Sachs"},{id:"001Wj00000rceVpIAI",name:"Hikma"},{id:"001Hp00003kIrJVIA0",name:"KLA"},{id:"001Wj00000aLmheIAC",name:"Macmillan"},{id:"001Wj00000X6G8qIAF",name:"Mainsail Partners"},{id:"001Hp00003kIrKLIA0",name:"MetLife"},{id:"001Hp00003kIrDeIAK",name:"National Grid"},{id:"001Hp00003kIrKjIAK",name:"Nordstrom"},{id:"001Hp00003kIrDvIAK",name:"Oracle"},{id:"001Hp00003kIrLNIA0",name:"Petsmart"},{id:"001Hp00003kIrLZIA0",name:"Procter & Gamble"},{id:"001Hp00003lhsUYIAY",name:"Rio Tinto Group"},{id:"001Wj00000svQI3IAM",name:"Safelite"},{id:"001Wj00000fRtLmIAK",name:"State Farm"},{id:"001Wj00000bzz9TIAQ",name:"Tailored Brands"},{id:"001Hp00003kIrNBIA0",name:"The Wonderful Company"},{id:"001Hp00003kIrCrIAK",name:"TIAA"},{id:"001Hp00003kIrNHIA0",name:"T-Mobile"},{id:"001Hp00003kIrNVIA0",name:"Uber"},{id:"001Hp00003kIrOLIA0",name:"World Wide Technology"}]},"justin.hills@eudia.com":{email:"justin.hills@eudia.com",name:"Justin Hills",accounts:[{id:"001Hp00003kIrEOIA0",name:"AES"},{id:"001Wj00000Y6VM4IAN",name:"Ares Management Corporation"},{id:"001Wj00000XiEDyIAN",name:"Coinbase"},{id:"001Hp00003kIrDhIAK",name:"Comcast"},{id:"001Wj00000c9oCvIAI",name:"Cox Media Group"},{id:"001Wj00000Y0jPmIAJ",name:"Delinea"},{id:"001Wj00000iwKGQIA2",name:"Dominos"},{id:"001Hp00003kIrDaIAK",name:"Duracell"},{id:"001Hp00003kIrCnIAK",name:"Home Depot"},{id:"001Hp00003kIrDVIA0",name:"Intel"},{id:"001Hp00003kIrE9IAK",name:"IQVIA"},{id:"001Hp00003kIrJJIA0",name:"Johnson & Johnson"},{id:"001Wj00000gnrugIAA",name:"Kraken"},{id:"001Wj00000op4EWIAY",name:"McCormick & Co Inc"},{id:"001Wj00000ix7c2IAA",name:"Nouryon"},{id:"001Wj00000cpxt0IAA",name:"Novelis"},{id:"001Wj00000WYyKIIA1",name:"Ramp"},{id:"001Wj00000o5G0vIAE",name:"StockX"},{id:"001Wj00000YEMa8IAH",name:"Turing"},{id:"001Wj00000oqRycIAE",name:"Walgreens Boots Alliance"}]},"keigan.pesenti@eudia.com":{email:"keigan.pesenti@eudia.com",name:"Keigan Pesenti",accounts:[{id:"001Wj00000mCFt4IAG",name:"BNRG Renewables Ltd"},{id:"001Wj00000mCFtTIAW",name:"Coleman Legal"},{id:"001Wj00000pLPAyIAO",name:"Creed McStay"},{id:"001Hp00003lhyCxIAI",name:"Eudia Testing Account"},{id:"001Wj00000mCFsIIAW",name:"Fannin Limited"},{id:"001Wj00000mCFsJIAW",name:"Gas Networks Ireland"},{id:"001Wj00000mCFseIAG",name:"Hayes Solicitors LLP"},{id:"001Wj00000mCFtJIAW",name:"LinkedIn"},{id:"001Wj00000mCFspIAG",name:"Moy Park"},{id:"001Wj00000mCFt8IAG",name:"State Claims Agency"},{id:"001Wj00000mCFs3IAG",name:"Wayflyer"}]},"mike.masiello@eudia.com":{email:"mike.masiello@eudia.com",name:"Mike Masiello",accounts:[{id:"001Wj00000p1lCPIAY",name:"Army Applications Lab"},{id:"001Wj00000p1hYbIAI",name:"Army Corps of Engineers"},{id:"001Wj00000ZxEpDIAV",name:"Army Futures Command"},{id:"001Wj00000bWBlAIAW",name:"Defense Innovation Unit (DIU)"},{id:"001Hp00003kJuJ5IAK",name:"Gov - DOD"},{id:"001Hp00003lhcL9IAI",name:"GSA (General Services Administration)"},{id:"001Wj00000p1PVHIA2",name:"IFC"},{id:"001Wj00000VVJ31IAH",name:"NATO"},{id:"001Wj00000p1YbmIAE",name:"SOCOM"},{id:"001Wj00000p1jH3IAI",name:"State of Alaska"},{id:"001Wj00000hVa6VIAS",name:"State of Arizona"},{id:"001Wj00000p0PcEIAU",name:"State of California"},{id:"001Wj00000bWBkeIAG",name:"U.S. Air Force"},{id:"001Wj00000p1SRXIA2",name:"U.S. Marine Corps"},{id:"001Wj00000Rrm5OIAR",name:"UK Government"},{id:"001Hp00003lieJPIAY",name:"USDA"},{id:"001Wj00000p1SuZIAU",name:"Vulcan Special Ops"}]},"nathan.shine@eudia.com":{email:"nathan.shine@eudia.com",name:"Nathan Shine",accounts:[{id:"001Hp00003kIrEnIAK",name:"Amphenol"},{id:"001Wj00000mHDBoIAO",name:"Coimisiun na Mean"},{id:"001Wj00000mCFqtIAG",name:"CommScope Technologies"},{id:"001Hp00003kIrDMIA0",name:"Dropbox"},{id:"001Wj00000mCFquIAG",name:"Fexco"},{id:"001Wj00000mCFs5IAG",name:"Indeed"},{id:"001Hp00003kIrJOIA0",name:"Keurig Dr Pepper"},{id:"001Wj00000hkk0zIAA",name:"Kingspan"},{id:"001Wj00000mCFrsIAG",name:"Kitman Labs"},{id:"001Wj00000mCFsMIAW",name:"McDermott Creed & Martyn"},{id:"001Wj00000mCFsoIAG",name:"Mediolanum"},{id:"001Wj00000mCFrFIAW",name:"OKG Payments Services Limited"},{id:"001Wj00000ZDPUIIA5",name:"Perrigo Pharma"},{id:"001Wj00000mCFtSIAW",name:"Poe Kiely Hogan Lanigan"},{id:"001Wj00000mCFtHIAW",name:"StepStone Group"},{id:"001Wj00000c9oD6IAI",name:"Stripe"},{id:"001Wj00000SFiOvIAL",name:"TikTok"},{id:"001Wj00000ZDXTRIA5",name:"Tinder LLC"},{id:"001Wj00000bWBlEIAW",name:"Udemy"}]},"nicola.fratini@eudia.com":{email:"nicola.fratini@eudia.com",name:"Nicola Fratini",accounts:[{id:"001Wj00000mCFrGIAW",name:"AerCap"},{id:"001Wj00000thuKEIAY",name:"Aer Lingus"},{id:"001Wj00000sgXdBIAU",name:"Allianz Insurance"},{id:"001Wj00000mCFs7IAG",name:"Allied Irish Banks plc"},{id:"001Wj00000mCFrhIAG",name:"Avant Money"},{id:"001Wj00000mI7NaIAK",name:"Aviva Insurance"},{id:"001Wj00000uNUIBIA4",name:"Bank of China"},{id:"001Hp00003kJ9kNIAS",name:"Barclays"},{id:"001Wj00000ttPZBIA2",name:"Barings"},{id:"001Wj00000tWwXwIAK",name:"Cairn Homes"},{id:"001Wj00000Y6VLhIAN",name:"Citi"},{id:"001Wj00000tx2MQIAY",name:"CyberArk"},{id:"001Wj00000mCFsBIAW",name:"Datalex"},{id:"001Wj00000mCFrlIAG",name:"Davy"},{id:"001Wj00000w0uVVIAY",name:"Doceree"},{id:"001Wj00000uJwxoIAC",name:"Eir"},{id:"001Wj00000sg8GcIAI",name:"FARFETCH"},{id:"001Wj00000mIEAXIA4",name:"FNZ Group"},{id:"001Wj00000mCFt1IAG",name:"Goodbody Stockbrokers"},{id:"001Wj00000ZDXrdIAH",name:"Intercom"},{id:"001Wj00000ullPpIAI",name:"Jet2 Plc"},{id:"001Wj00000au3swIAA",name:"Lenovo"},{id:"001Hp00003kIrKmIAK",name:"Northern Trust Management Services"},{id:"001Wj00000u0eJpIAI",name:"Re-Turn"},{id:"001Wj00000sg2T0IAI",name:"SHEIN"},{id:"001Wj00000mCFs1IAG",name:"Twitter"},{id:"001Hp00003kIrDAIA0",name:"Verizon"},{id:"001Wj00000sgaj9IAA",name:"Volkswagon Group Ireland"},{id:"001Wj00000mIB6EIAW",name:"Zendesk"}]},"olivia@eudia.com":{email:"olivia@eudia.com",name:"Olivia Jung",accounts:[{id:"001Wj00000mCFrdIAG",name:"Airship Group Inc"},{id:"001Hp00003kIrFVIA0",name:"Best Buy"},{id:"001Hp00003kIrFkIAK",name:"Bristol-Myers Squibb"},{id:"001Hp00003kIrGKIA0",name:"CHS"},{id:"001Hp00003kIrDZIA0",name:"Ciena"},{id:"001Hp00003kIrGZIA0",name:"Consolidated Edison"},{id:"001Wj00000jK5HlIAK",name:"Crate & Barrel"},{id:"001Hp00003kJ9kwIAC",name:"CSL"},{id:"001Hp00003kIrGoIAK",name:"Cummins"},{id:"001Wj00000bzz9RIAQ",name:"Datadog"},{id:"001Wj00000aZvt9IAC",name:"Dolby"},{id:"001Wj00000hkk0jIAA",name:"Etsy"},{id:"001Hp00003kIrISIA0",name:"Gilead Sciences"},{id:"001Hp00003kIrE8IAK",name:"Graybar Electric"},{id:"001Wj00000dvgdbIAA",name:"HealthEquity"},{id:"001Hp00003kIrJ9IAK",name:"Intuit"},{id:"001Wj00000aLlyVIAS",name:"J.Crew"},{id:"001Hp00003kKKMcIAO",name:"JPmorganchase"},{id:"001Hp00003kIrDjIAK",name:"Marsh McLennan"},{id:"001Hp00003kIrD8IAK",name:"Medtronic"},{id:"001Hp00003kIrKKIA0",name:"Merck"},{id:"001Hp00003kJ9lGIAS",name:"Meta"},{id:"001Hp00003kIrKSIA0",name:"Mondelez International"},{id:"001Hp00003kIrLOIA0",name:"Pfizer"},{id:"001Wj00000iS9AJIA0",name:"TE Connectivity"},{id:"001Hp00003kIrDFIA0",name:"Thermo Fisher Scientific"},{id:"001Wj00000PjGDaIAN",name:"The Weir Group PLC"},{id:"001Hp00003kIrCwIAK",name:"Toshiba US"},{id:"001Wj00000kD7MAIA0",name:"Wellspan Health"},{id:"001Hp00003kIrOAIA0",name:"Western Digital"}]},"tom.clancy@eudia.com":{email:"tom.clancy@eudia.com",name:"Tom Clancy",accounts:[{id:"001Wj00000pB30VIAS",name:"AIR (Advanced Inhalation Rituals)"},{id:"001Wj00000qLRqWIAW",name:"ASML"},{id:"001Wj00000c9oCeIAI",name:"BLDG Management Co., Inc."},{id:"001Wj00000mCFszIAG",name:"Electricity Supply Board"},{id:"001Wj00000mCFrcIAG",name:"Glanbia"},{id:"001Wj00000pA6d7IAC",name:"Masdar Future Energy Company"},{id:"001Hp00003kIrD9IAK",name:"Salesforce"},{id:"001Wj00000qL7AGIA0",name:"Seismic"},{id:"001Wj00000pAPW2IAO",name:"Tarmac"},{id:"001Wj00000mCFtOIAW",name:"Uisce Eireann (Irish Water)"},{id:"001Wj00000pBibTIAS",name:"Version1"}]}}},N=class{constructor(n){this.cachedData=null;this.serverUrl=n}async getAccountsForUser(n){let e=n.toLowerCase().trim();return this.getAccountsFromStatic(e)}getAccountsFromStatic(n){let e=w.businessLeads[n];return e?(console.log(`[AccountOwnership] Found ${e.accounts.length} accounts for ${n}`),e.accounts):(console.log(`[AccountOwnership] No mapping found for: ${n}`),[])}async fetchFromServer(n){try{let e=await fetch(`${this.serverUrl}/api/accounts/ownership/${encodeURIComponent(n)}`);if(!e.ok)return null;let t=await e.json();return t.success&&t.accounts?t.accounts:null}catch{return console.log("[AccountOwnership] Server fetch failed, using static data"),null}}hasUser(n){return n.toLowerCase().trim()in w.businessLeads}getAllBusinessLeads(){return Object.keys(w.businessLeads)}getBusinessLead(n){let e=n.toLowerCase().trim();return w.businessLeads[e]||null}getDataVersion(){return w.version}};var Z={serverUrl:"https://gtm-wizard.onrender.com",accountsFolder:"Accounts",recordingsFolder:"Recordings",syncOnStartup:!0,autoSyncAfterTranscription:!0,saveAudioFiles:!0,appendTranscript:!0,lastSyncTime:null,cachedAccounts:[],enableSmartTags:!0,showCalendarView:!0,userEmail:"",setupCompleted:!1,calendarConfigured:!1,salesforceConnected:!1,accountsImported:!1,importedAccountCount:0,openaiApiKey:""},E="eudia-calendar-view",C="eudia-setup-view",j=class extends l.EditorSuggest{constructor(n,e){super(n),this.plugin=e}onTrigger(n,e,t){let i=e.getLine(n.line),a=e.getValue(),s=e.posToOffset(n),r=a.indexOf("---"),o=a.indexOf("---",r+3);if(r===-1||s<r||s>o)return null;let c=i.match(/^account:\s*(.*)$/);if(!c)return null;let p=c[1].trim(),d=i.indexOf(":")+1,m=i.substring(d).match(/^\s*/)?.[0].length||0;return{start:{line:n.line,ch:d+m},end:n,query:p}}getSuggestions(n){let e=n.query.toLowerCase(),t=this.plugin.settings.cachedAccounts;return e?t.filter(i=>i.name.toLowerCase().includes(e)).sort((i,a)=>{let s=i.name.toLowerCase().startsWith(e),r=a.name.toLowerCase().startsWith(e);return s&&!r?-1:r&&!s?1:i.name.localeCompare(a.name)}).slice(0,10):t.slice(0,10)}renderSuggestion(n,e){e.createEl("div",{text:n.name,cls:"suggestion-title"})}selectSuggestion(n,e){this.context&&this.context.editor.replaceRange(n.name,this.context.start,this.context.end)}},W=class{constructor(n,e,t,i){this.containerEl=null;this.waveformBars=[];this.durationEl=null;this.waveformData=new Array(16).fill(0);this.onPause=n,this.onResume=e,this.onStop=t,this.onCancel=i}show(){if(this.containerEl)return;this.containerEl=document.createElement("div"),this.containerEl.className="eudia-transcription-bar active";let n=document.createElement("div");n.className="eudia-recording-dot",this.containerEl.appendChild(n);let e=document.createElement("div");e.className="eudia-waveform",this.waveformBars=[];for(let s=0;s<16;s++){let r=document.createElement("div");r.className="eudia-waveform-bar",r.style.height="2px",e.appendChild(r),this.waveformBars.push(r)}this.containerEl.appendChild(e),this.durationEl=document.createElement("div"),this.durationEl.className="eudia-duration",this.durationEl.textContent="0:00",this.containerEl.appendChild(this.durationEl);let t=document.createElement("div");t.className="eudia-controls-minimal";let i=document.createElement("button");i.className="eudia-control-btn stop",i.innerHTML='<span class="eudia-stop-icon"></span>',i.title="Stop and summarize",i.onclick=()=>this.onStop(),t.appendChild(i);let a=document.createElement("button");a.className="eudia-control-btn cancel",a.textContent="Cancel",a.onclick=()=>this.onCancel(),t.appendChild(a),this.containerEl.appendChild(t),document.body.appendChild(this.containerEl)}hide(){this.containerEl&&(this.containerEl.remove(),this.containerEl=null,this.waveformBars=[],this.durationEl=null)}updateState(n){if(this.containerEl){if(this.waveformData.shift(),this.waveformData.push(n.audioLevel),this.waveformBars.forEach((e,t)=>{let i=this.waveformData[t]||0,a=Math.max(2,Math.min(24,i*.24));e.style.height=`${a}px`}),this.durationEl){let e=Math.floor(n.duration/60),t=Math.floor(n.duration%60);this.durationEl.textContent=`${e}:${t.toString().padStart(2,"0")}`}this.containerEl.className=n.isPaused?"eudia-transcription-bar paused":"eudia-transcription-bar active"}}showProcessing(){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar processing";let n=document.createElement("div");n.className="eudia-processing-spinner",this.containerEl.appendChild(n);let e=document.createElement("div");e.className="eudia-processing-text",e.textContent="Processing...",this.containerEl.appendChild(e)}showComplete(n){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar complete";let e=document.createElement("div");e.className="eudia-complete-checkmark",this.containerEl.appendChild(e);let t=document.createElement("div");if(t.className="eudia-complete-content",n.summaryPreview){let o=document.createElement("div");o.className="eudia-summary-preview",o.textContent=n.summaryPreview.length>80?n.summaryPreview.substring(0,80)+"...":n.summaryPreview,t.appendChild(o)}let i=document.createElement("div");i.className="eudia-complete-stats-row";let a=Math.floor(n.duration/60),s=Math.floor(n.duration%60);i.textContent=`${a}:${s.toString().padStart(2,"0")} recorded`,n.nextStepsCount>0&&(i.textContent+=` | ${n.nextStepsCount} action${n.nextStepsCount>1?"s":""}`),n.meddiccCount>0&&(i.textContent+=` | ${n.meddiccCount} signals`),t.appendChild(i),this.containerEl.appendChild(t);let r=document.createElement("button");r.className="eudia-control-btn close",r.textContent="Dismiss",r.onclick=()=>this.hide(),this.containerEl.appendChild(r),setTimeout(()=>this.hide(),8e3)}};var L=class extends l.Modal{constructor(n,e,t){super(n),this.plugin=e,this.onSelect=t}onOpen(){let{contentEl:n}=this;n.empty(),n.addClass("eudia-account-selector"),n.createEl("h3",{text:"Select Account for Meeting Note"}),this.searchInput=n.createEl("input",{type:"text",placeholder:"Search accounts..."}),this.searchInput.style.cssText="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);",this.resultsContainer=n.createDiv({cls:"eudia-account-results"}),this.resultsContainer.style.cssText="max-height: 300px; overflow-y: auto;",this.updateResults(""),this.searchInput.addEventListener("input",()=>this.updateResults(this.searchInput.value)),this.searchInput.focus()}updateResults(n){this.resultsContainer.empty();let e=this.plugin.settings.cachedAccounts,t=n?e.filter(i=>i.name.toLowerCase().includes(n.toLowerCase())).slice(0,15):e.slice(0,15);if(t.length===0){this.resultsContainer.createDiv({cls:"eudia-no-results",text:"No accounts found"});return}t.forEach(i=>{let a=this.resultsContainer.createDiv({cls:"eudia-account-item",text:i.name});a.onclick=()=>{this.onSelect(i),this.close()}})}onClose(){this.contentEl.empty()}};var F=class extends l.ItemView{constructor(e,t){super(e);this.emailInput=null;this.pollInterval=null;this.plugin=t,this.accountOwnershipService=new N(t.settings.serverUrl),this.steps=[{id:"calendar",title:"Connect Your Calendar",description:"View your meetings and create notes with one click",status:"pending"},{id:"salesforce",title:"Connect to Salesforce",description:"Sync notes and access your accounts",status:"pending"},{id:"transcribe",title:"Ready to Transcribe",description:"Record and summarize meetings automatically",status:"pending"}]}getViewType(){return C}getDisplayText(){return"Setup"}getIcon(){return"settings"}async onOpen(){await this.checkExistingStatus(),await this.render()}async onClose(){this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null)}async checkExistingStatus(){if(this.plugin.settings.userEmail){this.steps[0].status="complete";try{(await(0,l.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0&&(this.steps[1].status="complete",this.plugin.settings.salesforceConnected=!0)}catch{}this.plugin.settings.accountsImported&&(this.steps[2].status="complete")}}getCompletionPercentage(){let e=this.steps.filter(t=>t.status==="complete").length;return Math.round(e/this.steps.length*100)}async render(){let e=this.containerEl.children[1];e.empty(),e.addClass("eudia-setup-view"),this.renderHeader(e),this.renderSteps(e),this.renderFooter(e)}renderHeader(e){let t=e.createDiv({cls:"eudia-setup-header"}),i=t.createDiv({cls:"eudia-setup-title-section"});i.createEl("h1",{text:"Welcome to Eudia Sales Vault",cls:"eudia-setup-main-title"}),i.createEl("p",{text:"Complete these steps to unlock your sales superpowers",cls:"eudia-setup-subtitle"});let a=t.createDiv({cls:"eudia-setup-progress-section"}),s=this.getCompletionPercentage(),r=a.createDiv({cls:"eudia-setup-progress-label"});r.createSpan({text:"Setup Progress"}),r.createSpan({text:`${s}%`,cls:"eudia-setup-progress-value"});let c=a.createDiv({cls:"eudia-setup-progress-bar"}).createDiv({cls:"eudia-setup-progress-fill"});c.style.width=`${s}%`}renderSteps(e){let t=e.createDiv({cls:"eudia-setup-steps-container"});this.renderCalendarStep(t),this.renderSalesforceStep(t),this.renderTranscribeStep(t)}renderCalendarStep(e){let t=this.steps[0],i=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),a=i.createDiv({cls:"eudia-setup-step-header"});a.createDiv({cls:"eudia-setup-step-number"}).setText(t.status==="complete"?"\u2713":"1");let r=a.createDiv({cls:"eudia-setup-step-info"});r.createEl("h3",{text:t.title}),r.createEl("p",{text:t.description});let o=i.createDiv({cls:"eudia-setup-step-content"});if(t.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:`Connected as ${this.plugin.settings.userEmail}`});else{let c=o.createDiv({cls:"eudia-setup-input-group"});this.emailInput=c.createEl("input",{type:"email",placeholder:"yourname@eudia.com",cls:"eudia-setup-input"}),this.plugin.settings.userEmail&&(this.emailInput.value=this.plugin.settings.userEmail);let p=c.createEl("button",{text:"Connect",cls:"eudia-setup-btn primary"});p.onclick=async()=>{await this.handleCalendarConnect()},this.emailInput.onkeydown=async d=>{d.key==="Enter"&&await this.handleCalendarConnect()},o.createDiv({cls:"eudia-setup-validation-message"}),o.createEl("p",{cls:"eudia-setup-help-text",text:"Your calendar syncs automatically via Microsoft 365. We use your email to identify your meetings."})}}async handleCalendarConnect(){if(!this.emailInput)return;let e=this.emailInput.value.trim().toLowerCase(),t=this.containerEl.querySelector(".eudia-setup-validation-message");if(!e){t&&(t.textContent="Please enter your email",t.className="eudia-setup-validation-message error");return}if(!e.endsWith("@eudia.com")){t&&(t.textContent="Please use your @eudia.com email address",t.className="eudia-setup-validation-message error");return}t&&(t.textContent="Validating...",t.className="eudia-setup-validation-message loading");try{let i=await(0,l.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${encodeURIComponent(e)}`,method:"GET",throw:!1});if(i.status===200&&i.json?.authorized){this.plugin.settings.userEmail=e,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),this.steps[0].status="complete",new l.Notice("Calendar connected successfully!"),t&&(t.textContent="Importing your accounts...",t.className="eudia-setup-validation-message loading");try{let a=await this.accountOwnershipService.getAccountsForUser(e);a.length>0&&(await this.plugin.createTailoredAccountFolders(a),this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=a.length,await this.plugin.saveSettings(),new l.Notice(`Imported ${a.length} account folders!`))}catch(a){console.error("[Eudia] Account import failed:",a)}await this.render()}else t&&(t.innerHTML=`<strong>${e}</strong> is not authorized for calendar access. Contact your admin.`,t.className="eudia-setup-validation-message error")}catch{t&&(t.textContent="Connection failed. Please try again.",t.className="eudia-setup-validation-message error")}}renderSalesforceStep(e){let t=this.steps[1],i=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),a=i.createDiv({cls:"eudia-setup-step-header"});a.createDiv({cls:"eudia-setup-step-number"}).setText(t.status==="complete"?"\u2713":"2");let r=a.createDiv({cls:"eudia-setup-step-info"});r.createEl("h3",{text:t.title}),r.createEl("p",{text:t.description});let o=i.createDiv({cls:"eudia-setup-step-content"});if(!this.plugin.settings.userEmail){o.createDiv({cls:"eudia-setup-disabled-message",text:"Complete the calendar step first"});return}if(t.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:"Salesforce connected successfully"}),this.plugin.settings.accountsImported&&o.createDiv({cls:"eudia-setup-account-status",text:`${this.plugin.settings.importedAccountCount} accounts imported`});else{let p=o.createDiv({cls:"eudia-setup-button-group"}).createEl("button",{text:"Connect to Salesforce",cls:"eudia-setup-btn primary"}),d=o.createDiv({cls:"eudia-setup-sf-status"});p.onclick=async()=>{let m=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(m,"_blank"),d.textContent="Complete the login in the popup window...",d.className="eudia-setup-sf-status loading",new l.Notice("Complete the Salesforce login in the popup window",5e3),this.startSalesforcePolling(d)},o.createEl("p",{cls:"eudia-setup-help-text",text:"This links your Obsidian notes to your Salesforce account for automatic sync."})}}startSalesforcePolling(e){this.pollInterval&&window.clearInterval(this.pollInterval);let t=0,i=60;this.pollInterval=window.setInterval(async()=>{t++;try{(await(0,l.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),this.steps[1].status="complete",new l.Notice("Salesforce connected successfully!"),await this.importTailoredAccounts(e),await this.render()):t>=i&&(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),e.textContent="Connection timed out. Please try again.",e.className="eudia-setup-sf-status error")}catch{}},5e3)}async importTailoredAccounts(e){e.textContent="Importing your accounts...",e.className="eudia-setup-sf-status loading";try{let t=await this.accountOwnershipService.getAccountsForUser(this.plugin.settings.userEmail);if(t.length===0){e.textContent="No accounts found for your email. Contact your admin.",e.className="eudia-setup-sf-status warning";return}await this.plugin.createTailoredAccountFolders(t),this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=t.length,await this.plugin.saveSettings(),this.steps[2].status="complete",e.textContent=`${t.length} accounts imported successfully!`,e.className="eudia-setup-sf-status success"}catch{e.textContent="Failed to import accounts. Please try again.",e.className="eudia-setup-sf-status error"}}renderTranscribeStep(e){let t=this.steps[2],i=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),a=i.createDiv({cls:"eudia-setup-step-header"});a.createDiv({cls:"eudia-setup-step-number"}).setText(t.status==="complete"?"\u2713":"3");let r=a.createDiv({cls:"eudia-setup-step-info"});r.createEl("h3",{text:t.title}),r.createEl("p",{text:t.description});let o=i.createDiv({cls:"eudia-setup-step-content"}),c=o.createDiv({cls:"eudia-setup-instructions"}),p=c.createDiv({cls:"eudia-setup-instruction"});p.createSpan({cls:"eudia-setup-instruction-icon",text:"\u{1F399}"}),p.createSpan({text:"Click the microphone icon in the left sidebar during a call"});let d=c.createDiv({cls:"eudia-setup-instruction"});d.createSpan({cls:"eudia-setup-instruction-icon",text:"\u2328"}),d.createSpan({text:'Or press Cmd/Ctrl+P and search for "Transcribe Meeting"'});let m=c.createDiv({cls:"eudia-setup-instruction"});m.createSpan({cls:"eudia-setup-instruction-icon",text:"\u{1F4DD}"}),m.createSpan({text:"AI will summarize and extract key insights automatically"}),t.status!=="complete"&&o.createEl("p",{cls:"eudia-setup-help-text muted",text:"This step completes automatically after connecting to Salesforce and importing accounts."})}renderFooter(e){let t=e.createDiv({cls:"eudia-setup-footer"});if(this.steps.every(s=>s.status==="complete")){let s=t.createDiv({cls:"eudia-setup-completion"});s.createEl("h2",{text:"\u{1F389} You're all set!"}),s.createEl("p",{text:"Your sales vault is ready. Click below to start using Eudia."});let r=t.createEl("button",{text:"Open Calendar \u2192",cls:"eudia-setup-btn primary large"});r.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(C),await this.plugin.activateCalendarView()}}else{let s=t.createEl("button",{text:"Skip Setup (I'll do this later)",cls:"eudia-setup-btn secondary"});s.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(C),new l.Notice("You can complete setup anytime from Settings \u2192 Eudia Sync")}}let a=t.createEl("a",{text:"Advanced Settings",cls:"eudia-setup-settings-link"});a.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")}}},R=class extends l.ItemView{constructor(e,t){super(e);this.refreshInterval=null;this.lastError=null;this.plugin=t}getViewType(){return E}getDisplayText(){return"Calendar"}getIcon(){return"calendar"}async onOpen(){await this.render(),this.refreshInterval=window.setInterval(()=>this.render(),5*60*1e3)}async onClose(){this.refreshInterval&&window.clearInterval(this.refreshInterval)}async render(){let e=this.containerEl.children[1];if(e.empty(),e.addClass("eudia-calendar-view"),!this.plugin.settings.userEmail){this.renderSetupPanel(e);return}this.renderHeader(e),await this.renderCalendarContent(e)}renderHeader(e){let t=e.createDiv({cls:"eudia-calendar-header"}),i=t.createDiv({cls:"eudia-calendar-title-row"});i.createEl("h4",{text:"Your Meetings"});let a=i.createDiv({cls:"eudia-calendar-actions"}),s=a.createEl("button",{cls:"eudia-btn-icon",text:"\u21BB"});s.title="Refresh",s.onclick=async()=>{s.addClass("spinning"),await this.render(),s.removeClass("spinning")};let r=a.createEl("button",{cls:"eudia-btn-icon",text:"\u2699"});r.title="Settings",r.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")};let o=t.createDiv({cls:"eudia-status-bar"});this.renderConnectionStatus(o)}async renderConnectionStatus(e){let t={server:"connecting",calendar:"not_configured",salesforce:"not_configured"},i=this.plugin.settings.serverUrl,a=this.plugin.settings.userEmail;try{(await(0,l.requestUrl)({url:`${i}/api/health`,method:"GET",throw:!1})).status===200?(t.server="connected",t.serverMessage="Server online"):(t.server="error",t.serverMessage="Server unavailable")}catch{t.server="error",t.serverMessage="Cannot reach server"}if(a&&t.server==="connected")try{let d=await(0,l.requestUrl)({url:`${i}/api/calendar/validate/${encodeURIComponent(a)}`,method:"GET",throw:!1});d.status===200&&d.json?.authorized?(t.calendar="connected",t.calendarMessage="Calendar synced"):(t.calendar="not_authorized",t.calendarMessage="Not authorized")}catch{t.calendar="error",t.calendarMessage="Error checking access"}if(a&&t.server==="connected")try{let d=await(0,l.requestUrl)({url:`${i}/api/sf/auth/status?email=${encodeURIComponent(a)}`,method:"GET",throw:!1});d.status===200&&d.json?.connected?(t.salesforce="connected",t.salesforceMessage="Salesforce connected"):(t.salesforce="not_configured",t.salesforceMessage="Not connected")}catch{t.salesforce="not_configured"}let s=e.createDiv({cls:"eudia-status-indicators"}),r=s.createSpan({cls:`eudia-status-dot ${t.server}`});r.title=t.serverMessage||"Server";let o=s.createSpan({cls:`eudia-status-dot ${t.calendar}`});o.title=t.calendarMessage||"Calendar";let c=s.createSpan({cls:`eudia-status-dot ${t.salesforce}`});if(c.title=t.salesforceMessage||"Salesforce",e.createDiv({cls:"eudia-status-labels"}).createSpan({cls:"eudia-status-label",text:this.plugin.settings.userEmail}),t.calendar==="not_authorized"){let d=e.createDiv({cls:"eudia-status-warning"});d.innerHTML=`<strong>${a}</strong> is not authorized for calendar access. Contact your admin.`}}async renderCalendarContent(e){let t=e.createDiv({cls:"eudia-calendar-content"}),i=t.createDiv({cls:"eudia-calendar-loading"});i.innerHTML='<div class="eudia-spinner"></div><span>Loading meetings...</span>';try{let a=new A(this.plugin.settings.serverUrl,this.plugin.settings.userEmail),s=await a.getWeekMeetings();if(i.remove(),!s.success){this.renderError(t,s.error||"Failed to load calendar");return}let r=Object.keys(s.byDay||{}).sort();if(r.length===0){this.renderEmptyState(t);return}await this.renderCurrentMeeting(t,a);for(let o of r){let c=s.byDay[o];!c||c.length===0||this.renderDaySection(t,o,c)}}catch(a){i.remove(),this.renderError(t,a.message||"Failed to load calendar")}}async renderCurrentMeeting(e,t){try{let i=await t.getCurrentMeeting();if(i.meeting){let a=e.createDiv({cls:"eudia-now-card"});i.isNow?a.createDiv({cls:"eudia-now-badge",text:"\u25CF NOW"}):a.createDiv({cls:"eudia-now-badge soon",text:`In ${i.minutesUntilStart}m`});let s=a.createDiv({cls:"eudia-now-content"});s.createEl("div",{cls:"eudia-now-subject",text:i.meeting.subject}),i.meeting.accountName&&s.createEl("div",{cls:"eudia-now-account",text:i.meeting.accountName});let r=a.createEl("button",{cls:"eudia-now-action",text:"Create Note"});r.onclick=()=>this.createNoteForMeeting(i.meeting)}}catch{}}renderDaySection(e,t,i){let a=e.createDiv({cls:"eudia-calendar-day"});a.createEl("div",{cls:"eudia-calendar-day-header",text:A.getDayName(t)});for(let s of i){let r=a.createDiv({cls:`eudia-calendar-meeting ${s.isCustomerMeeting?"customer":"internal"}`});r.createEl("div",{cls:"eudia-calendar-time",text:A.formatTime(s.start)});let o=r.createDiv({cls:"eudia-calendar-details"});if(o.createEl("div",{cls:"eudia-calendar-subject",text:s.subject}),s.accountName)o.createEl("div",{cls:"eudia-calendar-account",text:s.accountName});else if(s.attendees&&s.attendees.length>0){let c=s.attendees.slice(0,2).map(p=>p.name||p.email?.split("@")[0]||"Unknown").join(", ");o.createEl("div",{cls:"eudia-calendar-attendees",text:c})}r.onclick=()=>this.createNoteForMeeting(s),r.title="Click to create meeting note"}}renderEmptyState(e){let t=e.createDiv({cls:"eudia-calendar-empty"});t.innerHTML=`
      <div class="eudia-empty-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <p class="eudia-empty-title">No meetings this week</p>
      <p class="eudia-empty-subtitle">Enjoy your focus time!</p>
    `}renderError(e,t){let i=e.createDiv({cls:"eudia-calendar-error"}),a="",s="Unable to load calendar",r="";t.includes("not authorized")||t.includes("403")?(a="\u{1F512}",s="Calendar Access Required",r="Contact your admin to be added to the authorized users list."):t.includes("network")||t.includes("fetch")?(a="\u{1F4E1}",s="Connection Issue",r="Check your internet connection and try again."):(t.includes("server")||t.includes("500"))&&(a="\u{1F527}",s="Server Unavailable",r="The server may be waking up. Try again in 30 seconds."),i.innerHTML=`
      <div class="eudia-error-icon">${a}</div>
      <p class="eudia-error-title">${s}</p>
      <p class="eudia-error-message">${t}</p>
      ${r?`<p class="eudia-error-action">${r}</p>`:""}
    `;let o=i.createEl("button",{cls:"eudia-btn-retry",text:"Try Again"});o.onclick=()=>this.render()}renderSetupPanel(e){let t=e.createDiv({cls:"eudia-calendar-setup-panel"});t.innerHTML=`
      <div class="eudia-setup-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <h3 class="eudia-setup-title">Connect Your Calendar</h3>
      <p class="eudia-setup-desc">Enter your Eudia email to see your meetings and create notes with one click.</p>
    `;let i=t.createDiv({cls:"eudia-setup-input-group"}),a=i.createEl("input",{type:"email",placeholder:"yourname@eudia.com"});a.addClass("eudia-setup-email");let s=i.createEl("button",{cls:"eudia-setup-connect",text:"Connect"}),r=t.createDiv({cls:"eudia-setup-status"});s.onclick=async()=>{let o=a.value.trim().toLowerCase();if(!o||!o.endsWith("@eudia.com")){r.textContent="Please use your @eudia.com email",r.className="eudia-setup-status error";return}s.disabled=!0,s.textContent="Connecting...",r.textContent="";try{if(!(await(0,l.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${o}`,method:"GET"})).json?.authorized){r.innerHTML=`<strong>${o}</strong> is not authorized. Contact your admin to be added.`,r.className="eudia-setup-status error",s.disabled=!1,s.textContent="Connect";return}this.plugin.settings.userEmail=o,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),r.textContent="Connected",r.className="eudia-setup-status success",this.plugin.scanLocalAccountFolders().catch(()=>{}),setTimeout(()=>this.render(),500)}catch(c){let p=c.message||"Connection failed";p.includes("403")?r.innerHTML=`<strong>${o}</strong> is not authorized for calendar access.`:r.textContent=p,r.className="eudia-setup-status error",s.disabled=!1,s.textContent="Connect"}},a.onkeydown=o=>{o.key==="Enter"&&s.click()},t.createEl("p",{cls:"eudia-setup-help",text:"Your calendar syncs automatically via Microsoft 365."})}extractAccountFromAttendees(e){if(!e||e.length===0)return null;let t=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com","live.com","msn.com","aol.com","protonmail.com"],i=[];for(let o of e){if(!o.email)continue;let p=o.email.toLowerCase().match(/@([a-z0-9.-]+)/);if(p){let d=p[1];!d.includes("eudia.com")&&!t.includes(d)&&i.push(d)}}if(i.length===0)return null;let a=i[0],s=a.split(".")[0],r=s.charAt(0).toUpperCase()+s.slice(1);return console.log(`[Eudia Calendar] Extracted company "${r}" from attendee domain ${a}`),r}extractAccountFromSubject(e){if(!e)return null;let t=e.match(/^([^\/]+)\s*\/\s*Eudia|Eudia\s*\/\s*([^\/\-|]+)/i);if(t){let a=(t[1]||t[2]||"").trim();if(a.toLowerCase()!=="eudia")return a}let i=e.match(/^Eudia\s*[-–]\s*([^|]+)|^([^-–]+)\s*[-–]\s*Eudia/i);if(i){let s=(i[1]||i[2]||"").trim().replace(/\s+(Connect|Weekly|Call|Meeting|Intro|Demo|Check\s*in|Sync).*$/i,"").trim();if(s.toLowerCase()!=="eudia"&&s.length>0)return s}if(!e.toLowerCase().includes("eudia")){let a=e.match(/^([^-–|]+)/);if(a){let s=a[1].trim();if(s.length>2&&s.length<50)return s}}return null}findAccountFolder(e){if(!e)return null;let t=this.plugin.settings.accountsFolder||"Accounts",i=this.app.vault.getAbstractFileByPath(t);if(!(i instanceof l.TFolder))return console.log(`[Eudia Calendar] Accounts folder "${t}" not found`),null;let a=e.toLowerCase().trim(),s=[];for(let m of i.children)m instanceof l.TFolder&&s.push(m.name);console.log(`[Eudia Calendar] Searching for "${a}" in ${s.length} folders`);let r=s.find(m=>m.toLowerCase()===a);if(r)return console.log(`[Eudia Calendar] Exact match found: ${r}`),`${t}/${r}`;let o=s.find(m=>m.toLowerCase().startsWith(a));if(o)return console.log(`[Eudia Calendar] Folder starts with match: ${o}`),`${t}/${o}`;let c=s.find(m=>a.startsWith(m.toLowerCase()));if(c)return console.log(`[Eudia Calendar] Search starts with folder match: ${c}`),`${t}/${c}`;let p=s.find(m=>{let u=m.toLowerCase();return u.length>=3&&a.includes(u)});if(p)return console.log(`[Eudia Calendar] Search contains folder match: ${p}`),`${t}/${p}`;let d=s.find(m=>{let u=m.toLowerCase();return a.length>=3&&u.includes(a)});return d?(console.log(`[Eudia Calendar] Folder contains search match: ${d}`),`${t}/${d}`):(console.log(`[Eudia Calendar] No folder match found for "${a}"`),null)}async createNoteForMeeting(e){let t=e.start.split("T")[0],i=e.subject.replace(/[<>:"/\\|?*]/g,"_").substring(0,50),a=`${t} - ${i}.md`,s=null,r=e.accountName||null,o=null;if(console.log(`[Eudia Calendar] === Creating note for meeting: "${e.subject}" ===`),console.log(`[Eudia Calendar] Attendees: ${JSON.stringify(e.attendees?.map(u=>u.email)||[])}`),!s&&e.attendees&&e.attendees.length>0){let u=this.extractAccountFromAttendees(e.attendees);console.log(`[Eudia Calendar] Extracted domain company name: "${u||"none"}"`),u&&(s=this.findAccountFolder(u),console.log(`[Eudia Calendar] Domain-based "${u}" -> folder: ${s||"not found"}`),s&&!r&&(r=s.split("/").pop()||u))}if(!s&&e.accountName&&(s=this.findAccountFolder(e.accountName),console.log(`[Eudia Calendar] Server accountName "${e.accountName}" -> folder: ${s||"not found"}`)),!s){let u=this.extractAccountFromSubject(e.subject);u&&(s=this.findAccountFolder(u),console.log(`[Eudia Calendar] Subject-based "${u}" -> folder: ${s||"not found"}`),s&&!r&&(r=s.split("/").pop()||u))}if(!s){let u=this.plugin.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(u)instanceof l.TFolder&&(s=u,console.log(`[Eudia Calendar] No match found, using Accounts root: ${s}`))}if(r){let u=this.plugin.settings.cachedAccounts.find(g=>g.name.toLowerCase()===r?.toLowerCase());u&&(o=u.id,r=u.name,console.log(`[Eudia Calendar] Matched to cached account: ${u.name} (${u.id})`))}let c=s?`${s}/${a}`:a,p=this.app.vault.getAbstractFileByPath(c);if(p instanceof l.TFile){await this.app.workspace.getLeaf().openFile(p),new l.Notice(`Opened existing note: ${a}`);return}let d=(e.attendees||[]).map(u=>u.name||u.email?.split("@")[0]||"Unknown").slice(0,5).join(", "),m=`---
title: "${e.subject}"
date: ${t}
attendees: [${d}]
account: "${r||""}"
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
${(e.attendees||[]).map(u=>`- ${u.name||u.email}`).join(`
`)}

## Pre-Call Notes

*Add any prep notes, context, or questions before the meeting*



---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` \u2192 **"Transcribe Meeting"**

---

`;try{let u=await this.app.vault.create(c,m);await this.app.workspace.getLeaf().openFile(u),new l.Notice(`Created: ${c}`)}catch(u){console.error("[Eudia Calendar] Failed to create note:",u),new l.Notice(`Could not create note: ${u.message||"Unknown error"}`)}}},D=class extends l.Plugin{constructor(){super(...arguments);this.audioRecorder=null;this.recordingStatusBar=null}async onload(){await this.loadSettings(),this.transcriptionService=new T(this.settings.serverUrl,this.settings.openaiApiKey),this.calendarService=new A(this.settings.serverUrl,this.settings.userEmail),this.smartTagService=new $,this.registerView(E,e=>new R(e,this)),this.registerView(C,e=>new F(e,this)),this.addRibbonIcon("calendar","Open Calendar",()=>this.activateCalendarView()),this.addRibbonIcon("microphone","Transcribe Meeting",async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}),this.addCommand({id:"transcribe-meeting",name:"Transcribe Meeting",callback:async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}}),this.addCommand({id:"open-calendar",name:"Open Calendar",callback:()=>this.activateCalendarView()}),this.addCommand({id:"sync-accounts",name:"Sync Salesforce Accounts",callback:()=>this.syncAccounts()}),this.addCommand({id:"sync-note",name:"Sync Note to Salesforce",callback:()=>this.syncNoteToSalesforce()}),this.addCommand({id:"new-meeting-note",name:"New Meeting Note",callback:()=>this.createMeetingNote()}),this.addSettingTab(new _(this.app,this)),this.registerEditorSuggest(new j(this.app,this)),this.app.workspace.onLayoutReady(async()=>{if(this.settings.setupCompleted)this.settings.syncOnStartup&&(await this.scanLocalAccountFolders(),this.settings.showCalendarView&&this.settings.userEmail&&await this.activateCalendarView());else{await new Promise(t=>setTimeout(t,100));let e=document.querySelector(".modal-container .modal");if(e){let t=e.querySelector(".modal-close-button");t&&t.click()}await this.activateSetupView()}})}async onunload(){this.app.workspace.detachLeavesOfType(E)}async loadSettings(){this.settings=Object.assign({},Z,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}async activateCalendarView(){let e=this.app.workspace,t=e.getLeavesOfType(E);if(t.length>0)e.revealLeaf(t[0]);else{let i=e.getRightLeaf(!1);i&&(await i.setViewState({type:E,active:!0}),e.revealLeaf(i))}}async activateSetupView(){let e=this.app.workspace,t=e.getLeavesOfType(C);if(t.length>0)e.revealLeaf(t[0]);else{let i=e.getLeaf(!0);i&&(await i.setViewState({type:C,active:!0}),e.revealLeaf(i))}}async createTailoredAccountFolders(e){let t=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t);let a=0;for(let s of e){let r=s.name.replace(/[<>:"/\\|?*]/g,"_").trim(),o=`${t}/${r}`;if(this.app.vault.getAbstractFileByPath(o)instanceof l.TFolder){console.log(`[Eudia] Account folder already exists: ${r}`);continue}try{await this.app.vault.createFolder(o);let p=new Date().toISOString().split("T")[0],d=[{name:"Note 1.md",content:`---
account: "${s.name}"
account_id: "${s.id}"
type: meeting_note
sync_to_salesforce: false
created: ${p}
---

# ${s.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 2.md",content:`---
account: "${s.name}"
account_id: "${s.id}"
type: meeting_note
sync_to_salesforce: false
created: ${p}
---

# ${s.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 3.md",content:`---
account: "${s.name}"
account_id: "${s.id}"
type: meeting_note
sync_to_salesforce: false
created: ${p}
---

# ${s.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Meeting Notes.md",content:`---
account: "${s.name}"
account_id: "${s.id}"
type: meetings_index
sync_to_salesforce: false
---

# ${s.name} - Meeting Notes

*Use Note 1, Note 2, Note 3 for your meeting notes. When full, create additional notes.*

## Recent Meetings

| Date | Note | Key Outcomes |
|------|------|--------------|
|      |      |              |

## Quick Start

1. Open **Note 1** for your next meeting
2. Click the **microphone** to record and transcribe
3. **Next Steps** are auto-extracted after transcription
4. Set \`sync_to_salesforce: true\` to sync to Salesforce
`},{name:"Contacts.md",content:`---
account: "${s.name}"
account_id: "${s.id}"
type: contacts
sync_to_salesforce: false
---

# ${s.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
|      |       |       |       |       |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`},{name:"Intelligence.md",content:`---
account: "${s.name}"
account_id: "${s.id}"
type: intelligence
sync_to_salesforce: false
---

# ${s.name} - Account Intelligence

## Company Overview

*Industry, size, headquarters, key facts.*

## Strategic Priorities

*What's top of mind for leadership? Digital transformation initiatives?*

## Legal/Compliance Landscape

*Regulatory environment, compliance challenges, legal team structure.*

## Competitive Intelligence

*Incumbent vendors, evaluation history, competitive positioning.*

## News & Signals

*Recent news, earnings mentions, leadership changes.*
`},{name:"Next Steps.md",content:`---
account: "${s.name}"
account_id: "${s.id}"
type: next_steps
auto_updated: true
last_updated: ${p}
sync_to_salesforce: false
---

# ${s.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}];for(let m of d){let u=`${o}/${m.name}`;await this.app.vault.create(u,m.content)}a++,console.log(`[Eudia] Created account folder with subnotes: ${r}`)}catch(p){console.error(`[Eudia] Failed to create folder for ${r}:`,p)}}this.settings.cachedAccounts=e.map(s=>({id:s.id,name:s.name})),await this.saveSettings(),a>0&&new l.Notice(`Created ${a} account folders`),await this.ensureNextStepsFolderExists()}async ensureNextStepsFolderExists(){let e="Next Steps",t=`${e}/All Next Steps.md`;if(this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e),!this.app.vault.getAbstractFileByPath(t)){let s=new Date().toISOString().split("T")[0],r=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${s}
---

# All Next Steps Dashboard

*Last updated: ${s} ${r}*

---

## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;await this.app.vault.create(t,o)}}async updateAccountNextSteps(e,t,i){try{console.log(`[Eudia] updateAccountNextSteps called for: ${e}`),console.log(`[Eudia] Content length: ${t?.length||0} chars`);let a=e.replace(/[<>:"/\\|?*]/g,"_").trim(),s=`${this.settings.accountsFolder}/${a}/Next Steps.md`;console.log(`[Eudia] Looking for Next Steps file at: ${s}`);let r=this.app.vault.getAbstractFileByPath(s);if(!r||!(r instanceof l.TFile)){console.log(`[Eudia] \u274C Next Steps file NOT FOUND at: ${s}`);let S=this.app.vault.getAbstractFileByPath(`${this.settings.accountsFolder}/${a}`);S&&S instanceof l.TFolder?console.log(`[Eudia] Files in ${a} folder:`,S.children.map(b=>b.name)):console.log(`[Eudia] Account folder also not found: ${this.settings.accountsFolder}/${a}`);return}console.log("[Eudia] \u2713 Found Next Steps file, updating...");let o=new Date().toISOString().split("T")[0],c=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),p=i.split("/").pop()?.replace(".md","")||"Meeting",d=t;!t.includes("- [ ]")&&!t.includes("- [x]")&&(d=t.split(`
`).filter(S=>S.trim()).map(S=>{let b=S.replace(/^[-•*]\s*/,"").trim();return b?`- [ ] ${b}`:""}).filter(Boolean).join(`
`));let m=await this.app.vault.read(r),u="",g=m.match(/## History\n\n\*Previous next steps are archived below\.\*\n\n([\s\S]*?)$/);g&&g[1]&&(u=g[1].trim());let h=`### ${o} - ${p}
${d||"*None*"}`,y=u?`${h}

---

${u}`:h,v=`---
account: "${e}"
account_id: "${this.settings.cachedAccounts.find(S=>S.name===e)?.id||""}"
type: next_steps
auto_updated: true
last_updated: ${o}
sync_to_salesforce: false
---

# ${e} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*Last updated: ${o} ${c} from ${p}*

${d||"*No next steps identified*"}

---

## History

*Previous next steps are archived below.*

${y}
`;await this.app.vault.modify(r,v),console.log(`[Eudia] Updated Next Steps for ${e} (history preserved)`),await this.regenerateNextStepsDashboard()}catch(a){console.error(`[Eudia] Failed to update Next Steps for ${e}:`,a)}}async regenerateNextStepsDashboard(){try{let t=this.app.vault.getAbstractFileByPath("Next Steps/All Next Steps.md");if(!t||!(t instanceof l.TFile)){await this.ensureNextStepsFolderExists();return}let i=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!i||!(i instanceof l.TFolder))return;let a=[];for(let c of i.children)if(c instanceof l.TFolder){let p=`${c.path}/Next Steps.md`,d=this.app.vault.getAbstractFileByPath(p);if(d instanceof l.TFile){let m=await this.app.vault.read(d),u=m.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/),g=u?u[1]:"Unknown",h=m.split(`
`).filter(y=>y.match(/^- \[[ x]\]/)).slice(0,5);(h.length>0||g!=="Unknown")&&a.push({account:c.name,lastUpdated:g,nextSteps:h})}}a.sort((c,p)=>p.lastUpdated.localeCompare(c.lastUpdated));let s=new Date().toISOString().split("T")[0],r=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${s}
---

# All Next Steps Dashboard

*Last updated: ${s} ${r}*

---

`;if(a.length===0)o+=`## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;else{for(let c of a)o+=`## ${c.account}

`,c.nextSteps.length>0?o+=c.nextSteps.join(`
`)+`
`:o+=`*No current next steps*
`,o+=`
*Updated: ${c.lastUpdated}*

---

`;o+=`## Summary

`,o+=`| Account | Last Updated | Open Items |
`,o+=`|---------|--------------|------------|
`;for(let c of a){let p=c.nextSteps.filter(d=>d.includes("- [ ]")).length;o+=`| ${c.account} | ${c.lastUpdated} | ${p} |
`}}await this.app.vault.modify(t,o),console.log("[Eudia] Regenerated All Next Steps dashboard")}catch(e){console.error("[Eudia] Failed to regenerate Next Steps dashboard:",e)}}async startRecording(){if(!I.isSupported()){new l.Notice("Audio transcription is not supported in this browser");return}let e=this.app.workspace.getActiveFile();if(e||(await this.createMeetingNote(),e=this.app.workspace.getActiveFile()),!e){new l.Notice("Please open or create a note first");return}this.audioRecorder=new I,this.recordingStatusBar=new W(()=>this.audioRecorder?.pause(),()=>this.audioRecorder?.resume(),()=>this.stopRecording(),()=>this.cancelRecording());try{await this.audioRecorder.start(),this.recordingStatusBar.show();let t=setInterval(()=>{if(this.audioRecorder?.isRecording()){let i=this.audioRecorder.getState();this.recordingStatusBar?.updateState(i)}else clearInterval(t)},100);new l.Notice("Transcription started. Click stop when finished.")}catch(t){new l.Notice(`Failed to start transcription: ${t.message}`),this.recordingStatusBar?.hide(),this.recordingStatusBar=null}}async stopRecording(){if(!this.audioRecorder?.isRecording())return;let e=this.app.workspace.getActiveFile();if(!e){new l.Notice("No active file to save transcription"),this.cancelRecording();return}this.recordingStatusBar?.showProcessing();try{let t=await this.audioRecorder.stop();await this.processRecording(t,e)}catch(t){new l.Notice(`Transcription failed: ${t.message}`)}finally{this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null}}async cancelRecording(){this.audioRecorder?.isRecording()&&this.audioRecorder.cancel(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null,new l.Notice("Transcription cancelled")}async processRecording(e,t){let i=e.audioBlob?.size||0;if(console.log(`[Eudia] Audio blob size: ${i} bytes, duration: ${e.duration}s`),i<1e3){new l.Notice("Recording too short or no audio captured. Please try again.");return}let a=Math.ceil(e.duration/60),s=Math.max(1,Math.ceil(a/5));new l.Notice(`Transcription started. Estimated ${s}-${s+1} minutes.`);let r=await this.app.vault.read(t),o=`

---
**Transcription in progress...**
Started: ${new Date().toLocaleTimeString()}
Estimated completion: ${s}-${s+1} minutes

*You can navigate away. Check back shortly.*
---
`;await this.app.vault.modify(t,r+o),this.processTranscriptionAsync(e,t).catch(c=>{console.error("Background transcription failed:",c),new l.Notice(`Transcription failed: ${c.message}`)})}async processTranscriptionAsync(e,t){try{let i,a=t.path.split("/");if(console.log(`[Eudia] Processing transcription for: ${t.path}`),console.log(`[Eudia] Path parts: ${JSON.stringify(a)}, accountsFolder: ${this.settings.accountsFolder}`),a.length>=2&&a[0]===this.settings.accountsFolder){let u=a[1];console.log(`[Eudia] Detected account folder: ${u}`);let g=this.settings.cachedAccounts.find(h=>h.name.toLowerCase()===u.toLowerCase());g?(i={accountName:g.name,accountId:g.id},console.log(`[Eudia] Found cached account: ${g.name} (${g.id})`)):(i={accountName:u,accountId:""},console.log(`[Eudia] Account not in cache, using folder name: ${u}`))}else console.log("[Eudia] File not in Accounts folder, skipping account context");let s=[];try{let u=await this.calendarService.getCurrentMeeting();u.meeting?.attendees&&(s=u.meeting.attendees.map(g=>g.name||g.email.split("@")[0]).filter(Boolean).slice(0,10))}catch{}let r=await this.transcriptionService.transcribeAudio(e.audioBlob,i?{...i,speakerHints:s}:{speakerHints:s}),o=u=>u?!!(u.summary?.trim()||u.nextSteps?.trim()):!1,c=r.sections;if(o(c)||r.text?.trim()&&(c=await this.transcriptionService.processTranscription(r.text,i)),!o(c)&&!r.text?.trim()){let g=(await this.app.vault.read(t)).replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g,"");await this.app.vault.modify(t,g+`

**Transcription failed:** No audio detected.
`),new l.Notice("Transcription failed: No audio detected.");return}let p=this.buildNoteContent(c,r);await this.app.vault.modify(t,p);let d=Math.floor(e.duration/60);new l.Notice(`Transcription complete (${d} min recording)`);let m=c.nextSteps||c.actionItems;console.log(`[Eudia] Next Steps extraction - accountContext: ${i?.accountName||"undefined"}`),console.log(`[Eudia] Next Steps content found: ${m?"YES ("+m.length+" chars)":"NO"}`),console.log(`[Eudia] sections.nextSteps: ${c.nextSteps?"YES":"NO"}, sections.actionItems: ${c.actionItems?"YES":"NO"}`),m&&i?.accountName?(console.log(`[Eudia] Calling updateAccountNextSteps for ${i.accountName}`),await this.updateAccountNextSteps(i.accountName,m,t.path)):console.log("[Eudia] Skipping Next Steps update - missing content or account context"),this.settings.autoSyncAfterTranscription&&await this.syncNoteToSalesforce()}catch(i){try{let s=(await this.app.vault.read(t)).replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g,"");await this.app.vault.modify(t,s+`

**Transcription failed:** ${i.message}
`)}catch{}throw i}}buildNoteContent(e,t){let i=y=>y==null?"":Array.isArray(y)?y.map(v=>typeof v=="object"?v.category?`**${v.category}**: ${v.signal||v.insight||""}`:JSON.stringify(v):String(v)).join(`
`):typeof y=="object"?JSON.stringify(y):String(y),a=i(e.title)||"Meeting Notes",s=i(e.summary),r=i(e.painPoints),o=i(e.productInterest),c=i(e.meddiccSignals),p=i(e.nextSteps),d=i(e.actionItems),m=i(e.keyDates),u=i(e.risksObjections),g=i(e.attendees),h=`---
title: "${a}"
date: ${new Date().toISOString().split("T")[0]}
transcribed: true
sync_to_salesforce: false
clo_meeting: false
source: ""
confidence: ${t.confidence}
---

# ${a}

## Summary

${s||"*AI summary will appear here*"}

`;return r&&!r.includes("None explicitly")&&(h+=`## Pain Points

${r}

`),o&&!o.includes("None identified")&&(h+=`## Product Interest

${o}

`),c&&(h+=`## MEDDICC Signals

${c}

`),p&&(h+=`## Next Steps

${p}

`),d&&(h+=`## Action Items

${d}

`),m&&!m.includes("No specific dates")&&(h+=`## Key Dates

${m}

`),u&&!u.includes("None raised")&&(h+=`## Risks and Objections

${u}

`),g&&(h+=`## Attendees

${g}

`),this.settings.appendTranscript&&t.text&&(h+=`---

## Full Transcript

${t.text}
`),h}async syncAccounts(e=!1){e||new l.Notice("Syncing Salesforce accounts...");try{let i=(await(0,l.requestUrl)({url:`${this.settings.serverUrl}/api/accounts/obsidian`,method:"GET",headers:{Accept:"application/json"}})).json;if(!i.success||!i.accounts){e||new l.Notice("Failed to fetch accounts from server");return}this.settings.cachedAccounts=i.accounts.map(a=>({id:a.id,name:a.name})),this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings(),e||new l.Notice(`Synced ${i.accounts.length} accounts for matching`)}catch(t){e||new l.Notice(`Failed to sync accounts: ${t.message}`)}}async scanLocalAccountFolders(){try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!e||!(e instanceof l.TFolder))return;let t=[];for(let i of e.children)i instanceof l.TFolder&&t.push({id:`local-${i.name.replace(/\s+/g,"-").toLowerCase()}`,name:i.name});this.settings.cachedAccounts=t,this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings()}catch(e){console.error("Failed to scan local account folders:",e)}}async syncNoteToSalesforce(){let e=this.app.workspace.getActiveFile();if(!e){new l.Notice("No active file to sync");return}let t=await this.app.vault.read(e),i=this.app.metadataCache.getFileCache(e)?.frontmatter;if(!i?.sync_to_salesforce){new l.Notice("Set sync_to_salesforce: true in frontmatter to enable sync");return}let a=i.account_id,s=i.account;if(!a&&s){let r=this.settings.cachedAccounts.find(o=>o.name.toLowerCase()===s.toLowerCase());r&&(a=r.id)}if(!a){let r=e.path.split("/");if(r.length>=2&&r[0]===this.settings.accountsFolder){let o=r[1],c=this.settings.cachedAccounts.find(p=>p.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);c&&(a=c.id,s=c.name)}}if(!a){new l.Notice("Could not determine account for this note");return}try{new l.Notice("Syncing to Salesforce...");let r=await(0,l.requestUrl)({url:`${this.settings.serverUrl}/api/notes/sync`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:a,accountName:s,noteTitle:e.basename,notePath:e.path,content:t,frontmatter:i,syncedAt:new Date().toISOString(),userEmail:this.settings.userEmail})});r.json?.success?new l.Notice("Synced to Salesforce"):new l.Notice("Failed to sync: "+(r.json?.error||"Unknown error"))}catch(r){new l.Notice(`Sync failed: ${r.message}`)}}async createMeetingNote(){return new Promise(e=>{new L(this.app,this,async i=>{if(!i){e();return}let a=new Date().toISOString().split("T")[0],s=i.name.replace(/[<>:"/\\|?*]/g,"_").trim(),r=`${this.settings.accountsFolder}/${s}`,o=`${a} Meeting.md`,c=`${r}/${o}`;this.app.vault.getAbstractFileByPath(r)||await this.app.vault.createFolder(r);let p=`---
title: "Meeting with ${i.name}"
date: ${a}
account: "${i.name}"
account_id: "${i.id}"
meeting_type: discovery
sync_to_salesforce: false
transcribed: false
---

# Meeting with ${i.name}

## Pre-Call Notes

*Add context or questions here*



---

## Ready to Transcribe

Click the microphone icon or \`Cmd/Ctrl+P\` \u2192 "Transcribe Meeting"

---

`,d=await this.app.vault.create(c,p);await this.app.workspace.getLeaf().openFile(d),new l.Notice(`Created meeting note for ${i.name}`),e()}).open()})}async fetchAndInsertContext(){new l.Notice("Fetching pre-call context...")}},_=class extends l.PluginSettingTab{constructor(n,e){super(n,e),this.plugin=e}display(){let{containerEl:n}=this;n.empty(),n.createEl("h2",{text:"Eudia Sync & Scribe"}),n.createEl("h3",{text:"Your Profile"});let e=n.createDiv();e.style.cssText="padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px; margin-top: 16px;";let t=e.createDiv();t.style.cssText="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";let i=t.createSpan(),a=t.createSpan(),s=e.createDiv();s.style.cssText="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;",s.setText("Connect with Salesforce to sync notes with your user attribution.");let r=e.createEl("button");r.style.cssText="padding: 10px 20px; cursor: pointer; border-radius: 6px;";let o=null,c=async()=>{if(!this.plugin.settings.userEmail)return i.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);",a.setText("Enter email above first"),r.setText("Setup Required"),r.disabled=!0,r.style.opacity="0.5",r.style.cursor="not-allowed",!1;r.disabled=!1,r.style.opacity="1",r.style.cursor="pointer";try{return i.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); animation: pulse 1s infinite;",a.setText("Checking..."),(await(0,l.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(i.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;",a.setText("Connected to Salesforce"),r.setText("Reconnect"),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),!0):(i.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;",a.setText("Not connected"),r.setText("Connect to Salesforce"),!1)}catch{return i.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;",a.setText("Status unavailable"),r.setText("Connect to Salesforce"),!1}};new l.Setting(n).setName("Eudia Email").setDesc("Your @eudia.com email address for calendar and Salesforce sync").addText(d=>d.setPlaceholder("yourname@eudia.com").setValue(this.plugin.settings.userEmail).onChange(async m=>{let u=m.trim().toLowerCase();this.plugin.settings.userEmail=u,await this.plugin.saveSettings(),await c()})),n.createEl("h3",{text:"Salesforce Connection"}),n.appendChild(e);let p=()=>{o&&window.clearInterval(o);let d=0,m=30;o=window.setInterval(async()=>{d++,await c()?(o&&(window.clearInterval(o),o=null),new l.Notice("Salesforce connected successfully!")):d>=m&&o&&(window.clearInterval(o),o=null)},5e3)};r.onclick=async()=>{if(!this.plugin.settings.userEmail){new l.Notice("Please enter your email first");return}let d=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(d,"_blank"),new l.Notice("Complete the Salesforce login in the popup window",5e3),p()},c(),n.createEl("h3",{text:"Server"}),new l.Setting(n).setName("GTM Brain Server").setDesc("Server URL for calendar, accounts, and sync").addText(d=>d.setValue(this.plugin.settings.serverUrl).onChange(async m=>{this.plugin.settings.serverUrl=m,await this.plugin.saveSettings()})),new l.Setting(n).setName("OpenAI API Key").setDesc("For transcription (optional if server provides)").addText(d=>{d.setPlaceholder("sk-...").setValue(this.plugin.settings.openaiApiKey).onChange(async m=>{this.plugin.settings.openaiApiKey=m,await this.plugin.saveSettings()}),d.inputEl.type="password"}),n.createEl("h3",{text:"Transcription"}),new l.Setting(n).setName("Save Audio Files").setDesc("Keep original audio recordings").addToggle(d=>d.setValue(this.plugin.settings.saveAudioFiles).onChange(async m=>{this.plugin.settings.saveAudioFiles=m,await this.plugin.saveSettings()})),new l.Setting(n).setName("Append Full Transcript").setDesc("Include complete transcript in notes").addToggle(d=>d.setValue(this.plugin.settings.appendTranscript).onChange(async m=>{this.plugin.settings.appendTranscript=m,await this.plugin.saveSettings()})),n.createEl("h3",{text:"Sync"}),new l.Setting(n).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle(d=>d.setValue(this.plugin.settings.syncOnStartup).onChange(async m=>{this.plugin.settings.syncOnStartup=m,await this.plugin.saveSettings()})),new l.Setting(n).setName("Auto-Sync After Transcription").setDesc("Push notes to Salesforce after transcription").addToggle(d=>d.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async m=>{this.plugin.settings.autoSyncAfterTranscription=m,await this.plugin.saveSettings()})),n.createEl("h3",{text:"Folders"}),new l.Setting(n).setName("Accounts Folder").setDesc("Where account folders are stored").addText(d=>d.setValue(this.plugin.settings.accountsFolder).onChange(async m=>{this.plugin.settings.accountsFolder=m||"Accounts",await this.plugin.saveSettings()})),new l.Setting(n).setName("Recordings Folder").setDesc("Where audio files are saved").addText(d=>d.setValue(this.plugin.settings.recordingsFolder).onChange(async m=>{this.plugin.settings.recordingsFolder=m||"Recordings",await this.plugin.saveSettings()})),n.createEl("h3",{text:"Actions"}),new l.Setting(n).setName("Sync Accounts Now").setDesc(`${this.plugin.settings.cachedAccounts.length} accounts available for matching (folders are pre-loaded)`).addButton(d=>d.setButtonText("Sync").setCta().onClick(async()=>{await this.plugin.syncAccounts(),this.display()})),this.plugin.settings.lastSyncTime&&n.createEl("p",{text:`Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()}`,cls:"setting-item-description"}),n.createEl("p",{text:`Audio transcription: ${I.isSupported()?"Supported":"Not supported"}`,cls:"setting-item-description"})}};
