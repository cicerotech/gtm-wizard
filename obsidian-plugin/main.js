var ye=Object.create;var G=Object.defineProperty;var ge=Object.getOwnPropertyDescriptor;var fe=Object.getOwnPropertyNames;var we=Object.getPrototypeOf,Oe=Object.prototype.hasOwnProperty;var ve=(O,r)=>{for(var t in r)G(O,t,{get:r[t],enumerable:!0})},se=(O,r,t,e)=>{if(r&&typeof r=="object"||typeof r=="function")for(let n of fe(r))!Oe.call(O,n)&&n!==t&&G(O,n,{get:()=>r[n],enumerable:!(e=ge(r,n))||e.enumerable});return O};var U=(O,r,t)=>(t=O!=null?ye(we(O)):{},se(r||!O||!O.__esModule?G(t,"default",{value:O,enumerable:!0}):t,O)),Se=O=>se(G({},"__esModule",{value:!0}),O);var Le={};ve(Le,{default:()=>V});module.exports=Se(Le);var p=require("obsidian");var T=class O{constructor(){this.mediaRecorder=null;this.audioChunks=[];this.stream=null;this.startTime=0;this.pausedDuration=0;this.pauseStartTime=0;this.durationInterval=null;this.audioContext=null;this.analyser=null;this.levelInterval=null;this.lastExtractedChunkIndex=0;this.mimeTypeCache="audio/webm";this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0};this.stateCallback=null;this.levelHistory=[];this.trackingLevels=!1}onStateChange(r){this.stateCallback=r}static isIOSOrSafari(){let r=navigator.userAgent,t=/iPad|iPhone|iPod/.test(r)&&!window.MSStream,e=/^((?!chrome|android).)*safari/i.test(r);return t||e}getSupportedMimeType(){let r=O.isIOSOrSafari(),t=r?["audio/mp4","audio/mp4;codecs=aac","audio/aac","audio/webm;codecs=opus","audio/webm"]:["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];for(let e of t)if(MediaRecorder.isTypeSupported(e))return console.log(`[AudioRecorder] Using MIME type: ${e} (iOS/Safari: ${r})`),e;return r?"audio/mp4":"audio/webm"}async startRecording(){if(this.state.isRecording)throw new Error("Already recording");try{let r=O.isIOSOrSafari(),t=r?{echoCancellation:!0,noiseSuppression:!0}:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0,sampleRate:48e3,channelCount:1};this.stream=await navigator.mediaDevices.getUserMedia({audio:t}),console.log(`[AudioRecorder] Microphone access granted (iOS/Safari: ${r})`),this.setupAudioAnalysis();let e=this.getSupportedMimeType();this.mimeTypeCache=e,this.mediaRecorder=new MediaRecorder(this.stream,{mimeType:e,audioBitsPerSecond:128e3}),this.audioChunks=[],this.lastExtractedChunkIndex=0,this.mediaRecorder.ondataavailable=n=>{n.data.size>0&&this.audioChunks.push(n.data)},this.mediaRecorder.start(1e3),this.startTime=Date.now(),this.pausedDuration=0,this.state={isRecording:!0,isPaused:!1,duration:0,audioLevel:0},this.startDurationTracking(),this.startLevelTracking(),this.notifyStateChange()}catch(r){throw this.cleanup(),new Error(`Failed to start recording: ${r.message}`)}}setupAudioAnalysis(){if(this.stream)try{this.audioContext=new AudioContext;let r=this.audioContext.createMediaStreamSource(this.stream);this.analyser=this.audioContext.createAnalyser(),this.analyser.fftSize=256,r.connect(this.analyser)}catch(r){console.warn("Failed to set up audio analysis:",r)}}startDurationTracking(){this.durationInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused){let r=Date.now()-this.startTime-this.pausedDuration;this.state.duration=Math.floor(r/1e3),this.notifyStateChange(),this.state.duration>=5400&&(console.log("[Eudia] Maximum recording duration reached (90 minutes) \u2014 auto-stopping"),this.stop())}},100)}startLevelTracking(){if(!this.analyser)return;let r=new Uint8Array(this.analyser.frequencyBinCount);this.levelInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused&&this.analyser){this.analyser.getByteFrequencyData(r);let t=0;for(let n=0;n<r.length;n++)t+=r[n];let e=t/r.length;this.state.audioLevel=Math.min(100,Math.round(e/255*100*2)),this.notifyStateChange()}},50)}pauseRecording(){!this.state.isRecording||this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="recording"&&(this.mediaRecorder.pause(),this.pauseStartTime=Date.now(),this.state.isPaused=!0,this.notifyStateChange())}resumeRecording(){!this.state.isRecording||!this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="paused"&&(this.mediaRecorder.resume(),this.pausedDuration+=Date.now()-this.pauseStartTime,this.state.isPaused=!1,this.notifyStateChange())}async stopRecording(){return new Promise((r,t)=>{if(!this.mediaRecorder||!this.state.isRecording){t(new Error("Not currently recording"));return}let e=this.mediaRecorder.mimeType,n=this.state.duration,s=!1,i=setTimeout(()=>{if(!s){s=!0,console.warn("AudioRecorder: onstop timeout, forcing completion");try{let a=new Blob(this.audioChunks,{type:e}),o=new Date,c=o.toISOString().split("T")[0],l=o.toTimeString().split(" ")[0].replace(/:/g,"-"),d=e.includes("webm")?"webm":e.includes("mp4")?"m4a":e.includes("ogg")?"ogg":"webm",u=`recording-${c}-${l}.${d}`;this.cleanup(),r({audioBlob:a,duration:n,mimeType:e,filename:u})}catch{this.cleanup(),t(new Error("Failed to process recording after timeout"))}}},1e4);this.mediaRecorder.onstop=()=>{if(!s){s=!0,clearTimeout(i);try{console.log(`[AudioRecorder] Chunks collected: ${this.audioChunks.length}`);let a=new Blob(this.audioChunks,{type:e});console.log(`[AudioRecorder] Blob size: ${a.size} bytes`);let o=new Date,c=o.toISOString().split("T")[0],l=o.toTimeString().split(" ")[0].replace(/:/g,"-"),d=e.includes("webm")?"webm":e.includes("mp4")?"m4a":e.includes("ogg")?"ogg":"webm",u=`recording-${c}-${l}.${d}`;this.cleanup(),r({audioBlob:a,duration:n,mimeType:e,filename:u})}catch(a){this.cleanup(),t(a)}}},this.mediaRecorder.onerror=a=>{s||(s=!0,clearTimeout(i),this.cleanup(),t(new Error("Recording error occurred")))},this.mediaRecorder.state==="recording"&&this.mediaRecorder.requestData(),setTimeout(()=>{this.mediaRecorder&&this.mediaRecorder.state!=="inactive"&&this.mediaRecorder.stop()},100)})}cancelRecording(){this.cleanup()}cleanup(){this.durationInterval&&(clearInterval(this.durationInterval),this.durationInterval=null),this.levelInterval&&(clearInterval(this.levelInterval),this.levelInterval=null),this.audioContext&&(this.audioContext.close().catch(()=>{}),this.audioContext=null,this.analyser=null),this.stream&&(this.stream.getTracks().forEach(r=>r.stop()),this.stream=null),this.mediaRecorder=null,this.audioChunks=[],this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0},this.notifyStateChange()}getState(){return{...this.state}}static isSupported(){if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder)return!1;let t=["audio/webm","audio/mp4","audio/ogg","audio/webm;codecs=opus"].some(e=>MediaRecorder.isTypeSupported(e));return t||console.warn("[AudioRecorder] No supported audio formats found"),t}static getMobileInstructions(){return this.isIOSOrSafari()?"For best results on iOS, ensure you have granted microphone permissions in Settings > Privacy > Microphone.":null}notifyStateChange(){this.stateCallback&&this.stateCallback({...this.state})}static formatDuration(r){let t=Math.floor(r/60),e=r%60;return`${t.toString().padStart(2,"0")}:${e.toString().padStart(2,"0")}`}static async blobToBase64(r){return new Promise((t,e)=>{let n=new FileReader;n.onload=()=>{let i=n.result.split(",")[1];t(i)},n.onerror=e,n.readAsDataURL(r)})}static async blobToArrayBuffer(r){return r.arrayBuffer()}async start(){return this.startRecording()}async stop(){return this.stopRecording()}pause(){return this.pauseRecording()}resume(){return this.resumeRecording()}cancel(){return this.cancelRecording()}isRecording(){return this.state.isRecording}extractNewChunks(){if(!this.state.isRecording||this.audioChunks.length===0)return null;let r=this.audioChunks.slice(this.lastExtractedChunkIndex);return r.length===0?null:(this.lastExtractedChunkIndex=this.audioChunks.length,new Blob(r,{type:this.mimeTypeCache}))}getAllChunksAsBlob(){return this.audioChunks.length===0?null:new Blob(this.audioChunks,{type:this.mimeTypeCache})}getDuration(){return this.state.duration}getMimeType(){return this.mimeTypeCache}startLevelHistoryTracking(){this.levelHistory=[],this.trackingLevels=!0}recordLevelSample(){this.trackingLevels&&this.levelHistory.push(this.state.audioLevel)}getAudioDiagnostic(){if(this.levelHistory.length===0)return{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:100,warning:"Unable to analyze audio levels - recording may be too short"};let r=this.levelHistory.reduce((i,a)=>i+a,0)/this.levelHistory.length,t=Math.max(...this.levelHistory),e=this.levelHistory.filter(i=>i<5).length,n=Math.round(e/this.levelHistory.length*100),s=null;return t<5?s="SILENT AUDIO: No audio was detected during recording. Check your microphone settings and ensure Obsidian has microphone permission.":r<10&&n>80?s="VERY LOW AUDIO: Audio levels were extremely low. The transcription may not be accurate. Check your microphone or move closer to it.":n>90&&(s="MOSTLY SILENT: Over 90% of the recording had no audio. Make sure you're capturing the meeting audio, not just silence."),{hasAudio:t>=5,averageLevel:Math.round(r),peakLevel:t,silentPercent:n,warning:s}}static async analyzeAudioBlob(r){try{let t=new AudioContext,e=await r.arrayBuffer(),n;try{n=await t.decodeAudioData(e)}catch{return await t.close(),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:"Could not analyze audio format. Proceeding with transcription."}}let s=n.getChannelData(0),i=0,a=0,o=0,c=.01,l=100,d=0;for(let f=0;f<s.length;f+=l){let w=Math.abs(s[f]);i+=w,w>a&&(a=w),w<c&&o++,d++}await t.close();let u=i/d,y=Math.round(o/d*100),m=Math.round(u*100*10),h=Math.round(a*100),g=null;return a<.01?g='SILENT AUDIO DETECTED: The recording appears to contain only silence. This typically causes Whisper to hallucinate random text like "Yes. Yes. Yes." Check your audio input source.':u<.005&&y>95?g="NEAR-SILENT AUDIO: The recording is almost entirely silent. The transcription will likely be inaccurate.":y>90&&(g="MOSTLY SILENT: Over 90% of the recording is silent. Consider checking your audio setup."),{hasAudio:a>=.01,averageLevel:m,peakLevel:h,silentPercent:y,warning:g}}catch(t){return console.error("Audio analysis failed:",t),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:null}}}};var N=require("obsidian");var X=class{constructor(){this.salesforceAccounts=[]}setAccounts(r){this.salesforceAccounts=r}detectAccount(r,t,e){if(r){let n=this.detectFromTitle(r);if(n.confidence>=70)return n}if(e){let n=this.detectFromFilePath(e);if(n.confidence>=70)return n}if(t&&t.length>0){let n=this.detectFromAttendees(t);if(n.confidence>=50)return n}return{account:null,accountId:null,confidence:0,source:"none",evidence:"No account detected from available context"}}detectFromTitle(r){if(!r)return{account:null,accountId:null,confidence:0,source:"title",evidence:"No title"};let t=[{regex:/^([A-Za-z0-9][^-–—]+?)\s*[-–—]\s*(?:[A-Z][a-z]+|[A-Za-z]{2,})/,confidence:85},{regex:/(?:call|meeting|sync|check-in|demo|discovery)\s+(?:with|re:?|@)\s+([^-–—]+?)(?:\s*[-–—]|$)/i,confidence:80},{regex:/^([A-Za-z][^-–—]+?)\s+(?:discovery|demo|review|kickoff|intro|onboarding|sync)\s*(?:call)?$/i,confidence:75},{regex:/^([^:]+?):\s+/i,confidence:70},{regex:/^\[([^\]]+)\]/,confidence:75}],e=["weekly","daily","monthly","internal","team","1:1","one on one","standup","sync","meeting","call","notes","monday","tuesday","wednesday","thursday","friday","untitled","new","test"];for(let n of t){let s=r.match(n.regex);if(s&&s[1]){let i=s[1].trim();if(e.some(o=>i.toLowerCase()===o)||i.length<2)continue;let a=this.fuzzyMatchSalesforce(i);return a?{account:a.name,accountId:a.id,confidence:Math.min(n.confidence+10,100),source:"salesforce_match",evidence:`Matched "${i}" from title to Salesforce account "${a.name}"`}:{account:i,accountId:null,confidence:n.confidence,source:"title",evidence:"Extracted from meeting title pattern"}}}return{account:null,accountId:null,confidence:0,source:"title",evidence:"No pattern matched"}}detectFromFilePath(r){let t=r.match(/Accounts\/([^\/]+)\//i);if(t&&t[1]){let e=t[1].trim(),n=this.fuzzyMatchSalesforce(e);return n?{account:n.name,accountId:n.id,confidence:95,source:"salesforce_match",evidence:`File in account folder "${e}" matched to "${n.name}"`}:{account:e,accountId:null,confidence:85,source:"title",evidence:`File located in Accounts/${e} folder`}}return{account:null,accountId:null,confidence:0,source:"none",evidence:"Not in Accounts folder"}}detectFromAttendees(r){let t=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com"],e=new Set;for(let a of r){let c=a.toLowerCase().match(/@([a-z0-9.-]+)/);if(c){let l=c[1];!l.includes("eudia.com")&&!t.includes(l)&&e.add(l)}}if(e.size===0)return{account:null,accountId:null,confidence:0,source:"attendee_domain",evidence:"No external domains"};for(let a of e){let o=a.split(".")[0],c=o.charAt(0).toUpperCase()+o.slice(1),l=this.fuzzyMatchSalesforce(c);if(l)return{account:l.name,accountId:l.id,confidence:75,source:"salesforce_match",evidence:`Matched attendee domain ${a} to "${l.name}"`}}let n=Array.from(e)[0],s=n.split(".")[0];return{account:s.charAt(0).toUpperCase()+s.slice(1),accountId:null,confidence:50,source:"attendee_domain",evidence:`Guessed from external attendee domain: ${n}`}}fuzzyMatchSalesforce(r){if(!r||this.salesforceAccounts.length===0)return null;let t=r.toLowerCase().trim();for(let e of this.salesforceAccounts)if(e.name?.toLowerCase()===t)return e;for(let e of this.salesforceAccounts)if(e.name?.toLowerCase().startsWith(t))return e;for(let e of this.salesforceAccounts)if(e.name?.toLowerCase().includes(t))return e;for(let e of this.salesforceAccounts)if(t.includes(e.name?.toLowerCase()))return e;return null}suggestAccounts(r,t=10){if(!r||r.length<2)return this.salesforceAccounts.slice(0,t).map(s=>({...s,score:0}));let e=r.toLowerCase(),n=[];for(let s of this.salesforceAccounts){let i=s.name?.toLowerCase()||"",a=0;i===e?a=100:i.startsWith(e)?a=90:i.includes(e)?a=70:e.includes(i)&&(a=50),a>0&&n.push({...s,score:a})}return n.sort((s,i)=>i.score-s.score).slice(0,t)}},Be=new X,Ce=["pipeline review","pipeline call","weekly pipeline","forecast call","forecast review","deal review","opportunity review","sales review","pipeline sync","forecast sync","deal sync","pipeline update","forecast meeting"];function re(O,r){if(O){let t=O.toLowerCase();for(let e of Ce)if(t.includes(e))return{isPipelineMeeting:!0,confidence:95,evidence:`Title contains "${e}"`}}if(r&&r.length>=2){let t=["eudia.com","johnsonhana.com"];if(r.every(n=>{let s=n.toLowerCase().split("@")[1]||"";return t.some(i=>s.includes(i))})&&r.length>=3){if(O){let n=O.toLowerCase();if(["sync","review","update","weekly","team","forecast"].some(a=>n.includes(a)))return{isPipelineMeeting:!0,confidence:70,evidence:`All internal attendees (${r.length}) with team meeting signal`}}return{isPipelineMeeting:!1,confidence:40,evidence:"All internal attendees but no clear pipeline signal"}}}return{isPipelineMeeting:!1,confidence:0,evidence:"No pipeline meeting indicators found"}}function be(O,r){let t="";return(r?.account||r?.opportunities?.length)&&(t=`
ACCOUNT CONTEXT (use to inform your analysis):
${r.account?`- Account: ${r.account.name}`:""}
${r.account?.owner?`- Account Owner: ${r.account.owner}`:""}
${r.opportunities?.length?`- Open Opportunities: ${r.opportunities.map(e=>`${e.name} (${e.stage}, $${(e.acv/1e3).toFixed(0)}k)`).join("; ")}`:""}
${r.contacts?.length?`- Known Contacts: ${r.contacts.slice(0,5).map(e=>`${e.name} - ${e.title}`).join("; ")}`:""}
`),`You are a senior sales intelligence analyst for Eudia, an AI-powered legal technology company. Your role is to extract precise, actionable intelligence from sales meeting transcripts.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies. Our products help in-house legal teams work faster on contracting, compliance, and M&A due diligence. We sell to CLOs, General Counsels, VP Legal, Legal Ops Directors, and Deputy GCs.

${O?`CURRENT ACCOUNT: ${O}`:""}
${t}

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
- Action items have clear owners`}function Ae(O){return`You are a sales operations analyst producing the weekly pipeline review summary for Eudia, an AI-powered legal technology company. You are processing the transcript of an internal team pipeline review meeting.
${O?`

SALESFORCE PIPELINE DATA (current as of today):
${O}

Use this data to cross-reference and validate what was discussed. Include ACV and stage info from Salesforce where relevant.
`:""}
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
OUTPUT FORMAT \u2014 Produce the following sections in EXACTLY this order:
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

## Priority Actions

List the most urgent, time-sensitive actions discussed. Group by the target month/date (e.g., "February Revenue"). Each line should follow this format:

**[Account Name]:** [One-line action description] [@Owner Name]

Only include actions where urgency was explicitly discussed. Order by most urgent first.

## Growth & Cross-Team Updates

Capture any non-deal-specific updates discussed \u2014 outbound motions, mid-market initiatives, product stability issues, demo environment, hiring, enablement, or other cross-functional topics. Use bullet points with brief summaries and owner attribution where mentioned.

If none were discussed, omit this section entirely.

## Business Lead Deal Context

For EACH Business Lead (BL) who presented or was discussed, create a line:

**[BL Full Name]** | Q1 Commit: $[amount if mentioned] | Gut: $[amount if mentioned]

If commit/gut amounts were not explicitly stated, write "Not discussed".

## Per-BL Account Details

For EACH Business Lead, create a subsection with a markdown table. Group accounts under the BL who owns them.

### [BL Full Name] [@tag]

| Account | Status | Next Action |
|---------|--------|-------------|
| [Account Name] | [1-2 sentence status from discussion] | [Specific next step with timeline if mentioned] |

Include EVERY account discussed for this BL, even briefly mentioned ones. If an account was only briefly mentioned with no substance, write "Brief mention" in Status.

After the table, if there are important details that don't fit the table format (e.g., long context about deal structure, stakeholder dynamics, or strategy), add them as bullet points beneath the table.

## Forecast & Timeline Changes

List any explicit changes to target close dates, forecast categories, or revenue timing:

- **[Account]**: [What changed \u2014 e.g., "Pushed from Feb to Mar due to MSA redline delays"]

If no forecast changes were discussed, omit this section.

## Team Action Items

Cross-functional or team-wide action items not tied to a specific account:

- [ ] [Action] \u2014 **Owner:** [Name] \u2014 **Due:** [Date if mentioned]

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
CRITICAL RULES:
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

1. Extract EVERY account mentioned, even briefly. Do not skip any.
2. Use exact names as spoken for both accounts and people.
3. Attribute each account to the BL who owns it / presented on it.
4. For the Priority Actions section, only include deals where time urgency was explicitly discussed (this month, this quarter, need to accelerate, etc.).
5. Capture action items with CLEAR ownership \u2014 who specifically is responsible.
6. Include direct quotes for significant commitments (e.g., "verbal commit in hand", "expects end of February").
7. If a BL stated their commit or gut amount, capture it exactly.
8. Keep table cells concise \u2014 status should be 1-2 sentences max, next action should be a single clear step.
9. Distinguish between different product lines or deal types when mentioned (e.g., "Marketing Compliance pilot", "M&A expansion", "FTE engagement").
10. If the meeting discussed general topics like demo stability, growth motion, enablement, or hiring \u2014 capture these in the Growth & Cross-Team section, not mixed into account tables.`}var z=class{constructor(r){this.serverUrl=r}setServerUrl(r){this.serverUrl=r}async transcribeAndSummarize(r,t,e,n,s){try{let i=s?.meetingType==="pipeline_review",a=i?Ae(s?.pipelineContext):be(e,s),o=await(0,N.requestUrl)({url:`${this.serverUrl}/api/transcribe-and-summarize`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:r,mimeType:t,accountName:i?"Pipeline Review":e,accountId:n,meetingType:s?.meetingType||"discovery",context:s?{customerBrain:s.account?.customerBrain,opportunities:s.opportunities,contacts:s.contacts}:void 0,systemPrompt:a})});return o.json.success?{success:!0,transcript:o.json.transcript||"",sections:this.normalizeSections(o.json.sections),duration:o.json.duration||0}:{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:o.json.error||"Transcription failed"}}catch(i){console.error("Server transcription error:",i),i.response&&console.error("Server response:",i.response);let a="";try{i.response?.json?.error?a=i.response.json.error:typeof i.response=="string"&&(a=JSON.parse(i.response).error||"")}catch{}let o=a||`Transcription failed: ${i.message}`;return i.message?.includes("413")?o="Audio file too large for server. Try a shorter recording.":i.message?.includes("500")?o=a||"Server error during transcription. Please try again.":(i.message?.includes("Failed to fetch")||i.message?.includes("NetworkError"))&&(o="Could not reach transcription server. Check your internet connection."),console.error("Final error message:",o),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:o}}}parseSections(r){let t=this.getEmptySections(),e={summary:"summary",attendees:"attendees","meddicc signals":"meddiccSignals","product interest":"productInterest","pain points":"painPoints","buying triggers":"buyingTriggers","key dates":"keyDates","next steps":"nextSteps","action items":"actionItems","action items (internal)":"actionItems","deal signals":"dealSignals","risks & objections":"risksObjections","risks and objections":"risksObjections","competitive intelligence":"competitiveIntel"},n=/## ([^\n]+)\n([\s\S]*?)(?=## |$)/g,s;for(;(s=n.exec(r))!==null;){let i=s[1].trim().toLowerCase(),a=s[2].trim(),o=e[i];o&&(t[o]=a)}return t}normalizeSections(r){let t=this.getEmptySections();return r?{...t,...r}:t}async getMeetingContext(r){try{let t=await(0,N.requestUrl)({url:`${this.serverUrl}/api/meeting-context/${r}`,method:"GET",headers:{Accept:"application/json"}});return t.json.success?{success:!0,account:t.json.account,opportunities:t.json.opportunities,contacts:t.json.contacts,lastMeeting:t.json.lastMeeting}:{success:!1,error:t.json.error||"Failed to fetch context"}}catch(t){return console.error("Meeting context error:",t),{success:!1,error:t.message||"Network error"}}}async syncToSalesforce(r,t,e,n,s,i){try{let a=await(0,N.requestUrl)({url:`${this.serverUrl}/api/transcription/sync-to-salesforce`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:r,accountName:t,noteTitle:e,sections:n,transcript:s,meetingDate:i||new Date().toISOString(),syncedAt:new Date().toISOString()})});return a.json.success?{success:!0,customerBrainUpdated:a.json.customerBrainUpdated,eventCreated:a.json.eventCreated,eventId:a.json.eventId,contactsCreated:a.json.contactsCreated,tasksCreated:a.json.tasksCreated}:{success:!1,error:a.json.error||"Sync failed"}}catch(a){return console.error("Salesforce sync error:",a),{success:!1,error:a.message||"Network error"}}}getEmptySections(){return{summary:"",attendees:"",meddiccSignals:"",productInterest:"",painPoints:"",buyingTriggers:"",keyDates:"",nextSteps:"",actionItems:"",dealSignals:"",risksObjections:"",competitiveIntel:""}}async liveQueryTranscript(r,t,e){if(!t||t.trim().length<50)return{success:!1,answer:"",error:"Not enough transcript captured yet. Keep recording for a few more minutes."};try{let n=await(0,N.requestUrl)({url:`${this.serverUrl}/api/live-query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:r,transcript:t,accountName:e,systemPrompt:this.buildLiveQueryPrompt()})});return n.json.success?{success:!0,answer:n.json.answer||"No relevant information found in the transcript."}:{success:!1,answer:"",error:n.json.error||"Query failed"}}catch(n){return console.error("Live query error:",n),{success:!1,answer:"",error:n.message||"Failed to query transcript"}}}async transcribeChunk(r,t){try{let e=await(0,N.requestUrl)({url:`${this.serverUrl}/api/transcribe-chunk`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:r,mimeType:t})});return e.json.success?{success:!0,text:e.json.text||""}:{success:!1,text:"",error:e.json.error||"Chunk transcription failed"}}catch(e){return console.error("Chunk transcription error:",e),{success:!1,text:"",error:e.message||"Failed to transcribe chunk"}}}buildLiveQueryPrompt(){return`You are an AI assistant helping a salesperson during an active customer call. 
The user will ask questions about what has been discussed so far in the meeting.

Your job is to:
1. Search the transcript for relevant information
2. Answer the question concisely and accurately
3. Quote directly from the transcript when possible
4. If the information isn't in the transcript, say so clearly

IMPORTANT RULES:
- Only use information explicitly stated in the transcript
- Be concise - the user is on a live call
- If quoting someone, attribute the quote properly
- If the question can't be answered from the transcript, say "I couldn't find that in the conversation so far."

Format your response as a brief, actionable answer suitable for quick reference during a call.`}static formatSectionsForNote(r,t,e){let n="";if(r.summary&&(n+=`## TL;DR

${r.summary}

`),e?.enabled&&e?.talkTime){n+=`## Call Analytics

`;let i=e.talkTime.repPercent,a=e.talkTime.customerPercent,o=e.talkTime.isHealthyRatio?"\u2705":"\u26A0\uFE0F";n+=`**Talk Time:** Rep ${i}% / Customer ${a}% ${o}
`;let c=Math.round(i/5),l=Math.round(a/5);if(n+=`\`${"\u2588".repeat(c)}${"\u2591".repeat(20-c)}\` Rep
`,n+=`\`${"\u2588".repeat(l)}${"\u2591".repeat(20-l)}\` Customer

`,e.coaching){let d=e.coaching;if(d.totalQuestions>0){let u=Math.round(d.openQuestions/d.totalQuestions*100);n+=`**Questions:** ${d.totalQuestions} total (${d.openQuestions} open, ${d.closedQuestions} closed - ${u}% open)
`}if(d.objections&&d.objections.length>0){let u=d.objections.filter(y=>y.handled).length;n+=`**Objections:** ${d.objections.length} raised, ${u} handled
`}d.valueScore!==void 0&&(n+=`**Value Articulation:** ${d.valueScore}/10
`),d.nextStepClear!==void 0&&(n+=`**Next Step Clarity:** ${d.nextStepClear?"\u2705 Clear":"\u26A0\uFE0F Unclear"}
`),n+=`
`}}r.painPoints&&!r.painPoints.includes("None explicitly stated")&&(n+=`## Pain Points

${r.painPoints}

`),r.productInterest&&!r.productInterest.includes("None identified")&&(n+=`## Product Interest

${r.productInterest}

`),r.meddiccSignals&&(n+=`## MEDDICC Signals

${r.meddiccSignals}

`),r.nextSteps&&(n+=`## Next Steps

${r.nextSteps}

`),r.actionItems&&(n+=`## Action Items (Internal)

${r.actionItems}

`),r.keyDates&&!r.keyDates.includes("No specific dates")&&(n+=`## Key Dates

${r.keyDates}

`),r.buyingTriggers&&(n+=`## Buying Triggers

${r.buyingTriggers}

`),r.dealSignals&&(n+=`## Deal Signals

${r.dealSignals}

`),r.risksObjections&&!r.risksObjections.includes("None raised")&&(n+=`## Risks & Objections

${r.risksObjections}

`),r.competitiveIntel&&!r.competitiveIntel.includes("No competitive")&&(n+=`## Competitive Intelligence

${r.competitiveIntel}

`),r.attendees&&(n+=`## Attendees

${r.attendees}

`);let s=e?.enabled&&e?.formattedTranscript?e.formattedTranscript:t;if(s){let i=e?.enabled?"Full Transcript (Speaker-Attributed)":"Full Transcript";n+=`---

<details>
<summary><strong>${i}</strong></summary>

${s}

</details>
`}return n}static formatSectionsWithAudio(r,t,e,n){let s=this.formatSectionsForNote(r,t,n);return e&&(s+=`
---

## Recording

![[${e}]]
`),s}static formatContextForNote(r){if(!r.success)return"";let t=`## Pre-Call Context

`;if(r.account&&(t+=`**Account:** ${r.account.name}
`,t+=`**Owner:** ${r.account.owner}

`),r.opportunities&&r.opportunities.length>0){t+=`### Open Opportunities

`;for(let e of r.opportunities){let n=e.acv?`$${(e.acv/1e3).toFixed(0)}k`:"TBD";t+=`- **${e.name}** - ${e.stage} - ${n}`,e.targetSignDate&&(t+=` - Target: ${new Date(e.targetSignDate).toLocaleDateString()}`),t+=`
`}t+=`
`}if(r.contacts&&r.contacts.length>0){t+=`### Key Contacts

`;for(let e of r.contacts.slice(0,5))t+=`- **${e.name}**`,e.title&&(t+=` - ${e.title}`),t+=`
`;t+=`
`}if(r.lastMeeting&&(t+=`### Last Meeting

`,t+=`${new Date(r.lastMeeting.date).toLocaleDateString()} - ${r.lastMeeting.subject}

`),r.account?.customerBrain){let e=r.account.customerBrain.substring(0,500);e&&(t+=`### Recent Notes

`,t+=`${e}${r.account.customerBrain.length>500?"...":""}

`)}return t+=`---

`,t}async blobToBase64(r){return new Promise((t,e)=>{let n=new FileReader;n.onload=()=>{let i=n.result.split(",")[1];t(i)},n.onerror=e,n.readAsDataURL(r)})}async transcribeAudio(r,t){try{let e=await this.blobToBase64(r),n=r.type||"audio/webm",s=t?.meetingType==="pipeline_review"?{success:!0,meetingType:"pipeline_review",pipelineContext:t.pipelineContext}:void 0,i=await this.transcribeAndSummarize(e,n,t?.accountName,t?.accountId,s);return{text:i.transcript,confidence:i.success?.95:0,duration:i.duration,sections:i.sections}}catch(e){return console.error("transcribeAudio error:",e),{text:"",confidence:0,duration:0,sections:this.getEmptySections()}}}async processTranscription(r,t){if(!r||r.trim().length===0)return this.getEmptySections();try{let e=await(0,N.requestUrl)({url:`${this.serverUrl}/api/process-sections`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript:r,accountName:t?.accountName,context:t})});if(e.json?.success&&e.json?.sections){let n=e.json.sections;return{summary:n.summary||"",painPoints:n.painPoints||n.keyPoints||"",productInterest:n.productInterest||"",meddiccSignals:n.meddiccSignals||"",nextSteps:n.nextSteps||"",actionItems:n.actionItems||"",keyDates:n.keyDates||"",buyingTriggers:n.buyingTriggers||"",dealSignals:n.dealSignals||"",risksObjections:n.risksObjections||n.concerns||"",competitiveIntel:n.competitiveIntel||"",attendees:n.attendees||"",transcript:r}}return console.warn("Server process-sections returned no sections, using fallback"),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:r}}catch(e){return console.error("processTranscription server error:",e),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:r}}}};var Y=require("obsidian"),$=class O{constructor(r,t,e="America/New_York"){this.serverUrl=r,this.userEmail=t.toLowerCase(),this.timezone=e}setUserEmail(r){this.userEmail=r.toLowerCase()}setServerUrl(r){this.serverUrl=r}setTimezone(r){this.timezone=r}async getTodaysMeetings(r=!1){if(!this.userEmail)return{success:!1,date:new Date().toISOString().split("T")[0],email:"",meetingCount:0,meetings:[],error:"User email not configured"};try{let t=encodeURIComponent(this.timezone),e=r?"&forceRefresh=true":"";return(await(0,Y.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/today?timezone=${t}${e}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(t){return console.error("Failed to fetch today's meetings:",t),{success:!1,date:new Date().toISOString().split("T")[0],email:this.userEmail,meetingCount:0,meetings:[],error:t.message||"Failed to fetch calendar"}}}async getWeekMeetings(r=!1){if(!this.userEmail)return{success:!1,startDate:"",endDate:"",email:"",totalMeetings:0,byDay:{},error:"User email not configured"};try{let t=encodeURIComponent(this.timezone),e=r?"&forceRefresh=true":"";return(await(0,Y.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/week?timezone=${t}${e}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(t){return console.error("Failed to fetch week's meetings:",t),{success:!1,startDate:"",endDate:"",email:this.userEmail,totalMeetings:0,byDay:{},error:t.message||"Failed to fetch calendar"}}}async getMeetingsInRange(r,t){if(!this.userEmail)return[];try{let e=r.toISOString().split("T")[0],n=t.toISOString().split("T")[0],s=await(0,Y.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${e}&end=${n}`,method:"GET",headers:{Accept:"application/json"}});return s.json.success?s.json.meetings||[]:[]}catch(e){return console.error("Failed to fetch calendar range:",e),[]}}async getCurrentMeeting(){let r=await this.getTodaysMeetings();if(!r.success||r.meetings.length===0)return{meeting:null,isNow:!1};let t=new Date;for(let e of r.meetings){let n=O.safeParseDate(e.start),s=O.safeParseDate(e.end);if(t>=n&&t<=s)return{meeting:e,isNow:!0};let i=(n.getTime()-t.getTime())/(1e3*60);if(i>0&&i<=15)return{meeting:e,isNow:!1,minutesUntilStart:Math.ceil(i)}}return{meeting:null,isNow:!1}}async getMeetingsForAccount(r){let t=await this.getWeekMeetings();if(!t.success)return[];let e=[];Object.values(t.byDay).forEach(s=>{e.push(...s)});let n=r.toLowerCase();return e.filter(s=>s.accountName?.toLowerCase().includes(n)||s.subject.toLowerCase().includes(n)||s.attendees.some(i=>i.email.toLowerCase().includes(n.split(" ")[0])))}static formatMeetingForNote(r){let t=r.attendees.filter(e=>e.isExternal!==!1).map(e=>e.name||e.email.split("@")[0]).slice(0,5).join(", ");return{title:r.subject,attendees:t,meetingStart:r.start,accountName:r.accountName}}static getDayName(r){let t;r.length===10&&r.includes("-")?t=new Date(r+"T00:00:00"):t=new Date(r);let e=new Date;e.setHours(0,0,0,0);let n=new Date(t);n.setHours(0,0,0,0);let s=Math.round((n.getTime()-e.getTime())/(1e3*60*60*24));return s===0?"Today":s===1?"Tomorrow":t.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}static formatTime(r,t){let e=r;e&&!e.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(e)&&(e=e+"Z");let n=new Date(e);if(isNaN(n.getTime()))return r;let s={hour:"numeric",minute:"2-digit",hour12:!0};return t&&(s.timeZone=t),n.toLocaleTimeString("en-US",s)}static safeParseDate(r){if(!r)return new Date(NaN);let t=r;return!t.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(t)&&(t=t+"Z"),new Date(t)}static getMeetingDuration(r,t){let e=O.safeParseDate(r),n=O.safeParseDate(t);return Math.round((n.getTime()-e.getTime())/(1e3*60))}};var We=["ai-contracting-tech","ai-contracting-services","ai-compliance-tech","ai-compliance-services","ai-ma-tech","ai-ma-services","sigma"],je=["metrics-identified","economic-buyer-identified","decision-criteria-discussed","decision-process-discussed","pain-confirmed","champion-identified","competition-mentioned"],Ie=["progressing","stalled","at-risk","champion-engaged","early-stage"],xe=["discovery","demo","negotiation","qbr","implementation","follow-up"],Ee=`You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

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
}`,J=class{constructor(r,t){this.openaiApiKey=null;this.serverUrl=r,this.openaiApiKey=t||null}setOpenAIKey(r){this.openaiApiKey=r}setServerUrl(r){this.serverUrl=r}async extractTags(r){let t=this.buildTagContext(r);if(!t.trim())return{success:!1,tags:this.getEmptyTags(),error:"No content to analyze"};try{return await this.extractTagsViaServer(t)}catch(e){return console.warn("Server tag extraction failed, trying local:",e.message),this.openaiApiKey?await this.extractTagsLocal(t):this.extractTagsRuleBased(r)}}buildTagContext(r){let t=[];return r.summary&&t.push(`SUMMARY:
${r.summary}`),r.productInterest&&t.push(`PRODUCT INTEREST:
${r.productInterest}`),r.meddiccSignals&&t.push(`MEDDICC SIGNALS:
${r.meddiccSignals}`),r.dealSignals&&t.push(`DEAL SIGNALS:
${r.dealSignals}`),r.painPoints&&t.push(`PAIN POINTS:
${r.painPoints}`),r.attendees&&t.push(`ATTENDEES:
${r.attendees}`),t.join(`

`)}async extractTagsViaServer(r){let t=await fetch(`${this.serverUrl}/api/extract-tags`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:r,openaiApiKey:this.openaiApiKey})});if(!t.ok)throw new Error(`Server returned ${t.status}`);let e=await t.json();if(!e.success)throw new Error(e.error||"Tag extraction failed");return{success:!0,tags:this.validateAndNormalizeTags(e.tags)}}async extractTagsLocal(r){if(!this.openaiApiKey)return{success:!1,tags:this.getEmptyTags(),error:"No OpenAI API key configured"};try{let t=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:Ee},{role:"user",content:`Extract tags from this meeting content:

${r}`}],temperature:.1,response_format:{type:"json_object"}})});if(!t.ok)throw new Error(`OpenAI returned ${t.status}`);let n=(await t.json()).choices?.[0]?.message?.content;if(!n)throw new Error("No content in response");let s=JSON.parse(n);return{success:!0,tags:this.validateAndNormalizeTags(s)}}catch(t){return console.error("Local tag extraction error:",t),{success:!1,tags:this.getEmptyTags(),error:t.message||"Tag extraction failed"}}}extractTagsRuleBased(r){let t=Object.values(r).join(" ").toLowerCase(),e={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:.4};return(t.includes("contract")||t.includes("contracting"))&&(t.includes("service")?e.product_interest.push("ai-contracting-services"):e.product_interest.push("ai-contracting-tech")),t.includes("compliance")&&e.product_interest.push("ai-compliance-tech"),(t.includes("m&a")||t.includes("due diligence")||t.includes("acquisition"))&&e.product_interest.push("ai-ma-tech"),t.includes("sigma")&&e.product_interest.push("sigma"),(t.includes("metric")||t.includes("%")||t.includes("roi")||t.includes("save"))&&e.meddicc_signals.push("metrics-identified"),(t.includes("budget")||t.includes("cfo")||t.includes("economic buyer"))&&e.meddicc_signals.push("economic-buyer-identified"),(t.includes("pain")||t.includes("challenge")||t.includes("problem")||t.includes("struggle"))&&e.meddicc_signals.push("pain-confirmed"),(t.includes("champion")||t.includes("advocate")||t.includes("sponsor"))&&e.meddicc_signals.push("champion-identified"),(t.includes("competitor")||t.includes("alternative")||t.includes("vs")||t.includes("compared to"))&&e.meddicc_signals.push("competition-mentioned"),(t.includes("next step")||t.includes("follow up")||t.includes("schedule"))&&(e.deal_health="progressing"),(t.includes("concern")||t.includes("objection")||t.includes("hesitant")||t.includes("risk"))&&(e.deal_health="at-risk"),t.includes("demo")||t.includes("show you")||t.includes("demonstration")?e.meeting_type="demo":t.includes("pricing")||t.includes("negotiat")||t.includes("contract terms")?e.meeting_type="negotiation":t.includes("quarterly")||t.includes("qbr")||t.includes("review")?e.meeting_type="qbr":(t.includes("implementation")||t.includes("onboard")||t.includes("rollout"))&&(e.meeting_type="implementation"),{success:!0,tags:e}}validateAndNormalizeTags(r){let t={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:r.confidence||.8};return Array.isArray(r.product_interest)&&(t.product_interest=r.product_interest.filter(e=>We.includes(e))),Array.isArray(r.meddicc_signals)&&(t.meddicc_signals=r.meddicc_signals.filter(e=>je.includes(e))),Ie.includes(r.deal_health)&&(t.deal_health=r.deal_health),xe.includes(r.meeting_type)&&(t.meeting_type=r.meeting_type),Array.isArray(r.key_stakeholders)&&(t.key_stakeholders=r.key_stakeholders.slice(0,10)),t}getEmptyTags(){return{product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:0}}static formatTagsForFrontmatter(r){return{product_interest:r.product_interest.length>0?r.product_interest:null,meddicc_signals:r.meddicc_signals.length>0?r.meddicc_signals:null,deal_health:r.deal_health,meeting_type:r.meeting_type,key_stakeholders:r.key_stakeholders.length>0?r.key_stakeholders:null,tag_confidence:Math.round(r.confidence*100)}}static generateTagSummary(r){let t=[];return r.product_interest.length>0&&t.push(`**Products:** ${r.product_interest.join(", ")}`),r.meddicc_signals.length>0&&t.push(`**MEDDICC:** ${r.meddicc_signals.join(", ")}`),t.push(`**Deal Health:** ${r.deal_health}`),t.push(`**Meeting Type:** ${r.meeting_type}`),t.join(" | ")}};var oe=["keigan.pesenti@eudia.com","michael.ayres@eudia.com","michael.ayers@eudia.com","mike.flynn@eudia.com","michael.flynn@eudia.com","zack@eudia.com","zach@eudia.com"],ce=["omar@eudia.com","david@eudia.com","ashish@eudia.com","siddharth.saxena@eudia.com"],le={"mitchell.loquaci@eudia.com":{name:"Mitchell Loquaci",region:"US",role:"RVP Sales"},"stephen.mulholland@eudia.com":{name:"Stephen Mulholland",region:"EMEA",role:"VP Sales"},"riona.mchale@eudia.com":{name:"Riona McHale",region:"IRE_UK",role:"Head of Sales"}},de=["nikhita.godiwala@eudia.com","jon.dedych@eudia.com","farah.haddad@eudia.com"],ke=["nikhita.godiwala@eudia.com"],Te={"nikhita.godiwala@eudia.com":["jon.dedych@eudia.com","farah.haddad@eudia.com"]},k=[{id:"001Hp00003kIrQDIA0",name:"Accenture",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"accenture.com",industry:"Information Technology Services",csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrEOIA0",name:"AES",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"alesaei-aes.com",industry:"Utilities: Gas and Electric",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrCyIAK",name:"Airbnb",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"airbnb.com",industry:"Internet Services and Retailing",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFrdIAG",name:"Airship Group Inc",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"airship.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrEeIAK",name:"Amazon",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"amazon.com",industry:"Internet Services and Retailing",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000TUdXwIAL",name:"Anthropic",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"anthropic.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000wvc5aIAA",name:"AppliedAI",type:"New",isOwned:!1,hadOpportunity:!0,website:"https://www.applied-ai.com/",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000mCFsTIAW",name:"Arabic Computer Systems",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"acs.com.sa",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Hp00003kIrEyIAK",name:"Aramark Ireland",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"aramark.ie",industry:"Diversified Outsourcing Services",csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000p1hYbIAI",name:"Army Corps of Engineers",type:"New",isOwned:!1,hadOpportunity:!0,website:"https://www.usace.army.mil/",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Wj00000mCFrgIAG",name:"Aryza",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"aryza.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000Y0g8ZIAR",name:"Asana",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"asana.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mI7NaIAK",name:"Aviva Insurance",type:"New",isOwned:!1,hadOpportunity:!0,website:"aviva.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000fFuFMIA0",name:"Bank of Ireland",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"bankofireland.com",industry:"Banking",csmName:null,ownerName:"Tom Clancy"},{id:"001Hp00003kJ9pXIAS",name:"Bayer",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"bayer.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrFVIA0",name:"Best Buy",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"bestbuy.com",industry:"Specialty Retailers: Other",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000WTMCRIA5",name:"BNY Mellon",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"bny.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kIrE3IAK",name:"Cargill",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"cargill.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrE4IAK",name:"Chevron",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"chevron.com",industry:"Petroleum Refining",csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrGKIA0",name:"CHS",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"chsinc.com",industry:"Food Production",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrE5IAK",name:"Coherent",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"coherent.com",industry:"Semiconductors and Lasers",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFrkIAG",name:"Coillte",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"coillte.ie",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000mHDBoIAO",name:"Coimisiun na Mean",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"cnam.ie",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFtTIAW",name:"Coleman Legal",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"colemanlegalpllc.com",industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"001Wj00000mCFqtIAG",name:"CommScope Technologies",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"commscope.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFsHIAW",name:"Consensys",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrGeIAK",name:"Corebridge Financial",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"corebridgefinancial.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000c9oCvIAI",name:"Cox Media Group",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"cmg.com",industry:null,csmName:null,ownerName:"Justin Hills"},{id:"001Wj00000pLPAyIAO",name:"Creed McStay",type:"New",isOwned:!1,hadOpportunity:!0,website:"creedmcstay.ie",industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"001Wj00000mCFsBIAW",name:"Datalex",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"datalex.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000mCFrlIAG",name:"Davy",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"davy.ie",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000Y0jPmIAJ",name:"Delinea",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"delinea.com",industry:null,csmName:null,ownerName:"Justin Hills"},{id:"001Wj00000mCFscIAG",name:"Department of Children, Disability and Equality",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"https://www.gov.ie/en/department-of-children-disability-and-equality/",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Wj00000mCFsNIAW",name:"Department of Climate, Energy and the Environment",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"https://www.gov.ie/en/department-of-climate-energy-and-the-environment/",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Hp00003kIrE6IAK",name:"DHL",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"dhl.com",industry:"Logistics and Shipping",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000aZvt9IAC",name:"Dolby",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"dolbyblaissegee.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrDMIA0",name:"Dropbox",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"dropbox.com",industry:"Cloud Storage and Software",csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrDaIAK",name:"Duracell",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"duracell.com",industry:"Consumer goods",csmName:null,ownerName:"Justin Hills"},{id:"001Hp00003kIrE7IAK",name:"ECMS",type:"Customer - No Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"ecmsglobal-jp.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrHNIA0",name:"Ecolab",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"ecolab.com",industry:"Chemicals",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFszIAG",name:"Electricity Supply Board",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"esb.ie",industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"001Wj00000mCFsUIAW",name:"ESB NI/Electric Ireland",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"esb.ie",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Wj00000hkk0jIAA",name:"Etsy",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"etsy.com",industry:"information technology & services",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrIAIA0",name:"Fox",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"foxcorporation.com",industry:"Entertainment",csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kJ9oeIAC",name:"Fresh Del Monte",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"freshdelmonte.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kIrIJIA0",name:"GE Vernova",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"gevernova.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Hp00003kIrISIA0",name:"Gilead Sciences",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"gilead.com",industry:"Pharmaceuticals",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000mCFrcIAG",name:"Glanbia",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"glanbia.com",industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"001Wj00000mCFt1IAG",name:"Goodbody Stockbrokers",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"goodbody.ie",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Hp00003kIrE8IAK",name:"Graybar Electric",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"graybar.com",industry:"Wholesalers: Diversified",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000mCFseIAG",name:"Hayes Solicitors LLP",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"hayes-solicitors.ie",industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"001Hp00003kIrCnIAK",name:"Home Depot",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"thdroadcompanion.com",industry:"Specialty Retailers: Other",csmName:null,ownerName:"Mitch Loquaci"},{id:"001Wj00000mCFs5IAG",name:"Indeed",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"indeed.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrJ9IAK",name:"Intuit",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"intuit.com",industry:"Computer Software",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrE9IAK",name:"IQVIA",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"onekeydata.com",industry:"Health Care: Pharmacy and Other Services",csmName:null,ownerName:"Sean Boyd"},{id:"001Wj00000mCFtMIAW",name:"Kellanova",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"www.kellanova.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrJOIA0",name:"Keurig Dr Pepper",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"keurigdrpepper.com",industry:"Beverages",csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000hkk0zIAA",name:"Kingspan",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"kingspan.com",industry:"building materials",csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFsoIAG",name:"Mediolanum",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"mediolanum.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrD8IAK",name:"Medtronic",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"medtronic.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kJ9lGIAS",name:"Meta",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"meta.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrDeIAK",name:"National Grid",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"nationalgrid.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000VVJ31IAH",name:"NATO",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"https://www.nato.int/",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Hp00003kIrKmIAK",name:"Northern Trust Management Services",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"northerntrust.com",industry:"Commercial Banks",csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000cpxt0IAA",name:"Novelis",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"novelis.com",industry:null,csmName:null,ownerName:"Mitch Loquaci"},{id:"001Wj00000mCFr6IAG",name:"NTMA",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"ntma.ie",industry:null,csmName:null,ownerName:"Emer Flynn"},{id:"001Wj00000TV1WzIAL",name:"OpenAi",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"openai.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000mCFrIIAW",name:"Orsted",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"orsted.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000bzz9MIAQ",name:"Peregrine Hospitality",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"peregrinehg.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000ZDPUIIA5",name:"Perrigo Pharma",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"perrigo.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrLNIA0",name:"Petsmart",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"petsmart.com",industry:"Retailing",csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000kNp2XIAS",name:"Plusgrade",type:"New",isOwned:!1,hadOpportunity:!0,website:"plusgrade.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kKXSIIA4",name:"Pure Storage",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"purestorage.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000u0eJpIAI",name:"Re-Turn",type:"New",isOwned:!1,hadOpportunity:!0,website:"https://re-turn.ie/",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Hp00003kIrD9IAK",name:"Salesforce",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"salesforce.com",industry:"Computer Software",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mI9NmIAK",name:"Sequoia Climate Fund",type:"New",isOwned:!1,hadOpportunity:!0,website:"sequoiaclimate.org",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrMKIA0",name:"ServiceNow",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"servicenow.com",industry:"Computer Software",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFrMIAW",name:"Sisk Group",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"sisk.com",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Hp00003kIrECIA0",name:"Southwest Airlines",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"southwest.com",industry:"Airlines",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000lxbYRIAY",name:"Spark Brighter Thinking",type:"New",isOwned:!1,hadOpportunity:!0,website:"hellospark.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000c9oD6IAI",name:"Stripe",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"stripe.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000bzz9TIAQ",name:"Tailored Brands",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"tailoredbrands.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000mCFs0IAG",name:"Taoglas Limited",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"taoglas.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000iS9AJIA0",name:"TE Connectivity",type:"New",isOwned:!1,hadOpportunity:!0,website:"te.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000mCFtPIAW",name:"Teamwork.com",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"teamwork.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000PjGDaIAN",name:"The Weir Group PLC",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"global.weir",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrNBIA0",name:"The Wonderful Company",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"wonderful.com",industry:"Multicompany",csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000SFiOvIAL",name:"TikTok",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"tiktok.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000ZDXTRIA5",name:"Tinder LLC",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"tinder.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrCwIAK",name:"Toshiba US",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"toshiba.com",industry:"Electronics and IT Solutions",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000bWBkeIAG",name:"U.S. Air Force",type:"New",isOwned:!1,hadOpportunity:!0,website:"eprc.or.ug",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Wj00000bWBlEIAW",name:"Udemy",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"udemy.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFtOIAW",name:"Uisce Eireann (Irish Water)",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"water.ie",industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"001Wj00000bn8VSIAY",name:"Vista Equity Partners",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"vistaequitypartners.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000p1SuZIAU",name:"Vulcan Special Ops",type:"New",isOwned:!1,hadOpportunity:!0,website:"vulcan-v.com",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Hp00003kIrNwIAK",name:"W.W. Grainger",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"grainger.com",industry:"Wholesalers: Diversified",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000bzz9NIAQ",name:"Wealth Partners Capital Group",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"wealthpcg.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000ZLVpTIAX",name:"Wellspring Philanthropic Fund",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"wpfund.org",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrOAIA0",name:"Western Digital",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"westerndigital.com",industry:"Computers, Office Equipment",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrOLIA0",name:"World Wide Technology",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"wwt.com",industry:"Technology Hardware & Equipment",csmName:null,ownerName:"Julie Stefanich"}],Ne={US:["asad.hussain@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com","rajeev.patel@eudia.com"],EMEA:["greg.machale@eudia.com","tom.clancy@eudia.com","nicola.fratini@eudia.com","nathan.shine@eudia.com","stephen.mulholland@eudia.com"],IRE_UK:["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com","riona.mchale@eudia.com"]},Z={"mitchell.loquaci@eudia.com":["asad.hussain@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com","rajeev.patel@eudia.com"],"stephen.mulholland@eudia.com":["greg.machale@eudia.com","tom.clancy@eudia.com","conor.molloy@eudia.com","nathan.shine@eudia.com","nicola.fratini@eudia.com"],"riona.mchale@eudia.com":["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com"]},$e={"sean.boyd@eudia.com":"US","riley.stack@eudia.com":"US","rajeev.patel@eudia.com":"US"};function Pe(O){let r=O.toLowerCase().trim();return oe.includes(r)?"admin":ce.includes(r)?"exec":r in le?"sales_leader":de.includes(r)?"cs":"bl"}function Fe(O){let r=O.toLowerCase().trim();return le[r]?.region||null}function ue(O){return Ne[O]||[]}function De(O){let r=O.toLowerCase().trim();if(Z[r])return Z[r];let t=Fe(r);return t?ue(t):[]}function P(O){let r=O.toLowerCase().trim();return oe.includes(r)||ce.includes(r)}function L(O){let r=O.toLowerCase().trim();return de.includes(r)}function H(O){let r=O.toLowerCase().trim();return ke.includes(r)}function pe(O){let r=O.toLowerCase().trim();return Te[r]||[]}var E={version:"2026-02-09",lastUpdated:"2026-02-09",businessLeads:{"alex.fox@eudia.com":{email:"alex.fox@eudia.com",name:"Alex Fox",accounts:[{id:"001Wj00000mCFsT",name:"Arabic Computer Systems",hadOpportunity:!0},{id:"001Wj00000mCFsO",name:"Brown Thomas",hadOpportunity:!0},{id:"001Wj00000mCFt2",name:"Byrne Wallace Shields",hadOpportunity:!0},{id:"001Wj00000mCFsu",name:"Corrigan & Corrigan Solicitors LLP",hadOpportunity:!0},{id:"001Wj00000pzTPY",name:"Defence Forces Tribunal",hadOpportunity:!1},{id:"001Wj00000mCFsc",name:"Department of Children, Disability and Equality",hadOpportunity:!0},{id:"001Wj00000mCFsN",name:"Department of Climate, Energy and the Environment",hadOpportunity:!0},{id:"001Wj00000mCFrZ",name:"Department of Housing",hadOpportunity:!0},{id:"001Wj00000mCFsU",name:"ESB NI/Electric Ireland",hadOpportunity:!0},{id:"001Wj00000pzTPV",name:"MW Keller",hadOpportunity:!1},{id:"001Wj00000pzTPX",name:"Murphy's Ice Cream",hadOpportunity:!1},{id:"001Wj00000mCFrM",name:"Sisk Group",hadOpportunity:!0}]},"ananth.cherukupally@eudia.com":{email:"ananth.cherukupally@eudia.com",name:"Ananth Cherukupally",accounts:[{id:"001Wj00000PfssX",name:"AGC Partners",hadOpportunity:!1},{id:"001Wj00000ahBZt",name:"AMETEK",hadOpportunity:!1},{id:"001Wj00000ahBZr",name:"Accel-KKR",hadOpportunity:!1},{id:"001Wj00000bwVu4",name:"Addtech",hadOpportunity:!1},{id:"001Wj00000YNV7Z",name:"Advent",hadOpportunity:!0},{id:"001Wj00000VZScK",name:"Affinity Consulting Group",hadOpportunity:!1},{id:"001Wj00000lyFyt",name:"Albacore Capital Group",hadOpportunity:!0},{id:"001Wj00000nlL88",name:"Alder",hadOpportunity:!0},{id:"001Wj00000XumF6",name:"Alpine Investors",hadOpportunity:!0},{id:"001Wj00000QTbLP",name:"Alvarez AI Advisors",hadOpportunity:!1},{id:"001Wj00000ahFCJ",name:"American Pacific Group",hadOpportunity:!1},{id:"001Wj00000ah6dg",name:"Angeles Equity Partners",hadOpportunity:!1},{id:"001Hp00003kIrEu",name:"Apollo Global Management",hadOpportunity:!0},{id:"001Wj00000cl5pq",name:"Arizona MBDA Business Center",hadOpportunity:!1},{id:"001Wj00000nlRev",name:"Attack Capital",hadOpportunity:!0},{id:"001Wj00000ahFBx",name:"Audax Group",hadOpportunity:!1},{id:"001Wj00000YhZAE",name:"Beacon Software",hadOpportunity:!0},{id:"001Wj00000cfg0c",name:"Beekers Capital",hadOpportunity:!1},{id:"001Wj00000bwVsk",name:"Bertram Capital",hadOpportunity:!1},{id:"001Wj00000ahBa0",name:"Bessemer Venture Partners",hadOpportunity:!1},{id:"001Wj00000lzDWj",name:"BlueEarth Capital",hadOpportunity:!0},{id:"001Wj00000ah6dZ",name:"Brentwood Associates",hadOpportunity:!1},{id:"001Wj00000ah6dL",name:"Brown & Brown",hadOpportunity:!1},{id:"001Hp00003kIrCh",name:"CBRE Group",hadOpportunity:!0},{id:"001Wj00000cejJz",name:"CVC",hadOpportunity:!0},{id:"001Wj00000ahFCV",name:"Caltius Equity Partners",hadOpportunity:!1},{id:"001Wj00000ahFBz",name:"Capstone Partners",hadOpportunity:!1},{id:"001Wj00000nlB0g",name:"Capvest",hadOpportunity:!0},{id:"001Hp00003kIrFy",name:"Cardinal Health",hadOpportunity:!0},{id:"001Hp00003kIrDg",name:"Carlyle",hadOpportunity:!0},{id:"001Wj00000PbIZ8",name:"Cascadia Capital",hadOpportunity:!1},{id:"001Wj00000ah6dW",name:"Catterton",hadOpportunity:!1},{id:"001Wj00000ahFC7",name:"Century Park Capital Partners",hadOpportunity:!1},{id:"001Wj00000Rjuhj",name:"Citadel",hadOpportunity:!0},{id:"001Wj00000ah6dn",name:"Clearlake Capital Group",hadOpportunity:!1},{id:"001Wj00000ah6dY",name:"Cognex Corporation",hadOpportunity:!1},{id:"001Wj00000ah6do",name:"Comvest Partners",hadOpportunity:!1},{id:"001Wj00000ah6dv",name:"Constellation Software",hadOpportunity:!0},{id:"001Wj00000ahFCI",name:"Cortec Group",hadOpportunity:!1},{id:"001Wj00000ahBa4",name:"Crosslink Capital",hadOpportunity:!1},{id:"001Wj00000ahFCR",name:"DCA Partners",hadOpportunity:!1},{id:"001Wj00000ah6dc",name:"DFO Management",hadOpportunity:!1},{id:"001Wj00000W8fEu",name:"Davis Polk",hadOpportunity:!1},{id:"001Wj00000crdDR",name:"Delcor",hadOpportunity:!0},{id:"001Wj00000ahFCM",name:"Diploma",hadOpportunity:!1},{id:"001Wj00000kcANH",name:"Discord",hadOpportunity:!0},{id:"001Wj00000ahFCU",name:"Doughty Hanson & Co",hadOpportunity:!1},{id:"001Wj00000ah6dd",name:"Edgewater Capital Partners",hadOpportunity:!1},{id:"001Wj00000Y64qh",name:"Emigrant Bank",hadOpportunity:!0},{id:"001Wj00000ah6dM",name:"Encore Consumer Capital",hadOpportunity:!1},{id:"001Wj00000ahFCL",name:"Endeavour Capital",hadOpportunity:!1},{id:"001Wj00000ah6di",name:"FFL Partners",hadOpportunity:!1},{id:"001Wj00000ah6dV",name:"Falfurrias Capital Partners",hadOpportunity:!1},{id:"001Wj00000ah6dU",name:"FirstService Corporation",hadOpportunity:!1},{id:"001Wj00000nlLZU",name:"Five Capital",hadOpportunity:!0},{id:"001Wj00000ahFCK",name:"Flexpoint Ford",hadOpportunity:!1},{id:"001Wj00000QkjJL",name:"Floodgate",hadOpportunity:!1},{id:"001Wj00000bwVu6",name:"Fortive Corporation",hadOpportunity:!1},{id:"001Wj00000ahFCa",name:"Foundry Group",hadOpportunity:!1},{id:"001Hp00003kIrID",name:"Freeport-McMoRan",hadOpportunity:!0},{id:"001Wj00000bwVuN",name:"Fremont Partners",hadOpportunity:!1},{id:"001Wj00000ahFCO",name:"Frontenac Company",hadOpportunity:!1},{id:"001Hp00003kIrII",name:"GE Healthcare",hadOpportunity:!0},{id:"001Hp00003kIrIJ",name:"GE Vernova",hadOpportunity:!0},{id:"001Wj00000lz2Jb",name:"GTIS Partners",hadOpportunity:!0},{id:"001Wj00000ah6dh",name:"Gallant Capital Partners",hadOpportunity:!1},{id:"001Hp00003kJ9oP",name:"General Catalyst",hadOpportunity:!0},{id:"001Wj00000ah6dr",name:"Genstar Capital",hadOpportunity:!1},{id:"001Hp00003kIrIT",name:"GlaxoSmithKline",hadOpportunity:!0},{id:"001Wj00000ahFCb",name:"Goldner Hawn Johnson & Morrison",hadOpportunity:!1},{id:"001Wj00000ah6du",name:"Great Point Partners",hadOpportunity:!1},{id:"001Wj00000ahBZx",name:"Greenoaks Capital",hadOpportunity:!0},{id:"001Wj00000ahFCB",name:"Greenspring Associates",hadOpportunity:!1},{id:"001Wj00000ahFCX",name:"Group 206",hadOpportunity:!1},{id:"001Wj00000ahBZz",name:"Gryphon Investors",hadOpportunity:!1},{id:"001Wj00000ah6dT",name:"HEICO Corporation",hadOpportunity:!1},{id:"001Wj00000cy4m1",name:"HG",hadOpportunity:!0},{id:"001Wj00000ahBZn",name:"HGGC",hadOpportunity:!1},{id:"001Wj00000ah6df",name:"Halma",hadOpportunity:!1},{id:"001Wj00000ah48X",name:"Harvest Partners",hadOpportunity:!1},{id:"001Wj00000ahFCS",name:"HealthpointCapital",hadOpportunity:!1},{id:"001Wj00000lzDtJ",name:"Heidrick & Struggles",hadOpportunity:!0},{id:"001Hp00003kIrIl",name:"Hellman & Friedman",hadOpportunity:!0},{id:"001Wj00000ahFCW",name:"Highview Capital",hadOpportunity:!1},{id:"001Wj00000Pg7rW",name:"Houlihan Lokey",hadOpportunity:!1},{id:"001Wj00000ahFCH",name:"Housatonic Partners",hadOpportunity:!1},{id:"001Wj00000ahFC9",name:"Huron Capital",hadOpportunity:!1},{id:"001Wj00000ahFC6",name:"Indutrade",hadOpportunity:!1},{id:"001Wj00000ahBa5",name:"Insight Partners",hadOpportunity:!1},{id:"001Wj00000nlbr9",name:"Intercorp",hadOpportunity:!0},{id:"001Wj00000ahFCA",name:"Irving Place Capital",hadOpportunity:!1},{id:"001Wj00000bwVtt",name:"Jack Henry & Associates",hadOpportunity:!1},{id:"001Wj00000Pg9oT",name:"Jackim Woods & Co.",hadOpportunity:!1},{id:"001Wj00000ah6de",name:"Jonas Software",hadOpportunity:!1},{id:"001Hp00003kIrJU",name:"KKR",hadOpportunity:!1},{id:"001Wj00000ahBa1",name:"Kayne Anderson Capital Advisors",hadOpportunity:!1},{id:"001Wj00000m5kud",name:"Kelly Services",hadOpportunity:!0},{id:"001Wj00000ahBZp",name:"Keysight Technologies",hadOpportunity:!1},{id:"001Wj00000ahFC8",name:"L Squared Capital Partners",hadOpportunity:!1},{id:"001Wj00000QGTNV",name:"LCS Forensic Accounting & Advisory",hadOpportunity:!1},{id:"001Wj00000ahFCD",name:"Lagercrantz Group",hadOpportunity:!1},{id:"001Wj00000ahBZs",name:"Levine Leichtman Capital Partners",hadOpportunity:!1},{id:"001Wj00000Z6zhP",name:"Liberty Mutual Insurance",hadOpportunity:!0},{id:"001Wj00000ahFCC",name:"Lifco",hadOpportunity:!1},{id:"001Wj00000ahFCP",name:"LightBay Capital",hadOpportunity:!1},{id:"001Wj00000iYEVS",name:"Lightstone Group",hadOpportunity:!0},{id:"001Wj00000ahFCT",name:"Lincolnshire Management",hadOpportunity:!1},{id:"001Wj00000c8ynV",name:"Littelfuse",hadOpportunity:!0},{id:"001Wj00000W95CX",name:"Long Lake",hadOpportunity:!0},{id:"001Wj00000ahBa3",name:"Luminate Capital",hadOpportunity:!1},{id:"001Wj00000ahFC1",name:"Lumine Group",hadOpportunity:!1},{id:"001Wj00000bwVuH",name:"Markel Corporation",hadOpportunity:!1},{id:"001Wj00000Pfppo",name:"Marks Baughan",hadOpportunity:!1},{id:"001Wj00000ah6dm",name:"Martis Capital",hadOpportunity:!1},{id:"001Hp00003kKrRR",name:"Marvell Technology",hadOpportunity:!0},{id:"001Wj00000PbJ2B",name:"Meridian Capital",hadOpportunity:!1},{id:"001Wj00000ahFC3",name:"Nexa Equity",hadOpportunity:!1},{id:"001Wj00000ahBZv",name:"Norwest Venture Partners",hadOpportunity:!1},{id:"001Wj00000ah6dp",name:"Novanta",hadOpportunity:!1},{id:"001Wj00000ah6dQ",name:"Pacific Avenue Capital Partners",hadOpportunity:!1},{id:"001Wj00000ah6dt",name:"Palladium Equity Partners",hadOpportunity:!1},{id:"001Wj00000iXNFs",name:"Palomar Holdings",hadOpportunity:!0},{id:"001Wj00000ahFCG",name:"Pamlico Capital",hadOpportunity:!1},{id:"001Wj00000W3R2u",name:"Paradigm",hadOpportunity:!1},{id:"001Wj00000bWBlQ",name:"Pegasystems",hadOpportunity:!0},{id:"001Wj00000YcPTM",name:"Percheron Capital",hadOpportunity:!0},{id:"001Wj00000bzz9M",name:"Peregrine Hospitality",hadOpportunity:!0},{id:"001Wj00000VZkJ3",name:"PerformLaw",hadOpportunity:!1},{id:"001Hp00003ljCJ8",name:"Petco",hadOpportunity:!0},{id:"001Wj00000ahFBy",name:"Pharos Capital Group",hadOpportunity:!1},{id:"001Wj00000bwVuF",name:"Pool Corporation",hadOpportunity:!1},{id:"001Wj00000ah48Y",name:"Pritzker Private Capital",hadOpportunity:!1},{id:"001Wj00000mRFNX",name:"Publicis Group",hadOpportunity:!0},{id:"001Hp00003kKXSI",name:"Pure Storage",hadOpportunity:!0},{id:"001Wj00000ah6dS",name:"Quad-C Management",hadOpportunity:!1},{id:"001Hp00003kIrLo",name:"Raymond James Financial",hadOpportunity:!1},{id:"001Wj00000ah6ds",name:"Resilience Capital Partners",hadOpportunity:!1},{id:"001Wj00000m0jBC",name:"RingCentral",hadOpportunity:!0},{id:"001Wj00000ahFC4",name:"Riverside Acceleration Capital",hadOpportunity:!1},{id:"001Wj00000ah48a",name:"Riverside Partners",hadOpportunity:!1},{id:"001Wj00000ahFCE",name:"Rustic Canyon Partners",hadOpportunity:!1},{id:"001Wj00000ah6dR",name:"Sageview Capital",hadOpportunity:!1},{id:"001Wj00000ahFCN",name:"Salt Creek Capital",hadOpportunity:!1},{id:"001Wj00000lzlLX",name:"Sandbox",hadOpportunity:!0},{id:"001Wj00000nldrK",name:"Scout Motors",hadOpportunity:!0},{id:"001Wj00000ah48Z",name:"Searchlight Capital",hadOpportunity:!1},{id:"001Wj00000ahBZq",name:"Serent Capital",hadOpportunity:!1},{id:"001Hp00003kIrEB",name:"Silver Lake",hadOpportunity:!0},{id:"001Wj00000ahBZo",name:"Siris Capital Group",hadOpportunity:!1},{id:"001Wj00000ah6db",name:"Solace Capital Partners",hadOpportunity:!1},{id:"001Wj00000ahFCF",name:"Solis Capital Partners",hadOpportunity:!1},{id:"001Wj00000VkQyY",name:"Sonja Cotton & Associates",hadOpportunity:!1},{id:"001Wj00000ah6dO",name:"Sorenson Capital",hadOpportunity:!1},{id:"001Wj00000lygkU",name:"SoundPoint Capital",hadOpportunity:!0},{id:"001Wj00000lxbYR",name:"Spark Brighter Thinking",hadOpportunity:!0},{id:"001Wj00000ah6dj",name:"Spectrum Equity",hadOpportunity:!0},{id:"001Wj00000lusqi",name:"Symphony Technology Partners",hadOpportunity:!0},{id:"001Wj00000tOAoE",name:"TA Associates",hadOpportunity:!0},{id:"001Hp00003kKrU1",name:"TPG",hadOpportunity:!0},{id:"001Wj00000dNhDy",name:"TSS Europe",hadOpportunity:!0},{id:"001Wj00000QTbzh",name:"Taytrom",hadOpportunity:!1},{id:"001Wj00000ahFCY",name:"The Courtney Group",hadOpportunity:!1},{id:"001Wj00000ahFCZ",name:"The Riverside Company",hadOpportunity:!1},{id:"001Wj00000cgCF8",name:"Titan AI",hadOpportunity:!1},{id:"001Wj00000nlOIv",name:"Together Fund",hadOpportunity:!0},{id:"001Wj00000ah6dX",name:"Topicus.com",hadOpportunity:!1},{id:"001Hp00003kIrNO",name:"TransDigm Group",hadOpportunity:!1},{id:"001Wj00000ah6dN",name:"Transom Capital Group",hadOpportunity:!1},{id:"001Wj00000ahBZu",name:"Trimble Inc.",hadOpportunity:!1},{id:"001Wj00000ah6dl",name:"Trivest Partners",hadOpportunity:!1},{id:"001Wj00000dXDo3",name:"Tucker's Farm",hadOpportunity:!0},{id:"001Wj00000ah6da",name:"Tyler Technologies",hadOpportunity:!1},{id:"001Wj00000Y6VMa",name:"UBS",hadOpportunity:!0},{id:"001Wj00000ahFCQ",name:"Vance Street Capital",hadOpportunity:!1},{id:"001Wj00000bn8VS",name:"Vista Equity Partners",hadOpportunity:!0},{id:"001Wj00000ahFC0",name:"Vitec Software",hadOpportunity:!1},{id:"001Wj00000ah6dP",name:"Volaris Group",hadOpportunity:!1},{id:"001Hp00003kIrO2",name:"Watsco",hadOpportunity:!1},{id:"001Wj00000ahBZw",name:"West Lane Capital Partners",hadOpportunity:!1},{id:"001Wj00000ahBZy",name:"Zebra Technologies",hadOpportunity:!1}]},"asad.hussain@eudia.com":{email:"asad.hussain@eudia.com",name:"Asad Hussain",accounts:[{id:"001Hp00003kIrFC",name:"AT&T",hadOpportunity:!0},{id:"001Hp00003kIrCy",name:"Airbnb",hadOpportunity:!0},{id:"001Hp00003kIrEe",name:"Amazon",hadOpportunity:!0},{id:"001Wj00000WElj9",name:"American Arbitration Association",hadOpportunity:!0},{id:"001Hp00003kIrCz",name:"American Express",hadOpportunity:!0},{id:"001Wj00000hewsX",name:"Amkor",hadOpportunity:!0},{id:"001Wj00000WZ05x",name:"Applied Intuition",hadOpportunity:!0},{id:"001Hp00003kIrEx",name:"Applied Materials",hadOpportunity:!1},{id:"001Hp00003kIrEz",name:"Archer Daniels Midland",hadOpportunity:!0},{id:"001Wj00000Y0g8Z",name:"Asana",hadOpportunity:!0},{id:"001Wj00000gGYAQ",name:"Autodesk",hadOpportunity:!0},{id:"001Wj00000c0wRA",name:"Away",hadOpportunity:!0},{id:"001Wj00000WTMCR",name:"BNY Mellon",hadOpportunity:!0},{id:"001Wj00000c6DHy",name:"BetterUp",hadOpportunity:!0},{id:"001Hp00003kIrFY",name:"BlackRock",hadOpportunity:!1},{id:"001Hp00003kIrFe",name:"Booz Allen Hamilton",hadOpportunity:!1},{id:"001Wj00000XhcVG",name:"Box.com",hadOpportunity:!0},{id:"001Wj00000bWBla",name:"CNA Insurance",hadOpportunity:!0},{id:"001Wj00000XiYqz",name:"Canva",hadOpportunity:!0},{id:"001Hp00003kIrG0",name:"Carrier Global",hadOpportunity:!1},{id:"001Wj00000mosEX",name:"Carta",hadOpportunity:!0},{id:"001Wj00000ah6dk",name:"Charlesbank Capital Partners",hadOpportunity:!0},{id:"001Wj00000XiXjd",name:"Circle",hadOpportunity:!0},{id:"001Hp00003kIrE5",name:"Coherent",hadOpportunity:!0},{id:"001Hp00003kIrGf",name:"Corning",hadOpportunity:!0},{id:"001Wj00000fgfGu",name:"Cyware",hadOpportunity:!0},{id:"001Hp00003kIrE6",name:"DHL",hadOpportunity:!0},{id:"001Wj00000duIWr",name:"Deepmind",hadOpportunity:!0},{id:"001Hp00003kIrGy",name:"Dell Technologies",hadOpportunity:!1},{id:"001Hp00003kIrGz",name:"Deloitte",hadOpportunity:!0},{id:"001Wj00000W8ZKl",name:"Docusign",hadOpportunity:!0},{id:"001Hp00003kIrHN",name:"Ecolab",hadOpportunity:!0},{id:"001Wj00000dheQN",name:"Emory",hadOpportunity:!0},{id:"001Wj00000bWIxP",name:"Ericsson",hadOpportunity:!0},{id:"001Hp00003kIrHs",name:"FedEx",hadOpportunity:!1},{id:"001Wj00000lMcwT",name:"Flo Health",hadOpportunity:!0},{id:"001Hp00003kIrI3",name:"Fluor",hadOpportunity:!0},{id:"001Hp00003kIrIA",name:"Fox",hadOpportunity:!0},{id:"001Hp00003kJ9oe",name:"Fresh Del Monte",hadOpportunity:!0},{id:"001Wj00000Y6HEY",name:"G-III Apparel Group",hadOpportunity:!0},{id:"001Wj00000kNTF0",name:"GLG",hadOpportunity:!0},{id:"001Hp00003kIrIK",name:"Geico",hadOpportunity:!0},{id:"001Hp00003lhVuD",name:"General Atlantic",hadOpportunity:!0},{id:"001Wj00000dw1gb",name:"Glean",hadOpportunity:!0},{id:"001Hp00003kJ9l1",name:"Google",hadOpportunity:!0},{id:"001Wj00000oqVXg",name:"Goosehead Insurance",hadOpportunity:!0},{id:"001Wj00000tuXZb",name:"Gopuff",hadOpportunity:!0},{id:"001Hp00003kIrDP",name:"HP",hadOpportunity:!0},{id:"001Hp00003kIrIt",name:"HSBC",hadOpportunity:!0},{id:"001Hp00003kL3Mo",name:"Honeywell",hadOpportunity:!0},{id:"001Hp00003kIrIy",name:"Huntsman",hadOpportunity:!0},{id:"001Wj00000d7IL8",name:"IAC",hadOpportunity:!0},{id:"001Hp00003kIrJ0",name:"IBM",hadOpportunity:!0},{id:"001Wj00000hdoLx",name:"Insight Enterprises Inc.",hadOpportunity:!0},{id:"001Wj00000gH7ua",name:"JFrog",hadOpportunity:!0},{id:"001Wj00000tNwur",name:"Janus Henderson",hadOpportunity:!1},{id:"001Wj00000iC14X",name:"Klarna",hadOpportunity:!0},{id:"001Wj00000wSLUl",name:"LexisNexis",hadOpportunity:!1},{id:"001Wj00000mCFtJ",name:"LinkedIn",hadOpportunity:!0},{id:"001Hp00003kIrJu",name:"Lockheed Martin",hadOpportunity:!0},{id:"001Hp00003kIrKC",name:"Mass Mutual Life Insurance",hadOpportunity:!0},{id:"001Hp00003kIrKO",name:"Microsoft",hadOpportunity:!0},{id:"001Wj00000lyDQk",name:"MidOcean Partners",hadOpportunity:!0},{id:"001Hp00003kIrKT",name:"Morgan Stanley",hadOpportunity:!0},{id:"001Wj00000bWIxq",name:"Motiva",hadOpportunity:!0},{id:"001Hp00003kIrKr",name:"NVIDIA",hadOpportunity:!1},{id:"001Hp00003kIrCx",name:"Novartis",hadOpportunity:!0},{id:"001Wj00000hVTTB",name:"One Oncology",hadOpportunity:!0},{id:"001Wj00000Y6VVW",name:"Oscar Health",hadOpportunity:!0},{id:"001Wj00000eLHLO",name:"Palo Alto Networks",hadOpportunity:!1},{id:"001Wj00000kNp2X",name:"Plusgrade",hadOpportunity:!0},{id:"001Wj00000YoLqW",name:"Procore Technologies",hadOpportunity:!0},{id:"001Wj00000lXD0F",name:"RBI (Burger King)",hadOpportunity:!1},{id:"001Hp00003kIrLx",name:"Republic Services",hadOpportunity:!1},{id:"001Wj00000bWJ0J",name:"SAP",hadOpportunity:!1},{id:"001Hp00003kIrD9",name:"Salesforce",hadOpportunity:!0},{id:"001Wj00000fPr6N",name:"Santander",hadOpportunity:!0},{id:"001Hp00003kIrMK",name:"ServiceNow",hadOpportunity:!0},{id:"001Wj00000eL760",name:"Shell",hadOpportunity:!1},{id:"001Wj00000kNmsg",name:"Skims",hadOpportunity:!0},{id:"001Wj00000aCGR3",name:"Solventum",hadOpportunity:!0},{id:"001Hp00003kIrEC",name:"Southwest Airlines",hadOpportunity:!0},{id:"001Hp00003kIrMc",name:"SpaceX",hadOpportunity:!1},{id:"001Wj00000SdYHq",name:"Spotify",hadOpportunity:!0},{id:"001Hp00003kIrDl",name:"StoneX Group",hadOpportunity:!0},{id:"001Wj00000WYtsU",name:"Tenable",hadOpportunity:!0},{id:"001Hp00003kIrN5",name:"Tesla",hadOpportunity:!1},{id:"001Wj00000c0wRK",name:"The Initial Group",hadOpportunity:!0},{id:"001Wj00000bWBlX",name:"Thomson Reuters Ventures",hadOpportunity:!1},{id:"001Hp00003kIrCs",name:"UPS",hadOpportunity:!0},{id:"001Wj00000tuRNo",name:"Virtusa",hadOpportunity:!0},{id:"001Hp00003kIrNw",name:"W.W. Grainger",hadOpportunity:!0},{id:"001Hp00003kIrNy",name:"Walmart",hadOpportunity:!0},{id:"001Wj00000Y64qk",name:"Warburg Pincus LLC",hadOpportunity:!1},{id:"001Wj00000bzz9N",name:"Wealth Partners Capital Group",hadOpportunity:!0},{id:"001Wj00000tuolf",name:"Wynn Las Vegas",hadOpportunity:!0},{id:"001Wj00000bzz9Q",name:"Youtube",hadOpportunity:!0},{id:"001Wj00000uzs1f",name:"Zero RFI",hadOpportunity:!0}]},"conor.molloy@eudia.com":{email:"conor.molloy@eudia.com",name:"Conor Molloy",accounts:[{id:"001Wj00000mCFrf",name:"APEX Group",hadOpportunity:!1},{id:"001Wj00000xxtg6",name:"ASR Nederland",hadOpportunity:!1},{id:"001Hp00003kIrQD",name:"Accenture",hadOpportunity:!0},{id:"001Wj00000qLixn",name:"Al Dahra Group Llc",hadOpportunity:!0},{id:"001Wj00000syNyn",name:"Alliance Healthcare",hadOpportunity:!1},{id:"001Hp00003kIrEy",name:"Aramark Ireland",hadOpportunity:!0},{id:"001Wj00000tWwXk",name:"Aramex",hadOpportunity:!1},{id:"001Wj00000xyXlY",name:"Arkema",hadOpportunity:!1},{id:"001Wj00000mCFrg",name:"Aryza",hadOpportunity:!0},{id:"001Wj00000xz3F7",name:"Aurubis",hadOpportunity:!1},{id:"001Wj00000bWIzJ",name:"BAE Systems, Inc.",hadOpportunity:!1},{id:"001Wj00000fFhea",name:"BBC News",hadOpportunity:!1},{id:"001Wj00000Y6Vk4",name:"BBC Studios",hadOpportunity:!1},{id:"001Wj00000xypIc",name:"BMW Group",hadOpportunity:!1},{id:"001Wj00000eLPna",name:"BP",hadOpportunity:!1},{id:"001Wj00000tsfWO",name:"Baker Tilly",hadOpportunity:!0},{id:"001Wj00000tWwXr",name:"Bestseller",hadOpportunity:!1},{id:"001Wj00000xz3LZ",name:"Bouygues",hadOpportunity:!1},{id:"001Wj00000xz3Td",name:"British Broadcasting Corporation",hadOpportunity:!1},{id:"001Wj00000xyc3f",name:"Carrefour",hadOpportunity:!1},{id:"001Wj00000tWwXy",name:"Citco",hadOpportunity:!1},{id:"001Wj00000mCFrk",name:"Coillte",hadOpportunity:!0},{id:"001Wj00000mCFsH",name:"Consensys",hadOpportunity:!0},{id:"001Wj00000xxS3B",name:"Currys",hadOpportunity:!1},{id:"001Wj00000Y6Vgo",name:"Cushman & Wakefield",hadOpportunity:!1},{id:"001Wj00000tWwY2",name:"DB Schenker",hadOpportunity:!1},{id:"001Wj00000xxpXf",name:"DZ Bank",hadOpportunity:!1},{id:"001Wj00000bWIzG",name:"DZB BANK GmbH",hadOpportunity:!1},{id:"001Wj00000Y6VMZ",name:"Danone",hadOpportunity:!1},{id:"001Wj00000xyCKX",name:"Deutsche Bahn",hadOpportunity:!1},{id:"001Wj00000tWwY3",name:"Dyson",hadOpportunity:!1},{id:"001Wj00000xy3Iu",name:"E.ON",hadOpportunity:!1},{id:"001Wj00000xz3Jx",name:"Electricite de France",hadOpportunity:!1},{id:"001Hp00003kIrHR",name:"Electronic Arts",hadOpportunity:!1},{id:"001Wj00000xz373",name:"Energie Baden-Wurttemberg",hadOpportunity:!1},{id:"001Wj00000xwnL0",name:"Evonik Industries",hadOpportunity:!1},{id:"001Wj00000xyr5v",name:"FMS Wertmanagement",hadOpportunity:!1},{id:"001Wj00000Y6DDb",name:"Federal Reserve Bank of New York",hadOpportunity:!1},{id:"001Wj00000tWwYf",name:"Fenergo",hadOpportunity:!1},{id:"001Wj00000xxuFZ",name:"Finatis",hadOpportunity:!1},{id:"001Wj00000xz3QP",name:"Groupe SEB",hadOpportunity:!1},{id:"001Wj00000syXLZ",name:"Guerbet",hadOpportunity:!1},{id:"001Wj00000xyP83",name:"Heraeus Holding",hadOpportunity:!1},{id:"001Wj00000xxuVh",name:"Hermes International",hadOpportunity:!1},{id:"001Wj00000xz32D",name:"Hornbach Group",hadOpportunity:!1},{id:"001Wj00000hkk0u",name:"ICON",hadOpportunity:!1},{id:"001Wj00000mCFr2",name:"ICON Clinical Research",hadOpportunity:!0},{id:"001Wj00000Y64qd",name:"ION",hadOpportunity:!0},{id:"001Wj00000xz3AH",name:"Ingka Group",hadOpportunity:!1},{id:"001Wj00000tWwXa",name:"Jacobs Engineering Group",hadOpportunity:!1},{id:"001Wj00000xz30c",name:"Johnson Matthey",hadOpportunity:!1},{id:"001Wj00000mCFtM",name:"Kellanova",hadOpportunity:!0},{id:"001Wj00000xz3S1",name:"Klockner",hadOpportunity:!1},{id:"001Wj00000tWwYC",name:"Kuehne & Nagel",hadOpportunity:!1},{id:"001Wj00000bWIym",name:"LSEG",hadOpportunity:!1},{id:"001Wj00000Y6VZE",name:"Linde",hadOpportunity:!1},{id:"001Wj00000xy1Lu",name:"M&G",hadOpportunity:!1},{id:"001Wj00000xz0h4",name:"Metinvest",hadOpportunity:!1},{id:"001Wj00000xyNse",name:"NN Group",hadOpportunity:!1},{id:"001Wj00000xyECc",name:"Network Rail",hadOpportunity:!1},{id:"001Wj00000xyudG",name:"Nordex",hadOpportunity:!1},{id:"001Wj00000tWwXc",name:"Ocorian",hadOpportunity:!1},{id:"001Wj00000fFW1m",name:"Okta",hadOpportunity:!1},{id:"001Wj00000mCFrI",name:"Orsted",hadOpportunity:!0},{id:"001Wj00000tWwYK",name:"PGIM",hadOpportunity:!1},{id:"001Wj00000xz38f",name:"PPF Group",hadOpportunity:!1},{id:"001Wj00000tWwYi",name:"Penneys",hadOpportunity:!1},{id:"001Wj00000tWwYL",name:"Philips Electronics",hadOpportunity:!1},{id:"001Wj00000tWwYP",name:"Reddit",hadOpportunity:!1},{id:"001Wj00000mCFrU",name:"Riot Games",hadOpportunity:!0},{id:"001Wj00000xyD0Q",name:"Rolls-Royce",hadOpportunity:!1},{id:"001Wj00000xxIqC",name:"Royal Ahold Delhaize",hadOpportunity:!1},{id:"001Wj00000xz3Gj",name:"Rubis",hadOpportunity:!1},{id:"001Wj00000xyrh0",name:"Salzgitter",hadOpportunity:!1},{id:"001Wj00000bWBm6",name:"Schneider Electric",hadOpportunity:!1},{id:"001Wj00000mI9Nm",name:"Sequoia Climate Fund",hadOpportunity:!1},{id:"001Wj00000fCp7J",name:"Siemens",hadOpportunity:!1},{id:"001Wj00000tWwYR",name:"Smurfit Kappa",hadOpportunity:!1},{id:"001Wj00000tWwYS",name:"Stewart",hadOpportunity:!1},{id:"001Wj00000syavy",name:"Symrise AG",hadOpportunity:!1},{id:"001Wj00000mCFs0",name:"Taoglas Limited",hadOpportunity:!0},{id:"001Wj00000mCFtP",name:"Teamwork.com",hadOpportunity:!0},{id:"001Wj00000sxsOq",name:"TechnipFMC",hadOpportunity:!1},{id:"001Wj00000tWwXe",name:"Teneo",hadOpportunity:!1},{id:"001Wj00000Y64qc",name:"Thales",hadOpportunity:!1},{id:"001Hp00003kIrNJ",name:"Toyota",hadOpportunity:!0},{id:"001Wj00000mCFqw",name:"Ulster Bank",hadOpportunity:!1},{id:"001Wj00000xxDSI",name:"Unedic",hadOpportunity:!1},{id:"001Wj00000mCFs2",name:"Vantage Towers",hadOpportunity:!0},{id:"001Hp00003kIrNs",name:"Vistra",hadOpportunity:!0},{id:"001Wj00000Y6VZD",name:"WPP",hadOpportunity:!0},{id:"001Wj00000ZLVpT",name:"Wellspring Philanthropic Fund",hadOpportunity:!0},{id:"001Wj00000mCFsY",name:"World Rugby",hadOpportunity:!1},{id:"001Wj00000xyygs",name:"Wurth",hadOpportunity:!1},{id:"001Wj00000aLlzL",name:"Xerox",hadOpportunity:!1},{id:"001Wj00000j3QNL",name:"adidas",hadOpportunity:!1}]},"david.vanreyk@eudia.com":{email:"david.vanreyk@eudia.com",name:"David Van Reyk",accounts:[{id:"001Wj00000cIA4i",name:"Amerivet",hadOpportunity:!0},{id:"001Wj00000dw9pN",name:"Ardian",hadOpportunity:!0}]},"emer.flynn@eudia.com":{email:"emer.flynn@eudia.com",name:"Emer Flynn",accounts:[{id:"001Wj00000syUts",name:"Bakkavor",hadOpportunity:!1},{id:"001Wj00000syAdO",name:"Bonduelle",hadOpportunity:!1},{id:"001Wj00000syAoe",name:"Gerresheimer",hadOpportunity:!1},{id:"001Wj00000syBb5",name:"Harbour Energy",hadOpportunity:!1},{id:"001Wj00000soqIv",name:"Lundbeck",hadOpportunity:!1},{id:"001Wj00000mCFr6",name:"NTMA",hadOpportunity:!0},{id:"001Wj00000sxy9J",name:"Orion Pharma",hadOpportunity:!1},{id:"001Wj00000soqNk",name:"Sobi",hadOpportunity:!1},{id:"001Wj00000sy54F",name:"SubSea7",hadOpportunity:!1},{id:"001Wj00000sxvzJ",name:"Virbac",hadOpportunity:!1}]},"greg.machale@eudia.com":{email:"greg.machale@eudia.com",name:"Greg MacHale",accounts:[{id:"001Wj00000Y64ql",name:"ABN AMRO Bank N.V.",hadOpportunity:!1},{id:"001Wj00000tWwYd",name:"AXA",hadOpportunity:!1},{id:"001Hp00003kIrEF",name:"Abbott Laboratories",hadOpportunity:!0},{id:"001Wj00000tWwXg",name:"Abtran",hadOpportunity:!1},{id:"001Wj00000umCEl",name:"Aerogen",hadOpportunity:!1},{id:"001Wj00000xyMyB",name:"Air Liquide",hadOpportunity:!1},{id:"001Wj00000tWwYa",name:"Allergan",hadOpportunity:!1},{id:"001Wj00000sgXdB",name:"Allianz Insurance",hadOpportunity:!0},{id:"001Wj00000tWwYb",name:"Almac Group",hadOpportunity:!1},{id:"001Hp00003kIrEm",name:"Amgen",hadOpportunity:!1},{id:"001Wj00000pzTPu",name:"Arrow Global Group PLC/Mars Capital",hadOpportunity:!1},{id:"001Wj00000tWwXm",name:"Arvato Digital Services",hadOpportunity:!1},{id:"001Wj00000tWwXn",name:"Arvato Supply Chain Solutions",hadOpportunity:!1},{id:"001Wj00000tWwYc",name:"Arvato Systems",hadOpportunity:!1},{id:"001Wj00000xz3VF",name:"Asklepios",hadOpportunity:!1},{id:"001Wj00000vWwfx",name:"Associated British Foods",hadOpportunity:!1},{id:"001Hp00003kIrFB",name:"AstraZeneca",hadOpportunity:!1},{id:"001Wj00000bWJ0A",name:"Atos",hadOpportunity:!1},{id:"001Wj00000hfWMu",name:"Aya Healthcare",hadOpportunity:!1},{id:"001Wj00000tWwXV",name:"BCM Group",hadOpportunity:!1},{id:"001Wj00000tWwXU",name:"BCMGlobal ASI Ltd",hadOpportunity:!1},{id:"001Wj00000Y6VMd",name:"BNP Paribas",hadOpportunity:!0},{id:"001Wj00000X4OqN",name:"BT Group",hadOpportunity:!0},{id:"001Wj00000vRJ13",name:"BWG Group",hadOpportunity:!1},{id:"001Wj00000bWBsw",name:"Bausch + Lomb",hadOpportunity:!1},{id:"001Hp00003kIrFO",name:"Baxter International",hadOpportunity:!1},{id:"001Wj00000wLIjh",name:"Baywa",hadOpportunity:!1},{id:"001Wj00000tWwXs",name:"Bidvest Noonan",hadOpportunity:!1},{id:"001Wj00000mCFqr",name:"Biomarin International Limited",hadOpportunity:!0},{id:"001Hp00003kIrFd",name:"Booking Holdings",hadOpportunity:!0},{id:"001Wj00000T5gdt",name:"Bosch",hadOpportunity:!1},{id:"001Hp00003kIrFg",name:"Boston Scientific",hadOpportunity:!1},{id:"001Wj00000xyNsd",name:"Brenntag",hadOpportunity:!1},{id:"001Wj00000tgYgj",name:"British American Tobacco ( BAT )",hadOpportunity:!1},{id:"001Wj00000ulXoK",name:"British Petroleum ( BP )",hadOpportunity:!1},{id:"001Hp00003kIrDK",name:"Bupa",hadOpportunity:!1},{id:"001Wj00000bWBkr",name:"CRH",hadOpportunity:!1},{id:"001Wj00000uZ5J7",name:"Canada Life",hadOpportunity:!0},{id:"001Hp00003kIrFu",name:"Capgemini",hadOpportunity:!1},{id:"001Wj00000tWwYe",name:"Capita",hadOpportunity:!1},{id:"001Wj00000mCFt9",name:"Cerberus European Servicing",hadOpportunity:!0},{id:"001Wj00000tWwXz",name:"CluneTech",hadOpportunity:!1},{id:"001Wj00000wKnrE",name:"Co-operative Group ( Co-op )",hadOpportunity:!1},{id:"001Wj00000Y6HEM",name:"Commerzbank AG",hadOpportunity:!1},{id:"001Wj00000aLp9L",name:"Compass",hadOpportunity:!1},{id:"001Wj00000cSBr6",name:"Compass Group Equity Partners",hadOpportunity:!1},{id:"001Wj00000Y6VMk",name:"Computershare",hadOpportunity:!0},{id:"001Wj00000uP5x8",name:"Cornmarket Financial Services",hadOpportunity:!0},{id:"001Wj00000tWwY0",name:"Cornmarket Hill Trading Limited",hadOpportunity:!1},{id:"001Hp00003kIrGk",name:"Covestro",hadOpportunity:!1},{id:"001Wj00000tWwXY",name:"DCC Vital",hadOpportunity:!1},{id:"001Wj00000mCFrV",name:"Danske Bank",hadOpportunity:!1},{id:"001Hp00003kJ9fx",name:"Deutsche Bank AG",hadOpportunity:!1},{id:"001Wj00000Y6VMM",name:"Diageo",hadOpportunity:!0},{id:"001Wj00000prFOX",name:"Doosan Bobcat",hadOpportunity:!0},{id:"001Wj00000wKzZ1",name:"Drax Group",hadOpportunity:!1},{id:"001Hp00003kIrHQ",name:"EG Group",hadOpportunity:!1},{id:"001Wj00000hUcQZ",name:"EY",hadOpportunity:!0},{id:"001Wj00000wK30S",name:"EY ( Ernst & Young )",hadOpportunity:!1},{id:"001Hp00003kIrHL",name:"Eaton Corporation",hadOpportunity:!1},{id:"001Wj00000mCFtR",name:"Ekco Cloud Limited",hadOpportunity:!0},{id:"001Hp00003kIrHS",name:"Elevance Health",hadOpportunity:!1},{id:"001Hp00003kIrHT",name:"Eli Lilly",hadOpportunity:!1},{id:"001Wj00000Y6HEn",name:"Ferring Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000tWwYn",name:"Fibrus",hadOpportunity:!1},{id:"001Hp00003kIrHu",name:"Fidelity Investments",hadOpportunity:!1},{id:"001Hp00003kIrI0",name:"Fiserv",hadOpportunity:!1},{id:"001Wj00000xxg4V",name:"Fnac Darty",hadOpportunity:!1},{id:"001Wj00000wL79x",name:"Frasers Group",hadOpportunity:!1},{id:"001Wj00000aLlyX",name:"Gartner",hadOpportunity:!1},{id:"001Wj00000fFuFY",name:"Grant Thornton",hadOpportunity:!0},{id:"001Wj00000uZ4A9",name:"Great West Lifec co",hadOpportunity:!0},{id:"001Wj00000pzTPt",name:"Gym Plus Coffee",hadOpportunity:!1},{id:"001Wj00000xW3SE",name:"Hayfin",hadOpportunity:!0},{id:"001Wj00000pzTPm",name:"Hedgserv",hadOpportunity:!1},{id:"001Wj00000xxsbv",name:"Heidelberg Materials",hadOpportunity:!1},{id:"001Wj00000wvtPl",name:"ICEYE",hadOpportunity:!0},{id:"001Wj00000mCFrH",name:"Indra",hadOpportunity:!1},{id:"001Wj00000uZtcT",name:"Ineos",hadOpportunity:!0},{id:"001Wj00000vXdt1",name:"International Airline Group ( IAG )",hadOpportunity:!1},{id:"001Wj00000wKnZU",name:"International Distribution Services",hadOpportunity:!1},{id:"001Wj00000wKTao",name:"John Swire & Sons",hadOpportunity:!1},{id:"001Wj00000vaqot",name:"Johnson Controls",hadOpportunity:!1},{id:"001Wj00000xwwRX",name:"Jumbo Groep Holding",hadOpportunity:!1},{id:"001Hp00003kIrJb",name:"KPMG",hadOpportunity:!1},{id:"001Wj00000Y6VZM",name:"Kering",hadOpportunity:!1},{id:"001Wj00000mCFrr",name:"Kerry Group",hadOpportunity:!1},{id:"001Wj00000xyyk7",name:"La Poste",hadOpportunity:!1},{id:"001Wj00000tWwYr",name:"Laya Healthcare",hadOpportunity:!1},{id:"001Wj00000tWwYE",name:"Leaseplan",hadOpportunity:!1},{id:"001Wj00000tWwYF",name:"Linked Finance",hadOpportunity:!1},{id:"001Wj00000Y6HEA",name:"Lloyds Banking Group",hadOpportunity:!1},{id:"001Wj00000xyDV4",name:"LyondellBasell Industries",hadOpportunity:!1},{id:"001Wj00000tWwYG",name:"MSC - Mediterranean Shipping Company",hadOpportunity:!1},{id:"001Wj00000wvGLB",name:"MTU Maintenance Lease Services",hadOpportunity:!1},{id:"001Wj00000iC14L",name:"MUFG Investor Services",hadOpportunity:!1},{id:"001Wj00000xyp2U",name:"MVV Energie",hadOpportunity:!1},{id:"001Wj00000tWwYp",name:"Mail Metrics",hadOpportunity:!0},{id:"001Wj00000qFtCk",name:"Mars Capital",hadOpportunity:!1},{id:"001Wj00000pAeWg",name:"Meetingsbooker",hadOpportunity:!0},{id:"001Hp00003kIrKJ",name:"Mercedes-Benz Group",hadOpportunity:!0},{id:"001Wj00000YEMaI",name:"Mercer",hadOpportunity:!1},{id:"001Wj00000vwSUX",name:"Mercor",hadOpportunity:!0},{id:"001Wj00000mCFtU",name:"Mercury Engineering",hadOpportunity:!0},{id:"001Wj00000yGZth",name:"Monzo",hadOpportunity:!1},{id:"001Wj00000tWwYg",name:"Musgrave",hadOpportunity:!1},{id:"001Wj00000lPFP3",name:"Nomura",hadOpportunity:!0},{id:"001Wj00000tWwYH",name:"Norbrook Laboratories",hadOpportunity:!1},{id:"001Hp00003kIrKn",name:"Northrop Grumman",hadOpportunity:!1},{id:"001Wj00000xxcH4",name:"Orange",hadOpportunity:!1},{id:"001Wj00000tWwYI",name:"P.J. Carroll (BAT Ireland)",hadOpportunity:!1},{id:"001Wj00000mCFsf",name:"Pepper Finance Corporation",hadOpportunity:!0},{id:"001Wj00000mCFrO",name:"Peptalk",hadOpportunity:!0},{id:"001Wj00000mCFr1",name:"Permanent TSB plc",hadOpportunity:!0},{id:"001Wj00000Y6QfR",name:"Pernod Ricard",hadOpportunity:!0},{id:"001Wj00000vVxFy",name:"Phoenix Group",hadOpportunity:!1},{id:"001Wj00000tWwYM",name:"Pinewood Laboratories",hadOpportunity:!1},{id:"001Wj00000tWwYN",name:"Pinsent Masons",hadOpportunity:!1},{id:"001Wj00000tWwYO",name:"Pramerica",hadOpportunity:!1},{id:"001Hp00003kIrLf",name:"PwC",hadOpportunity:!1},{id:"001Hp00003kIrLi",name:"Quest Diagnostics",hadOpportunity:!0},{id:"001Wj00000xy735",name:"RATP Group",hadOpportunity:!1},{id:"001Wj00000xyKjS",name:"Randstad",hadOpportunity:!1},{id:"001Wj00000mCFsF",name:"Regeneron",hadOpportunity:!0},{id:"001Wj00000xwh4H",name:"Renault",hadOpportunity:!1},{id:"001Wj00000xy1P5",name:"Rheinmetall",hadOpportunity:!1},{id:"001Wj00000tWwYQ",name:"Roche",hadOpportunity:!1},{id:"001Wj00000wKi8O",name:"Royal London",hadOpportunity:!1},{id:"001Wj00000mCFsR",name:"Ryanair",hadOpportunity:!0},{id:"001Wj00000xyJqd",name:"SCOR",hadOpportunity:!1},{id:"001Wj00000pAxKo",name:"SSP Group",hadOpportunity:!0},{id:"001Wj00000bWIzx",name:"Saint-Gobain",hadOpportunity:!1},{id:"001Wj00000pzTPv",name:"Scottish Friendly",hadOpportunity:!1},{id:"001Wj00000bzz9U",name:"Signify Group",hadOpportunity:!0},{id:"001Wj00000fFuG4",name:"Sky",hadOpportunity:!1},{id:"001Hp00003kIrDR",name:"Smith & Nephew",hadOpportunity:!1},{id:"001Hp00003kIrE1",name:"Societe Generale",hadOpportunity:!1},{id:"001Hp00003kIrMj",name:"State Street",hadOpportunity:!0},{id:"001Wj00000xyy4A",name:"Sudzucker",hadOpportunity:!1},{id:"001Wj00000mCFtB",name:"SurveyMonkey",hadOpportunity:!1},{id:"001Wj00000xypQh",name:"TUI",hadOpportunity:!1},{id:"001Wj00000tWwYT",name:"Takeda",hadOpportunity:!1},{id:"001Wj00000wKD4c",name:"Talanx",hadOpportunity:!1},{id:"001Wj00000mCFr9",name:"Tesco",hadOpportunity:!0},{id:"001Wj00000tWwYX",name:"Tullow Oil",hadOpportunity:!1},{id:"001Wj00000mCFsS",name:"Uniphar PLC",hadOpportunity:!0},{id:"001Hp00003kIrNg",name:"UnitedHealth Group",hadOpportunity:!1},{id:"001Wj00000mCFsx",name:"Vodafone Ireland",hadOpportunity:!1},{id:"001Wj00000xybh4",name:"Wendel",hadOpportunity:!1},{id:"001Wj00000sCb3D",name:"Willis Towers Watson",hadOpportunity:!1},{id:"001Wj00000tWwYY",name:"Winthrop",hadOpportunity:!1},{id:"001Wj00000pzTPW",name:"WizzAir",hadOpportunity:!1},{id:"001Wj00000mCFrm",name:"eShopWorld",hadOpportunity:!0},{id:"001Hp00003kJ9Ck",name:"wnco.com",hadOpportunity:!1}]},"himanshu.agarwal@eudia.com":{email:"himanshu.agarwal@eudia.com",name:"Himanshu Agarwal",accounts:[{id:"001Hp00003kIrEs",name:"AON",hadOpportunity:!0},{id:"001Wj00000RwUpO",name:"Acrisure",hadOpportunity:!0},{id:"001Hp00003kIrCd",name:"Adobe",hadOpportunity:!1},{id:"001Hp00003kIrEU",name:"Albertsons",hadOpportunity:!0},{id:"001Wj00000T6Hrw",name:"Atlassian",hadOpportunity:!0},{id:"001Wj00000ZRrYl",name:"Avis Budget Group",hadOpportunity:!0},{id:"001Wj00000kIYAD",name:"Axis Bank",hadOpportunity:!0},{id:"001Hp00003kIrD0",name:"Broadcom",hadOpportunity:!0},{id:"001Hp00003kIrGh",name:"Costco Wholesale",hadOpportunity:!1},{id:"001Hp00003kIrCu",name:"Disney",hadOpportunity:!1},{id:"001Hp00003kIrIF",name:"Gap",hadOpportunity:!0},{id:"001Hp00003kIrDN",name:"Genpact",hadOpportunity:!0},{id:"001Wj00000Zcmad",name:"Geodis",hadOpportunity:!0},{id:"001Wj00000Q2yaX",name:"Innovative Driven",hadOpportunity:!1},{id:"001Hp00003lhshd",name:"Instacart",hadOpportunity:!0},{id:"001Hp00003kIrJx",name:"Lowe's",hadOpportunity:!1},{id:"001Hp00003kIrDk",name:"Moderna",hadOpportunity:!0},{id:"001Wj00000hDvCc",name:"Nykaa",hadOpportunity:!0},{id:"001Wj00000h9r1F",name:"Piramal Finance",hadOpportunity:!0},{id:"001Hp00003kIrDc",name:"Progressive",hadOpportunity:!0},{id:"001Wj00000cyDxS",name:"Pyxus",hadOpportunity:!0},{id:"001Wj00000XXvnk",name:"Relativity",hadOpportunity:!0},{id:"001Wj00000kIFDh",name:"Reliance",hadOpportunity:!0},{id:"001Wj00000eKsGZ",name:"Snowflake",hadOpportunity:!1},{id:"001Hp00003kIrNr",name:"Visa",hadOpportunity:!0},{id:"001Hp00003kIrO0",name:"Warner Bros Discovery",hadOpportunity:!1},{id:"001Hp00003kIrDT",name:"xAI",hadOpportunity:!0}]},"jon.cobb@eudia.com":{email:"jon.cobb@eudia.com",name:"Jon Cobb",accounts:[{id:"001Wj00000XTOQZ",name:"Armstrong World Industries",hadOpportunity:!0},{id:"001Wj00000c0Cxn",name:"U.S. Aircraft Insurance Group",hadOpportunity:!0}]},"julie.stefanich@eudia.com":{email:"julie.stefanich@eudia.com",name:"Julie Stefanich",accounts:[{id:"001Wj00000asSHB",name:"Airbus",hadOpportunity:!0},{id:"001Hp00003kIrEl",name:"Ameriprise Financial",hadOpportunity:!0},{id:"001Wj00000X6IDs",name:"Andersen",hadOpportunity:!0},{id:"001Hp00003kIrEv",name:"Apple",hadOpportunity:!0},{id:"001Wj00000soLVH",name:"Base Power",hadOpportunity:!0},{id:"001Hp00003kJ9pX",name:"Bayer",hadOpportunity:!0},{id:"001Hp00003kIrFP",name:"Bechtel",hadOpportunity:!0},{id:"001Hp00003kIrFZ",name:"Block",hadOpportunity:!0},{id:"001Hp00003kIrE3",name:"Cargill",hadOpportunity:!0},{id:"001Hp00003kIrGD",name:"Charles Schwab",hadOpportunity:!0},{id:"001Hp00003kIrE4",name:"Chevron",hadOpportunity:!0},{id:"001Hp00003kIrDh",name:"Comcast",hadOpportunity:!0},{id:"001Hp00003kIrGe",name:"Corebridge Financial",hadOpportunity:!0},{id:"001Wj00000eLJAK",name:"CrowdStrike",hadOpportunity:!1},{id:"001Hp00003liBe9",name:"DoorDash",hadOpportunity:!1},{id:"001Hp00003kIrE7",name:"ECMS",hadOpportunity:!0},{id:"001Hp00003kIrHP",name:"Edward Jones",hadOpportunity:!0},{id:"001Wj00000iRzqv",name:"Florida Crystals Corporation",hadOpportunity:!0},{id:"001Wj00000XS3MX",name:"Flutter",hadOpportunity:!0},{id:"001Hp00003kIrIP",name:"Genworth Financial",hadOpportunity:!0},{id:"001Hp00003kIrIX",name:"Goldman Sachs",hadOpportunity:!0},{id:"001Wj00000rceVp",name:"Hikma",hadOpportunity:!0},{id:"001Hp00003kIrJV",name:"KLA",hadOpportunity:!0},{id:"001Wj00000XkT43",name:"Kaiser Permanente",hadOpportunity:!0},{id:"001Wj00000aLmhe",name:"Macmillan",hadOpportunity:!0},{id:"001Wj00000X6G8q",name:"Mainsail Partners",hadOpportunity:!0},{id:"001Hp00003kIrDb",name:"McKinsey & Company",hadOpportunity:!0},{id:"001Hp00003kIrKL",name:"MetLife",hadOpportunity:!0},{id:"001Hp00003kIrCp",name:"Mosaic",hadOpportunity:!0},{id:"001Hp00003kIrDe",name:"National Grid",hadOpportunity:!0},{id:"001Hp00003kIrKY",name:"Netflix",hadOpportunity:!0},{id:"001Hp00003kIrKj",name:"Nordstrom",hadOpportunity:!0},{id:"001Hp00003kIrL2",name:"O'Reilly Automotive",hadOpportunity:!0},{id:"001Hp00003kIrDv",name:"Oracle",hadOpportunity:!0},{id:"001Hp00003kIrLP",name:"PG&E",hadOpportunity:!1},{id:"001Hp00003kIrLH",name:"PayPal inc.",hadOpportunity:!1},{id:"001Hp00003kIrLN",name:"Petsmart",hadOpportunity:!0},{id:"001Hp00003kIrLZ",name:"Procter & Gamble",hadOpportunity:!0},{id:"001Wj00000XcHEb",name:"Resmed",hadOpportunity:!0},{id:"001Hp00003lhsUY",name:"Rio Tinto Group",hadOpportunity:!0},{id:"001Wj00000svQI3",name:"Safelite",hadOpportunity:!0},{id:"001Wj00000Yfysf",name:"Samsara",hadOpportunity:!0},{id:"001Wj00000fRtLm",name:"State Farm",hadOpportunity:!0},{id:"001Hp00003kIrNH",name:"T-Mobile",hadOpportunity:!0},{id:"001Hp00003kIrCr",name:"TIAA",hadOpportunity:!0},{id:"001Wj00000bIVo1",name:"TSMC",hadOpportunity:!0},{id:"001Wj00000bzz9T",name:"Tailored Brands",hadOpportunity:!0},{id:"001Hp00003kIrNB",name:"The Wonderful Company",hadOpportunity:!0},{id:"001Hp00003kIrNV",name:"Uber",hadOpportunity:!0},{id:"001Wj00000Y6VYk",name:"Verifone",hadOpportunity:!0},{id:"001Hp00003kIrOL",name:"World Wide Technology",hadOpportunity:!0},{id:"001Wj00000bWIza",name:"eBay",hadOpportunity:!1}]},"justin.hills@eudia.com":{email:"justin.hills@eudia.com",name:"Justin Hills",accounts:[{id:"001Wj00000vCx6j",name:"1800 Flowers",hadOpportunity:!1},{id:"001Wj00000Y6VM4",name:"Ares Management Corporation",hadOpportunity:!0},{id:"001Hp00003kIrG8",name:"Centene",hadOpportunity:!0},{id:"001Wj00000c9oCv",name:"Cox Media Group",hadOpportunity:!0},{id:"001Wj00000vCPMs",name:"Crusoe",hadOpportunity:!1},{id:"001Wj00000vCiAw",name:"Deel",hadOpportunity:!1},{id:"001Wj00000Y0jPm",name:"Delinea",hadOpportunity:!0},{id:"001Wj00000iwKGQ",name:"Dominos",hadOpportunity:!0},{id:"001Hp00003kIrDa",name:"Duracell",hadOpportunity:!0},{id:"001Wj00000Y6Vde",name:"EPIC Insurance Brokers & Consultants",hadOpportunity:!1},{id:"001Hp00003kIrIC",name:"Freddie Mac",hadOpportunity:!1},{id:"001Hp00003kJ9gW",name:"Genentech",hadOpportunity:!0},{id:"001Hp00003kIrDV",name:"Intel",hadOpportunity:!0},{id:"001Hp00003kIrJJ",name:"Johnson & Johnson",hadOpportunity:!0},{id:"001Wj00000gnrug",name:"Kraken",hadOpportunity:!0},{id:"001Wj00000op4EW",name:"McCormick & Co Inc",hadOpportunity:!0},{id:"001Wj00000RCeqA",name:"Nielsen",hadOpportunity:!0},{id:"001Wj00000YEMZp",name:"Notion",hadOpportunity:!1},{id:"001Wj00000ix7c2",name:"Nouryon",hadOpportunity:!0},{id:"001Wj00000WYyKI",name:"Ramp",hadOpportunity:!0},{id:"001Wj00000hzxnD",name:"Ro Healthcare",hadOpportunity:!1},{id:"001Hp00003kIrMi",name:"Starbucks",hadOpportunity:!0},{id:"001Wj00000o5G0v",name:"StockX",hadOpportunity:!0},{id:"001Wj00000f3bWU",name:"TransUnion",hadOpportunity:!0},{id:"001Wj00000oqRyc",name:"Walgreens Boots Alliance",hadOpportunity:!0}]},"mike.ayres@eudia.com":{email:"mike.ayres@eudia.com",name:"Mike Ayres",accounts:[{id:"001Wj00000synYD",name:"Barry Callebaut Group",hadOpportunity:!1}]},"mike@eudia.com":{email:"mike@eudia.com",name:"Mike Masiello",accounts:[{id:"001Wj00000celOy",name:"Arizona Gov Office",hadOpportunity:!1},{id:"001Wj00000p1lCP",name:"Army Applications Lab",hadOpportunity:!0},{id:"001Wj00000p1hYb",name:"Army Corps of Engineers",hadOpportunity:!0},{id:"001Wj00000ZxEpD",name:"Army Futures Command",hadOpportunity:!0},{id:"001Hp00003lhZrR",name:"DARPA",hadOpportunity:!0},{id:"001Wj00000bWBlA",name:"Defense Innovation Unit (DIU)",hadOpportunity:!0},{id:"001Hp00003kJzoR",name:"Gov - Civ",hadOpportunity:!1},{id:"001Hp00003kJuJ5",name:"Gov - DOD",hadOpportunity:!0},{id:"001Wj00000p1PVH",name:"IFC",hadOpportunity:!0},{id:"001Wj00000UkYiC",name:"MITRE",hadOpportunity:!1},{id:"001Wj00000VVJ31",name:"NATO",hadOpportunity:!0},{id:"001Wj00000Ukxzt",name:"SIIA",hadOpportunity:!1},{id:"001Wj00000p1Ybm",name:"SOCOM",hadOpportunity:!0},{id:"001Wj00000Zwarp",name:"Second Front",hadOpportunity:!1},{id:"001Hp00003lhcL9",name:"Social Security Administration",hadOpportunity:!0},{id:"001Wj00000p1jH3",name:"State of Alaska",hadOpportunity:!0},{id:"001Wj00000hVa6V",name:"State of Arizona",hadOpportunity:!0},{id:"001Wj00000p0PcE",name:"State of California",hadOpportunity:!0},{id:"001Wj00000bWBke",name:"U.S. Air Force",hadOpportunity:!0},{id:"001Wj00000bWIzN",name:"U.S. Army",hadOpportunity:!0},{id:"001Hp00003kIrDU",name:"U.S. Government",hadOpportunity:!1},{id:"001Wj00000p1SRX",name:"U.S. Marine Corps",hadOpportunity:!0},{id:"001Wj00000hfaDc",name:"U.S. Navy",hadOpportunity:!0},{id:"001Wj00000Rrm5O",name:"UK Government",hadOpportunity:!0},{id:"001Hp00003lieJP",name:"USDA",hadOpportunity:!0},{id:"001Wj00000p1SuZ",name:"Vulcan Special Ops",hadOpportunity:!0}]},"mitch.loquaci@eudia.com":{email:"mitch.loquaci@eudia.com",name:"Mitch Loquaci",accounts:[{id:"001Hp00003kIrCn",name:"Home Depot",hadOpportunity:!0},{id:"001Wj00000wlTbU",name:"Mimecast",hadOpportunity:!1},{id:"001Wj00000cpxt0",name:"Novelis",hadOpportunity:!0}]},"nathan.shine@eudia.com":{email:"nathan.shine@eudia.com",name:"Nathan Shine",accounts:[{id:"001Wj00000xy4hv",name:"ASDA Group",hadOpportunity:!1},{id:"001Wj00000xz26A",name:"Achmea",hadOpportunity:!1},{id:"001Wj00000xyb9C",name:"Adient",hadOpportunity:!1},{id:"001Hp00003kIrEn",name:"Amphenol",hadOpportunity:!0},{id:"001Wj00000mCFr3",name:"Ancestry",hadOpportunity:!0},{id:"001Wj00000xxHhF",name:"Ashtead Group",hadOpportunity:!1},{id:"001Wj00000mCFr5",name:"Boomi",hadOpportunity:!1},{id:"001Wj00000mCFrQ",name:"CaliberAI",hadOpportunity:!1},{id:"001Wj00000WiFP8",name:"Cantor Fitzgerald",hadOpportunity:!0},{id:"001Wj00000mCFrj",name:"CarTrawler",hadOpportunity:!0},{id:"001Wj00000xz2UM",name:"Carnival",hadOpportunity:!1},{id:"001Wj00000pzTPd",name:"Circle K",hadOpportunity:!1},{id:"001Wj00000xyP82",name:"Claas Group",hadOpportunity:!1},{id:"001Wj00000bW3KA",name:"Cloud Software Group",hadOpportunity:!1},{id:"001Wj00000mHDBo",name:"Coimisiun na Mean",hadOpportunity:!0},{id:"001Wj00000mCFqt",name:"CommScope Technologies",hadOpportunity:!0},{id:"001Wj00000xz2ZC",name:"Continental",hadOpportunity:!1},{id:"001Wj00000Y6wFZ",name:"Coursera",hadOpportunity:!1},{id:"001Wj00000xz3DV",name:"Credit Mutuel Group",hadOpportunity:!1},{id:"001Wj00000Y6DDY",name:"Credit Suisse",hadOpportunity:!1},{id:"001Wj00000pzTPZ",name:"CubeMatch",hadOpportunity:!1},{id:"001Wj00000pzTPb",name:"Dawn Meats",hadOpportunity:!1},{id:"001Wj00000xxtwB",name:"Deutsche Telekom",hadOpportunity:!1},{id:"001Hp00003kIrDM",name:"Dropbox",hadOpportunity:!0},{id:"001Wj00000mCFra",name:"Dunnes Stores",hadOpportunity:!0},{id:"001Wj00000xxq75",name:"ELO Group",hadOpportunity:!1},{id:"001Wj00000xyEnj",name:"Engie",hadOpportunity:!1},{id:"001Wj00000mCFqu",name:"Fexco",hadOpportunity:!0},{id:"001Wj00000mCFsA",name:"First Derivatives",hadOpportunity:!1},{id:"001Wj00000mCFtD",name:"Flynn O'Driscoll, Business Lawyers",hadOpportunity:!1},{id:"001Wj00000xyMmu",name:"Forvia",hadOpportunity:!1},{id:"001Wj00000xz3Bt",name:"Freudenberg Group",hadOpportunity:!1},{id:"001Wj00000mCFro",name:"GemCap",hadOpportunity:!0},{id:"001Wj00000xxqjp",name:"Groupama",hadOpportunity:!1},{id:"001Wj00000xyFdR",name:"Groupe Eiffage",hadOpportunity:!1},{id:"001Wj00000xxtuZ",name:"Hays",hadOpportunity:!1},{id:"001Wj00000xy4A2",name:"HelloFresh",hadOpportunity:!1},{id:"001Wj00000mCFrq",name:"ID-Pal",hadOpportunity:!1},{id:"001Wj00000xz3IL",name:"ING Group",hadOpportunity:!1},{id:"001Wj00000xz2xN",name:"Inchcape",hadOpportunity:!1},{id:"001Wj00000mCFs5",name:"Indeed",hadOpportunity:!0},{id:"001Wj00000sooaT",name:"Ipsen",hadOpportunity:!1},{id:"001Wj00000mCFss",name:"Irish League of Credit Unions",hadOpportunity:!0},{id:"001Wj00000mCFrS",name:"Irish Life",hadOpportunity:!0},{id:"001Wj00000mCFsV",name:"Irish Residential Properties REIT Plc",hadOpportunity:!1},{id:"001Hp00003kIrJO",name:"Keurig Dr Pepper",hadOpportunity:!0},{id:"001Wj00000hkk0z",name:"Kingspan",hadOpportunity:!0},{id:"001Wj00000mCFrs",name:"Kitman Labs",hadOpportunity:!0},{id:"001Wj00000xy1VZ",name:"LDC Group",hadOpportunity:!1},{id:"001Wj00000mCFtF",name:"Let's Get Checked",hadOpportunity:!1},{id:"001Hp00003kIrJo",name:"Liberty Insurance",hadOpportunity:!1},{id:"001Wj00000xz2yz",name:"Marks and Spencer Group",hadOpportunity:!1},{id:"001Wj00000mCFsM",name:"McDermott Creed & Martyn",hadOpportunity:!0},{id:"001Hp00003kIrKF",name:"McKesson",hadOpportunity:!1},{id:"001Wj00000mCFso",name:"Mediolanum",hadOpportunity:!0},{id:"001Wj00000xyP9g",name:"Munich Re Group",hadOpportunity:!1},{id:"001Wj00000xxIyF",name:"Nationwide Building Society",hadOpportunity:!1},{id:"001Wj00000xxgZB",name:"Nebius Group",hadOpportunity:!1},{id:"001Wj00000symlp",name:"Nestl\xE9 Health Science",hadOpportunity:!1},{id:"001Wj00000xyYPq",name:"Nexans",hadOpportunity:!1},{id:"001Wj00000xybvb",name:"Next",hadOpportunity:!1},{id:"001Wj00000syczN",name:"Nomad Foods",hadOpportunity:!1},{id:"001Wj00000mCFrF",name:"OKG Payments Services Limited",hadOpportunity:!0},{id:"001Wj00000mCFqy",name:"Oneview Healthcare",hadOpportunity:!1},{id:"001Wj00000aCGRB",name:"Optum",hadOpportunity:!1},{id:"001Wj00000sylmX",name:"Orlen",hadOpportunity:!1},{id:"001Wj00000mCFrL",name:"PROS",hadOpportunity:!1},{id:"001Wj00000ZDPUI",name:"Perrigo Pharma",hadOpportunity:!0},{id:"001Wj00000xz33p",name:"Phoenix Pharma",hadOpportunity:!1},{id:"001Wj00000mCFqz",name:"Phoenix Tower International",hadOpportunity:!0},{id:"001Wj00000pzTPf",name:"Pipedrive",hadOpportunity:!1},{id:"001Wj00000mCFtS",name:"Poe Kiely Hogan Lanigan",hadOpportunity:!0},{id:"001Wj00000xxwys",name:"REWE Group",hadOpportunity:!1},{id:"001Wj00000xz3On",name:"Rexel",hadOpportunity:!1},{id:"001Wj00000xyJLy",name:"Royal BAM Group",hadOpportunity:!1},{id:"001Wj00000xysZq",name:"SPIE",hadOpportunity:!1},{id:"001Wj00000xxuVg",name:"SSE",hadOpportunity:!1},{id:"001Wj00000xxk1y",name:"Schaeffler",hadOpportunity:!1},{id:"001Wj00000syeJe",name:"Schott Pharma",hadOpportunity:!1},{id:"001Wj00000mCFrX",name:"South East Financial Services Cluster",hadOpportunity:!1},{id:"001Wj00000mCFry",name:"Spectrum Wellness Holdings Limited",hadOpportunity:!0},{id:"001Wj00000mCFsq",name:"Speed Fibre Group(enet)",hadOpportunity:!0},{id:"001Wj00000mCFtH",name:"StepStone Group",hadOpportunity:!0},{id:"001Hp00003kIrMp",name:"Stryker",hadOpportunity:!1},{id:"001Wj00000pzTPa",name:"SuperNode Ltd",hadOpportunity:!1},{id:"001Wj00000mCFtI",name:"Swish Fibre",hadOpportunity:!1},{id:"001Wj00000SFiOv",name:"TikTok",hadOpportunity:!0},{id:"001Wj00000ZDXTR",name:"Tinder LLC",hadOpportunity:!0},{id:"001Wj00000mCFrC",name:"Tines Security Services Limited",hadOpportunity:!0},{id:"001Wj00000xxQsc",name:"UDG Healthcare",hadOpportunity:!1},{id:"001Wj00000pzTPe",name:"Udaras na Gaeltachta",hadOpportunity:!1},{id:"001Wj00000bWBlE",name:"Udemy",hadOpportunity:!0},{id:"001Wj00000Y6VMX",name:"Unilever",hadOpportunity:!1},{id:"001Wj00000pzTPc",name:"Urban Volt",hadOpportunity:!1},{id:"001Wj00000xwB2o",name:"Vitesco Technologies Group",hadOpportunity:!1},{id:"001Hp00003liCZY",name:"Workday",hadOpportunity:!1},{id:"001Wj00000xyOlT",name:"X5 Retail Group",hadOpportunity:!1},{id:"001Wj00000xyXQZ",name:"Zalando",hadOpportunity:!1},{id:"001Wj00000Y6VZ3",name:"Ziff Davis",hadOpportunity:!1},{id:"001Wj00000mCFsZ",name:"Zurich Irish Life plc",hadOpportunity:!0}]},"nicola.fratini@eudia.com":{email:"nicola.fratini@eudia.com",name:"Nicola Fratini",accounts:[{id:"001Wj00000mCFqs",name:"AIB",hadOpportunity:!0},{id:"001Wj00000tWwXp",name:"AXIS Capital",hadOpportunity:!1},{id:"001Wj00000tWwXh",name:"Actavo Group Ltd",hadOpportunity:!1},{id:"001Wj00000thuKE",name:"Aer Lingus",hadOpportunity:!0},{id:"001Wj00000tWwXi",name:"Aer Rianta",hadOpportunity:!1},{id:"001Wj00000mCFrG",name:"AerCap",hadOpportunity:!0},{id:"001Wj00000YEMaB",name:"Aligned Incentives, a Bureau Veritas company",hadOpportunity:!1},{id:"001Wj00000mCFs7",name:"Allied Irish Banks plc",hadOpportunity:!0},{id:"001Wj00000mCFsb",name:"Amundi Ireland Limited",hadOpportunity:!0},{id:"001Wj00000uZ7w2",name:"Anna Charles",hadOpportunity:!1},{id:"001Wj00000TUdXw",name:"Anthropic",hadOpportunity:!0},{id:"001Wj00000mCFrD",name:"Applegreen",hadOpportunity:!1},{id:"001Wj00000wvc5a",name:"AppliedAI",hadOpportunity:!0},{id:"001Wj00000socke",name:"Archer The Well Company",hadOpportunity:!1},{id:"001Wj00000tWwXl",name:"Ardagh Glass Sales",hadOpportunity:!1},{id:"001Wj00000sgB1h",name:"Autorek",hadOpportunity:!1},{id:"001Wj00000mCFrh",name:"Avant Money",hadOpportunity:!0},{id:"001Wj00000tWwXT",name:"Avantcard",hadOpportunity:!1},{id:"001Wj00000mI7Na",name:"Aviva Insurance",hadOpportunity:!0},{id:"001Wj00000tWwXo",name:"Avolon",hadOpportunity:!1},{id:"001Wj00000uNUIB",name:"Bank of China",hadOpportunity:!0},{id:"001Hp00003kJ9kN",name:"Barclays",hadOpportunity:!0},{id:"001Wj00000ttPZB",name:"Barings",hadOpportunity:!0},{id:"001Wj00000tWwXW",name:"Beauparc Group",hadOpportunity:!0},{id:"001Wj00000xxRyK",name:"Bertelsmann",hadOpportunity:!1},{id:"001Wj00000tWwXX",name:"Bidx1",hadOpportunity:!1},{id:"001Wj00000soanc",name:"Borr Drilling",hadOpportunity:!1},{id:"001Wj00000tWwXu",name:"Boylesports",hadOpportunity:!1},{id:"001Wj00000uYz0o",name:"Bud Financial",hadOpportunity:!1},{id:"001Wj00000tWwXv",name:"Bunzl",hadOpportunity:!1},{id:"001Wj00000xxtGE",name:"Burelle",hadOpportunity:!1},{id:"001Wj00000mCFr0",name:"CNP Santander Insurance Services Limited",hadOpportunity:!0},{id:"001Wj00000tWwXw",name:"Cairn Homes",hadOpportunity:!0},{id:"001Wj00000uZ2hp",name:"Centrica",hadOpportunity:!1},{id:"001Wj00000uYYWv",name:"Checkout.com",hadOpportunity:!1},{id:"001Wj00000Y64qg",name:"Christian Dior Couture",hadOpportunity:!1},{id:"001Wj00000Y6VLh",name:"Citi",hadOpportunity:!0},{id:"001Wj00000mCFrE",name:"Clanwilliam Group",hadOpportunity:!0},{id:"001Wj00000tWwYl",name:"Clevercards",hadOpportunity:!1},{id:"001Wj00000mCFsm",name:"Coca-Cola HBC Ireland Limited",hadOpportunity:!0},{id:"001Wj00000xz30b",name:"Compagnie de l'Odet",hadOpportunity:!1},{id:"001Wj00000xxtOM",name:"Credit Industriel & Commercial",hadOpportunity:!1},{id:"001Wj00000uZ7RN",name:"Cuvva",hadOpportunity:!1},{id:"001Wj00000tx2MQ",name:"CyberArk",hadOpportunity:!0},{id:"001Wj00000tWwY1",name:"DAA",hadOpportunity:!1},{id:"001Wj00000xyNnm",name:"DS Smith",hadOpportunity:!1},{id:"001Wj00000hkk0s",name:"DSM",hadOpportunity:!1},{id:"001Wj00000hfWMt",name:"Dassault Syst?mes",hadOpportunity:!1},{id:"001Wj00000mCFsB",name:"Datalex",hadOpportunity:!0},{id:"001Wj00000mCFrl",name:"Davy",hadOpportunity:!0},{id:"001Wj00000tWwYm",name:"Deliveroo",hadOpportunity:!1},{id:"001Wj00000w0uVV",name:"Doceree",hadOpportunity:!0},{id:"001Wj00000vbvuX",name:"Dole plc",hadOpportunity:!1},{id:"001Wj00000tWwXZ",name:"EVO Payments",hadOpportunity:!1},{id:"001Wj00000xxsvH",name:"EXOR Group",hadOpportunity:!1},{id:"001Wj00000tWwY4",name:"Easons",hadOpportunity:!1},{id:"001Wj00000xz35R",name:"EasyJet",hadOpportunity:!1},{id:"001Wj00000xx4SK",name:"Edeka Zentrale",hadOpportunity:!1},{id:"001Wj00000uJwxo",name:"Eir",hadOpportunity:!0},{id:"001Wj00000tWwY5",name:"Elavon",hadOpportunity:!1},{id:"001Wj00000pzTPn",name:"Euronext Dublin",hadOpportunity:!1},{id:"001Wj00000sg8Gc",name:"FARFETCH",hadOpportunity:!0},{id:"001Wj00000mIEAX",name:"FNZ Group",hadOpportunity:!0},{id:"001Wj00000tWwY7",name:"First Data",hadOpportunity:!1},{id:"001Wj00000soigL",name:"Fresenius Kabi",hadOpportunity:!1},{id:"001Wj00000xyXyQ",name:"FrieslandCampina",hadOpportunity:!1},{id:"001Wj00000xyAP9",name:"GasTerra",hadOpportunity:!1},{id:"001Wj00000mCFt1",name:"Goodbody Stockbrokers",hadOpportunity:!0},{id:"001Wj00000soN5f",name:"Greencore",hadOpportunity:!1},{id:"001Wj00000xyyli",name:"Groupe BPCE",hadOpportunity:!1},{id:"001Wj00000xz9xF",name:"Haleon",hadOpportunity:!1},{id:"001Wj00000xz3S2",name:"Hapag-Lloyd",hadOpportunity:!1},{id:"001Wj00000tWwY9",name:"Henderson Group",hadOpportunity:!1},{id:"001Wj00000Y6VMb",name:"Henkel",hadOpportunity:!1},{id:"001Hp00003liHvf",name:"Hubspot",hadOpportunity:!0},{id:"001Wj00000sg9MN",name:"INNIO Group",hadOpportunity:!1},{id:"001Wj00000bzz9O",name:"IPG Mediabrands",hadOpportunity:!0},{id:"001Wj00000tWwYA",name:"IPL Plastics",hadOpportunity:!1},{id:"001Wj00000ZDXrd",name:"Intercom",hadOpportunity:!0},{id:"001Wj00000tWwYB",name:"Ires Reit",hadOpportunity:!1},{id:"001Wj00000xy2WS",name:"J. Sainsbury",hadOpportunity:!1},{id:"001Wj00000xyG3B",name:"JD Sports Fashion",hadOpportunity:!1},{id:"001Wj00000ullPp",name:"Jet2 Plc",hadOpportunity:!0},{id:"001Wj00000xyIeR",name:"KION Group",hadOpportunity:!1},{id:"001Wj00000tWwXb",name:"Keywords Studios",hadOpportunity:!1},{id:"001Wj00000xxdOO",name:"Kingfisher",hadOpportunity:!1},{id:"001Wj00000xy0o1",name:"Knorr-Bremse",hadOpportunity:!1},{id:"001Wj00000xxuVi",name:"L'Oreal",hadOpportunity:!1},{id:"001Wj00000xwh4I",name:"Landesbank Baden-Wurttemberg",hadOpportunity:!1},{id:"001Wj00000au3sw",name:"Lenovo",hadOpportunity:!0},{id:"001Wj00000sobq8",name:"MOL Magyarorsz\xE1g",hadOpportunity:!1},{id:"001Wj00000xwrq3",name:"Michelin",hadOpportunity:!1},{id:"001Wj00000xz3i9",name:"Mondi Group",hadOpportunity:!1},{id:"001Wj00000xxaf3",name:"NatWest Group",hadOpportunity:!1},{id:"001Wj00000xzFJV",name:"Norddeutsche Landesbank",hadOpportunity:!1},{id:"001Hp00003kIrKm",name:"Northern Trust Management Services",hadOpportunity:!0},{id:"001Wj00000bWIxi",name:"Novo Nordisk",hadOpportunity:!1},{id:"001Wj00000TV1Wz",name:"OpenAi",hadOpportunity:!0},{id:"001Wj00000tWwYh",name:"Origin Enterprises",hadOpportunity:!1},{id:"001Wj00000xz3dJ",name:"Otto",hadOpportunity:!1},{id:"001Wj00000tWwYs",name:"Panda Waste",hadOpportunity:!1},{id:"001Wj00000tWwYJ",name:"Paysafe",hadOpportunity:!1},{id:"001Wj00000souuM",name:"Premier Foods",hadOpportunity:!1},{id:"001Wj00000xyzrT",name:"RWE",hadOpportunity:!1},{id:"001Wj00000u0eJp",name:"Re-Turn",hadOpportunity:!0},{id:"001Wj00000xyAdg",name:"SGAM La Mondiale",hadOpportunity:!1},{id:"001Wj00000sg2T0",name:"SHEIN",hadOpportunity:!0},{id:"001Wj00000hfaEC",name:"Safran",hadOpportunity:!1},{id:"001Wj00000sonmQ",name:"Sandoz",hadOpportunity:!1},{id:"001Wj00000xz9ik",name:"Savencia",hadOpportunity:!1},{id:"001Wj00000xyGKs",name:"Sodexo",hadOpportunity:!1},{id:"001Wj00000c9oD6",name:"Stripe",hadOpportunity:!0},{id:"001Hp00003kKrS0",name:"Sword Health",hadOpportunity:!0},{id:"001Wj00000soZus",name:"Tate & Lyle",hadOpportunity:!1},{id:"001Wj00000mEEkG",name:"Team Car Care dba Jiffy Lube",hadOpportunity:!0},{id:"001Hp00003kIrN0",name:"Teleperformance",hadOpportunity:!1},{id:"001Wj00000vzG8f",name:"Temu",hadOpportunity:!1},{id:"001Wj00000xy9fz",name:"Tennet Holding",hadOpportunity:!1},{id:"001Wj00000tWwXf",name:"The Est\xE9e Lauder Companies Inc.",hadOpportunity:!1},{id:"001Wj00000Y6DDc",name:"The HEINEKEN Company",hadOpportunity:!1},{id:"001Wj00000tWwYV",name:"The Irish Stock Exchange",hadOpportunity:!1},{id:"001Wj00000xxp7o",name:"Thuga Holding",hadOpportunity:!1},{id:"001Wj00000xyBgC",name:"ThyssenKrupp",hadOpportunity:!1},{id:"001Wj00000tWwYW",name:"Total Produce plc",hadOpportunity:!1},{id:"001Wj00000xxxLU",name:"TotalEnergies",hadOpportunity:!1},{id:"001Wj00000mIBpN",name:"Transworld Business Advisors",hadOpportunity:!0},{id:"001Wj00000mCFs1",name:"Twitter",hadOpportunity:!0},{id:"001Wj00000xV8Vg",name:"UNHCR, the UN Refugee Agency",hadOpportunity:!0},{id:"001Wj00000xxo5I",name:"United Internet",hadOpportunity:!1},{id:"001Wj00000bWIzw",name:"Veolia | Water Tech",hadOpportunity:!1},{id:"001Hp00003kIrDA",name:"Verizon",hadOpportunity:!0},{id:"001Wj00000tWwXd",name:"Virgin Media Ireland Limited",hadOpportunity:!1},{id:"001Wj00000sgaj9",name:"Volkswagon",hadOpportunity:!0},{id:"001Wj00000ZDTG9",name:"Waystone",hadOpportunity:!0},{id:"001Wj00000pB5DX",name:"White Swan Data",hadOpportunity:!0},{id:"001Wj00000xwL2A",name:"Wm. Morrison Supermarkets",hadOpportunity:!1},{id:"001Wj00000mIB6E",name:"Zendesk",hadOpportunity:!0},{id:"001Wj00000S4r49",name:"Zoom",hadOpportunity:!0}]},"olivia.jung@eudia.com":{email:"olivia.jung@eudia.com",name:"Olivia Jung",accounts:[{id:"001Hp00003kIrED",name:"3M",hadOpportunity:!1},{id:"001Hp00003kIrEK",name:"ADP",hadOpportunity:!1},{id:"001Hp00003kIrEO",name:"AES",hadOpportunity:!0},{id:"001Hp00003kIrEG",name:"AbbVie",hadOpportunity:!1},{id:"001Wj00000mCFrd",name:"Airship Group Inc",hadOpportunity:!0},{id:"001Hp00003kIrET",name:"Albemarle",hadOpportunity:!1},{id:"001Hp00003kIrEZ",name:"Ally Financial",hadOpportunity:!1},{id:"001Hp00003kIrEc",name:"Altria Group",hadOpportunity:!1},{id:"001Hp00003kIrEf",name:"Ameren",hadOpportunity:!1},{id:"001Hp00003kIrEi",name:"American Family Insurance Group",hadOpportunity:!1},{id:"001Wj00000YIOI1",name:"Aptiv",hadOpportunity:!0},{id:"001Hp00003kIrFA",name:"Astellas",hadOpportunity:!0},{id:"001Hp00003kIrFD",name:"Autoliv",hadOpportunity:!1},{id:"001Hp00003kIrDJ",name:"Avery Dennison",hadOpportunity:!1},{id:"001Hp00003kIrDG",name:"Bain",hadOpportunity:!0},{id:"001Hp00003kIrFL",name:"Bank of America",hadOpportunity:!0},{id:"001Hp00003kIrFN",name:"Bath & Body Works",hadOpportunity:!1},{id:"001Hp00003kIrFQ",name:"Becton Dickinson",hadOpportunity:!1},{id:"001Hp00003kIrFV",name:"Best Buy",hadOpportunity:!0},{id:"001Hp00003kIrDY",name:"Blackstone",hadOpportunity:!0},{id:"001Hp00003kIrFb",name:"Boeing",hadOpportunity:!0},{id:"001Hp00003kIrFf",name:"BorgWarner",hadOpportunity:!1},{id:"001Hp00003kIrFk",name:"Bristol-Myers Squibb",hadOpportunity:!0},{id:"001Hp00003kIrFo",name:"Burlington Stores",hadOpportunity:!1},{id:"001Wj00000Y6VLn",name:"CHANEL",hadOpportunity:!1},{id:"001Hp00003kIrGK",name:"CHS",hadOpportunity:!0},{id:"001Hp00003kJ9kw",name:"CSL",hadOpportunity:!0},{id:"001Hp00003kIrGq",name:"CVS Health",hadOpportunity:!1},{id:"001Hp00003kIrG7",name:"Cencora (formerly AmerisourceBergen)",hadOpportunity:!1},{id:"001Hp00003kIrGE",name:"Charter Communications",hadOpportunity:!0},{id:"001Hp00003kIrDZ",name:"Ciena",hadOpportunity:!0},{id:"001Hp00003kIrGL",name:"Cintas",hadOpportunity:!1},{id:"001Wj00000c6df9",name:"Clear",hadOpportunity:!0},{id:"001Wj00000eLOI4",name:"Cleveland Clinic",hadOpportunity:!1},{id:"001Hp00003kIrGO",name:"Cleveland-Cliffs",hadOpportunity:!1},{id:"001Hp00003kIrGQ",name:"Coca-Cola",hadOpportunity:!1},{id:"001Hp00003kIrGX",name:"Conagra Brands",hadOpportunity:!1},{id:"001Hp00003kIrGZ",name:"Consolidated Edison",hadOpportunity:!0},{id:"001Wj00000jK5Hl",name:"Crate & Barrel",hadOpportunity:!0},{id:"001Hp00003kIrGo",name:"Cummins",hadOpportunity:!0},{id:"001Hp00003kIrGu",name:"Danaher",hadOpportunity:!1},{id:"001Wj00000bzz9R",name:"Datadog",hadOpportunity:!0},{id:"001Wj00000aZvt9",name:"Dolby",hadOpportunity:!0},{id:"001Hp00003kIrHB",name:"Dominion Energy",hadOpportunity:!1},{id:"001Hp00003kIrHE",name:"Dow",hadOpportunity:!1},{id:"001Hp00003kIrHH",name:"Duke Energy",hadOpportunity:!1},{id:"001Wj00000hkk0j",name:"Etsy",hadOpportunity:!0},{id:"001Hp00003kIrI7",name:"Ford",hadOpportunity:!1},{id:"001Hp00003kIrIL",name:"General Dynamics",hadOpportunity:!1},{id:"001Wj00000ScUQ3",name:"General Electric",hadOpportunity:!1},{id:"001Hp00003kIrIN",name:"General Motors",hadOpportunity:!1},{id:"001Hp00003kIrIS",name:"Gilead Sciences",hadOpportunity:!0},{id:"001Hp00003kIrE8",name:"Graybar Electric",hadOpportunity:!0},{id:"001Hp00003kIrDO",name:"Guardian Life Ins",hadOpportunity:!0},{id:"001Wj00000dvgdb",name:"HealthEquity",hadOpportunity:!0},{id:"001Hp00003kIrJ9",name:"Intuit",hadOpportunity:!0},{id:"001Wj00000aLlyV",name:"J.Crew",hadOpportunity:!0},{id:"001Hp00003kKKMc",name:"JPmorganchase",hadOpportunity:!0},{id:"001Hp00003kIrJI",name:"John Deere",hadOpportunity:!1},{id:"001Hp00003kIrDQ",name:"Jones Lang LaSalle",hadOpportunity:!0},{id:"001Wj00000hfaE1",name:"Lowe",hadOpportunity:!1},{id:"001Hp00003kIrDj",name:"Marsh McLennan",hadOpportunity:!0},{id:"001Hp00003kIrEA",name:"Mastercard",hadOpportunity:!0},{id:"001Wj00000QBapC",name:"Mayo Clinic",hadOpportunity:!1},{id:"001Hp00003kIrD7",name:"McDonald's",hadOpportunity:!1},{id:"001Hp00003kIrD8",name:"Medtronic",hadOpportunity:!0},{id:"001Hp00003kIrKK",name:"Merck",hadOpportunity:!0},{id:"001Hp00003kJ9lG",name:"Meta",hadOpportunity:!0},{id:"001Hp00003kIrKS",name:"Mondelez International",hadOpportunity:!0},{id:"001Hp00003kIrKU",name:"Motorola Solutions",hadOpportunity:!0},{id:"001Wj00000Y6VYj",name:"NBCUniversal",hadOpportunity:!1},{id:"001Wj00000j3QN2",name:"Nasdaq Private Market",hadOpportunity:!1},{id:"001Hp00003kIrCq",name:"Nationwide Insurance",hadOpportunity:!1},{id:"001Wj00000Y6VML",name:"Nestle",hadOpportunity:!1},{id:"001Hp00003kIrLF",name:"Paramount",hadOpportunity:!1},{id:"001Hp00003kIrLO",name:"Pfizer",hadOpportunity:!0},{id:"001Wj00000wzgaP",name:"Philip Morris International",hadOpportunity:!1},{id:"001Hp00003kIrLa",name:"Prudential",hadOpportunity:!1},{id:"001Hp00003kIrLp",name:"Raytheon Technologies",hadOpportunity:!1},{id:"001Hp00003kIrDz",name:"Shopify",hadOpportunity:!0},{id:"001Wj00000eLWPF",name:"Stellantis",hadOpportunity:!1},{id:"001Wj00000iS9AJ",name:"TE Connectivity",hadOpportunity:!0},{id:"001Hp00003kIrMx",name:"Target",hadOpportunity:!1},{id:"001Wj00000PjGDa",name:"The Weir Group PLC",hadOpportunity:!0},{id:"001Hp00003kIrDF",name:"Thermo Fisher Scientific",hadOpportunity:!0},{id:"001Hp00003kIrCw",name:"Toshiba US",hadOpportunity:!0},{id:"001Hp00003kIrNb",name:"Unisys",hadOpportunity:!0},{id:"001Hp00003kIrO7",name:"Wells Fargo",hadOpportunity:!0},{id:"001Wj00000kD7MA",name:"Wellspan Health",hadOpportunity:!0},{id:"001Hp00003kIrOA",name:"Western Digital",hadOpportunity:!0},{id:"001Wj00000kD3s1",name:"White Cap",hadOpportunity:!0}]},"rajeev.patel@eudia.com":{email:"rajeev.patel@eudia.com",name:"Rajeev Patel",accounts:[{id:"001Wj00000fFW35",name:"Alnylam Pharmaceuticals",hadOpportunity:!0},{id:"001Wj00000woNmQ",name:"Beiersdorf",hadOpportunity:!1},{id:"001Wj00000vCOx2",name:"Cambridge Associates",hadOpportunity:!1},{id:"001Wj00000wE56T",name:"Care Vet Health",hadOpportunity:!1},{id:"001Wj00000dIjyB",name:"CareVet, LLC",hadOpportunity:!1},{id:"001Wj00000xZEkY",name:"Modern Treasury",hadOpportunity:!1},{id:"001Wj00000vv2vX",name:"Nextdoor",hadOpportunity:!1}]},"riley.stack@eudia.com":{email:"riley.stack@eudia.com",name:"Riley Stack",accounts:[{id:"001Wj00000XiEDy",name:"Coinbase",hadOpportunity:!0},{id:"001Wj00000YEMa8",name:"Turing",hadOpportunity:!0}]},"sean.boyd@eudia.com":{email:"sean.boyd@eudia.com",name:"Sean Boyd",accounts:[{id:"001Hp00003kIrE9",name:"IQVIA",hadOpportunity:!0}]},"tom.clancy@eudia.com":{email:"tom.clancy@eudia.com",name:"Tom Clancy",accounts:[{id:"001Wj00000pB30V",name:"AIR (Advanced Inhalation Rituals)",hadOpportunity:!0},{id:"001Wj00000qLRqW",name:"ASML",hadOpportunity:!0},{id:"001Wj00000xyA0y",name:"Aegon",hadOpportunity:!1},{id:"001Wj00000xxpcR",name:"Air France-KLM Group",hadOpportunity:!1},{id:"001Wj00000xyIg2",name:"Akzo Nobel",hadOpportunity:!1},{id:"001Wj00000qFynV",name:"Alexion Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000xwuUW",name:"Alstom",hadOpportunity:!1},{id:"001Wj00000xxtL6",name:"Anglo American",hadOpportunity:!1},{id:"001Wj00000syHJt",name:"Aryzta",hadOpportunity:!1},{id:"001Wj00000tWwXq",name:"BAM Ireland",hadOpportunity:!1},{id:"001Wj00000c9oCe",name:"BLDG Management Co., Inc.",hadOpportunity:!0},{id:"001Wj00000hfWN1",name:"Balfour Beatty US",hadOpportunity:!1},{id:"001Wj00000fFuFM",name:"Bank of Ireland",hadOpportunity:!0},{id:"001Wj00000xy23Q",name:"Bayerische Landesbank",hadOpportunity:!1},{id:"001Wj00000tWwXt",name:"Boots",hadOpportunity:!1},{id:"001Wj00000xyIOL",name:"Ceconomy",hadOpportunity:!1},{id:"001Wj00000tWwXx",name:"Chanelle Pharma",hadOpportunity:!1},{id:"001Hp00003kIrD3",name:"Cisco Systems",hadOpportunity:!0},{id:"001Wj00000xyqxq",name:"Computacenter",hadOpportunity:!1},{id:"001Wj00000xy0ss",name:"Constellium",hadOpportunity:!1},{id:"001Wj00000Y6Vk0",name:"Credit Agricole CIB",hadOpportunity:!1},{id:"001Wj00000xwf7G",name:"Daimler Truck Holding",hadOpportunity:!1},{id:"001Wj00000xyaWU",name:"Delivery Hero",hadOpportunity:!1},{id:"001Wj00000mCFsz",name:"Electricity Supply Board",hadOpportunity:!0},{id:"001Wj00000sp0Bl",name:"Ensco PLC",hadOpportunity:!1},{id:"001Wj00000xz374",name:"EssilorLuxottica",hadOpportunity:!1},{id:"001Wj00000hfaDT",name:"Experian",hadOpportunity:!1},{id:"001Wj00000tWwY6",name:"Fineos",hadOpportunity:!1},{id:"001Wj00000mCFsd",name:"Fujitsu",hadOpportunity:!1},{id:"001Wj00000mCFrc",name:"Glanbia",hadOpportunity:!0},{id:"001Wj00000mHuzr",name:"IHRB",hadOpportunity:!1},{id:"001Wj00000xy9Ho",name:"Imperial Brands",hadOpportunity:!1},{id:"001Wj00000sp1nl",name:"Ina Groupa",hadOpportunity:!1},{id:"001Wj00000xz3ev",name:"Infineon",hadOpportunity:!1},{id:"001Wj00000xyMzn",name:"JDE Peet's",hadOpportunity:!1},{id:"001Wj00000hfWN2",name:"Jazz Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000soxsD",name:"Jazz Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000xxtcq",name:"John Lewis Partnership",hadOpportunity:!1},{id:"001Wj00000tWwYo",name:"Just Eat",hadOpportunity:!1},{id:"001Wj00000xz3jl",name:"KfW Group",hadOpportunity:!1},{id:"001Wj00000tWwYD",name:"Ladbrokes",hadOpportunity:!1},{id:"001Wj00000xystC",name:"Lanxess Group",hadOpportunity:!1},{id:"001Wj00000vRNFu",name:"Legal & General",hadOpportunity:!1},{id:"001Wj00000xxgZC",name:"Legrand",hadOpportunity:!1},{id:"001Wj00000Y64qm",name:"Louis Dreyfus Company",hadOpportunity:!1},{id:"001Wj00000xyGRQ",name:"Lufthansa Group",hadOpportunity:!1},{id:"001Wj00000pA6d7",name:"Masdar Future Energy Company",hadOpportunity:!0},{id:"001Wj00000xz0xC",name:"Metro",hadOpportunity:!1},{id:"001Wj00000xzAen",name:"Motability Operations Group",hadOpportunity:!1},{id:"001Wj00000mCFrv",name:"Ornua",hadOpportunity:!1},{id:"001Hp00003kIrLK",name:"Pepsi",hadOpportunity:!1},{id:"001Wj00000qFudS",name:"Pluralsight",hadOpportunity:!1},{id:"001Wj00000xyODc",name:"Puma",hadOpportunity:!1},{id:"001Wj00000iC14Z",name:"RELX",hadOpportunity:!1},{id:"001Wj00000tWwYj",name:"Rabobank",hadOpportunity:!1},{id:"001Wj00000xyU9M",name:"Reckitt Benckiser",hadOpportunity:!1},{id:"001Wj00000xz3bh",name:"Rentokil Initial",hadOpportunity:!1},{id:"001Wj00000sp1hL",name:"SBM Offshore",hadOpportunity:!1},{id:"001Wj00000xybkK",name:"SHV Holdings",hadOpportunity:!1},{id:"001Wj00000xz3gX",name:"SNCF Group",hadOpportunity:!1},{id:"001Wj00000tWwYt",name:"Sage",hadOpportunity:!1},{id:"001Wj00000sGEuO",name:"Sanofi",hadOpportunity:!1},{id:"001Wj00000qL7AG",name:"Seismic",hadOpportunity:!0},{id:"001Wj00000soyhp",name:"Stada Group",hadOpportunity:!1},{id:"001Wj00000xytSg",name:"Standard Chartered",hadOpportunity:!1},{id:"001Wj00000tWwYq",name:"Symantec",hadOpportunity:!1},{id:"001Wj00000pAPW2",name:"Tarmac",hadOpportunity:!0},{id:"001Wj00000xxvA1",name:"Technip Energies",hadOpportunity:!1},{id:"001Wj00000tWwYU",name:"Tegral Building Products",hadOpportunity:!1},{id:"001Wj00000fFuFq",name:"The Boots Group",hadOpportunity:!1},{id:"001Wj00000tWwYk",name:"Three",hadOpportunity:!1},{id:"001Wj00000xy5HP",name:"Trane Technologies",hadOpportunity:!1},{id:"001Wj00000sohCP",name:"Trans Ocean",hadOpportunity:!1},{id:"001Wj00000mCFtO",name:"Uisce Eireann (Irish Water)",hadOpportunity:!0},{id:"001Wj00000xyQ5k",name:"Uniper",hadOpportunity:!1},{id:"001Wj00000xz1GY",name:"Valeo",hadOpportunity:!1},{id:"001Wj00000pBibT",name:"Version1",hadOpportunity:!0},{id:"001Wj00000xy2BT",name:"Vivendi",hadOpportunity:!1},{id:"001Wj00000xyulK",name:"Wacker Chemie",hadOpportunity:!1},{id:"001Wj00000tWwYZ",name:"Wyeth Nutritionals Ireland",hadOpportunity:!1},{id:"001Wj00000mI9qo",name:"XACT Data Discovery",hadOpportunity:!0},{id:"001Wj00000xyq3P",name:"ZF Friedrichshafen",hadOpportunity:!1}]}}},D=class{constructor(r){this.cachedData=null;this.serverUrl=r}async getAccountsForUser(r){return(await this.getAccountsWithProspects(r)).accounts}async getAccountsWithProspects(r){let t=r.toLowerCase().trim(),e=await this.fetchFromServerWithProspects(t);if(e&&(e.accounts.length>0||e.prospects.length>0))return console.log(`[AccountOwnership] Got ${e.accounts.length} active + ${e.prospects.length} prospects from server for ${t}`),e;console.log(`[AccountOwnership] Using static data fallback for ${t}`);let n=this.getAccountsFromStatic(t),s=n.filter(a=>a.hadOpportunity!==!1),i=n.filter(a=>a.hadOpportunity===!1);return{accounts:s,prospects:i}}getAccountsFromStatic(r){if(Pe(r)==="sales_leader"){let i=De(r);if(i.length===0)return console.log(`[AccountOwnership] No direct reports found for sales leader: ${r}`),[];let a=new Map;for(let c of i){let l=E.businessLeads[c];if(l)for(let d of l.accounts)a.has(d.id)||a.set(d.id,{...d,isOwned:!1})}let o=Array.from(a.values()).sort((c,l)=>c.name.localeCompare(l.name));return console.log(`[AccountOwnership] Found ${o.length} static accounts for sales leader ${r} (from ${i.length} direct reports)`),o}let e=E.businessLeads[r],n=e?e.accounts.map(i=>({...i,isOwned:!0})):[],s=$e[r];if(s){let i=ue(s),a=new Set(n.map(c=>c.id));for(let c of i){let l=E.businessLeads[c];if(l)for(let d of l.accounts)a.has(d.id)||(n.push({...d,isOwned:!1}),a.add(d.id))}let o=n.sort((c,l)=>c.name.localeCompare(l.name));return console.log(`[AccountOwnership] Pod-view user ${r} (${s}): ${o.length} static accounts (${e?.accounts.length||0} owned + region)`),o}return e?(console.log(`[AccountOwnership] Found ${e.accounts.length} static accounts for ${r} (own accounts only)`),e.accounts):(console.log(`[AccountOwnership] No static mapping found for: ${r}`),[])}async fetchFromServer(r){let t=await this.fetchFromServerWithProspects(r);return t?t.accounts:null}async fetchFromServerWithProspects(r){let t=`${this.serverUrl}/api/accounts/ownership/${encodeURIComponent(r)}`;console.log(`[AccountOwnership] Fetching accounts from: ${t}`);let e=n=>({id:n.id,name:n.name,type:n.type||"Prospect",hadOpportunity:n.hadOpportunity??!0,website:n.website||void 0,industry:n.industry||void 0});try{let{requestUrl:n}=await import("obsidian"),s=await n({url:t,method:"GET",headers:{Accept:"application/json"},throw:!1});if(console.log(`[AccountOwnership] requestUrl status: ${s.status}`),s.status===200&&s.json?.success){let i=(s.json.accounts||[]).map(e),a=(s.json.prospectAccounts||[]).map(e);return console.log(`[AccountOwnership] requestUrl success: ${i.length} accounts, ${a.length} prospects`),{accounts:i,prospects:a}}console.log("[AccountOwnership] requestUrl returned non-success:",s.status,s.json?.message||"")}catch(n){console.error("[AccountOwnership] requestUrl failed:",n?.message||n)}try{console.log("[AccountOwnership] Trying native fetch fallback...");let n=await fetch(t,{method:"GET",headers:{Accept:"application/json"}});if(console.log(`[AccountOwnership] fetch status: ${n.status}`),n.ok){let s=await n.json();if(s?.success){let i=(s.accounts||[]).map(e),a=(s.prospectAccounts||[]).map(e);return console.log(`[AccountOwnership] fetch success: ${i.length} accounts, ${a.length} prospects`),{accounts:i,prospects:a}}}}catch(n){console.error("[AccountOwnership] Native fetch also failed:",n?.message||n)}return console.warn(`[AccountOwnership] Both requestUrl and fetch failed for ${r}`),null}async getNewAccounts(r,t){let e=await this.getAccountsForUser(r),n=t.map(s=>s.toLowerCase().trim());return e.filter(s=>{let i=s.name.toLowerCase().trim();return!n.some(a=>a===i||a.startsWith(i)||i.startsWith(a))})}findTeamLeader(r){let t=r.toLowerCase().trim();for(let[e,n]of Object.entries(Z))if(n.includes(t))return e;return null}hasUser(r){return r.toLowerCase().trim()in E.businessLeads}getAllBusinessLeads(){return Object.keys(E.businessLeads)}getBusinessLead(r){let t=r.toLowerCase().trim();return E.businessLeads[t]||null}getDataVersion(){return E.version}async getAllAccountsForAdmin(r){let t=r.toLowerCase().trim();if(!P(t))return console.log(`[AccountOwnership] ${t} is not an admin, returning owned accounts only`),this.getAccountsForUser(t);let e=await this.fetchAllAccountsFromServer();if(e&&e.length>0){let n=await this.getAccountsForUser(t),s=new Set(n.map(i=>i.id));return e.map(i=>({...i,isOwned:s.has(i.id)}))}return console.log("[AccountOwnership] Using static data fallback for admin all-accounts"),this.getAllAccountsFromStatic(t)}getAllAccountsFromStatic(r){let t=new Map,e=new Set,n=E.businessLeads[r];if(n)for(let s of n.accounts)e.add(s.id),t.set(s.id,{...s,isOwned:!0});for(let s of Object.values(E.businessLeads))for(let i of s.accounts)t.has(i.id)||t.set(i.id,{...i,isOwned:!1});return Array.from(t.values()).sort((s,i)=>s.name.localeCompare(i.name))}async getCSAccounts(r){let t=r.toLowerCase().trim();console.log(`[AccountOwnership] Fetching CS accounts for: ${t}`);let e=3,n=3e3;for(let i=1;i<=e;i++)try{let{requestUrl:a,Notice:o}=await import("obsidian");console.log(`[AccountOwnership] CS fetch attempt ${i}/${e} for ${t}`);let c=await a({url:`${this.serverUrl}/api/bl-accounts/${encodeURIComponent(t)}`,method:"GET",headers:{Accept:"application/json"},throw:!1});if(console.log(`[AccountOwnership] CS fetch response status: ${c.status}`),c.status===200&&c.json?.success){let l=(c.json.accounts||[]).map(u=>({id:u.id,name:u.name,type:u.customerType||u.type||"Customer",isOwned:!1,hadOpportunity:!0,website:u.website||null,industry:u.industry||null,ownerName:u.ownerName||null,csmName:u.csmName||null})),d=(c.json.prospectAccounts||[]).map(u=>({id:u.id,name:u.name,type:u.customerType||u.type||"Prospect",isOwned:!1,hadOpportunity:!1,website:u.website||null,industry:u.industry||null,ownerName:u.ownerName||null,csmName:u.csmName||null}));if(l.length>0)return console.log(`[AccountOwnership] CS accounts for ${t}: ${l.length} active + ${d.length} prospects`),new o(`Found ${l.length} CS accounts`),{accounts:l,prospects:d};if(console.warn(`[AccountOwnership] CS fetch attempt ${i}: server returned success but 0 accounts (Salesforce not ready)`),i<e){console.log(`[AccountOwnership] Retrying in ${n}ms...`),await new Promise(u=>setTimeout(u,n));continue}}else console.warn(`[AccountOwnership] CS fetch attempt ${i} returned status ${c.status} for ${t}`),i<e&&(console.log(`[AccountOwnership] Retrying in ${n}ms...`),await new Promise(l=>setTimeout(l,n)))}catch(a){console.error(`[AccountOwnership] CS account fetch attempt ${i} failed for ${t}:`,a),i<e&&(console.log(`[AccountOwnership] Retrying in ${n}ms after error...`),await new Promise(o=>setTimeout(o,n)))}console.warn(`[AccountOwnership] Server returned no CS accounts after ${e} attempts. Using static fallback (${k.length} accounts).`);let{Notice:s}=await import("obsidian");return new s(`Loading ${k.length} CS accounts (server warming up)`),{accounts:[...k],prospects:[]}}async fetchAllAccountsFromServer(){try{let{requestUrl:r}=await import("obsidian"),t=await r({url:`${this.serverUrl}/api/accounts/all`,method:"GET",headers:{Accept:"application/json"}});return t.json?.success&&t.json?.accounts?t.json.accounts.map(e=>({id:e.id,name:e.name,type:e.type||"Prospect"})):null}catch(r){return console.log("[AccountOwnership] Server fetch all accounts failed:",r),null}}};var me=[{value:"America/New_York",label:"Eastern Time (ET)"},{value:"America/Chicago",label:"Central Time (CT)"},{value:"America/Denver",label:"Mountain Time (MT)"},{value:"America/Los_Angeles",label:"Pacific Time (PT)"},{value:"Europe/London",label:"London (GMT/BST)"},{value:"Europe/Dublin",label:"Dublin (GMT/IST)"},{value:"Europe/Paris",label:"Central Europe (CET)"},{value:"Europe/Berlin",label:"Berlin (CET)"},{value:"UTC",label:"UTC"}],Me={serverUrl:"https://gtm-wizard.onrender.com",accountsFolder:"Accounts",recordingsFolder:"Recordings",syncOnStartup:!0,autoSyncAfterTranscription:!0,saveAudioFiles:!0,appendTranscript:!0,lastSyncTime:null,cachedAccounts:[],enableSmartTags:!0,showCalendarView:!0,userEmail:"",setupCompleted:!1,calendarConfigured:!1,salesforceConnected:!1,accountsImported:!1,importedAccountCount:0,timezone:"America/New_York",lastAccountRefreshDate:null,archiveRemovedAccounts:!0,syncAccountsOnStartup:!0,sfAutoSyncEnabled:!0,sfAutoSyncIntervalMinutes:15};var R="eudia-calendar-view",M="eudia-setup-view",Q=class extends p.EditorSuggest{constructor(r,t){super(r),this.plugin=t}onTrigger(r,t,e){let n=t.getLine(r.line),s=t.getValue(),i=t.posToOffset(r),a=s.indexOf("---"),o=s.indexOf("---",a+3);if(a===-1||i<a||i>o)return null;let c=n.match(/^account:\s*(.*)$/);if(!c)return null;let l=c[1].trim(),d=n.indexOf(":")+1,u=n.substring(d).match(/^\s*/)?.[0].length||0;return{start:{line:r.line,ch:d+u},end:r,query:l}}getSuggestions(r){let t=r.query.toLowerCase(),e=this.plugin.settings.cachedAccounts;return t?e.filter(n=>n.name.toLowerCase().includes(t)).sort((n,s)=>{let i=n.name.toLowerCase().startsWith(t),a=s.name.toLowerCase().startsWith(t);return i&&!a?-1:a&&!i?1:n.name.localeCompare(s.name)}).slice(0,10):e.slice(0,10)}renderSuggestion(r,t){t.createEl("div",{text:r.name,cls:"suggestion-title"})}selectSuggestion(r,t){this.context&&this.context.editor.replaceRange(r.name,this.context.start,this.context.end)}},ee=class{constructor(r,t,e,n){this.containerEl=null;this.waveformBars=[];this.durationEl=null;this.waveformData=new Array(16).fill(0);this.onPause=r,this.onResume=t,this.onStop=e,this.onCancel=n}show(){if(this.containerEl)return;this.containerEl=document.createElement("div"),this.containerEl.className="eudia-transcription-bar active";let r=document.createElement("div");r.className="eudia-recording-dot",this.containerEl.appendChild(r);let t=document.createElement("div");t.className="eudia-waveform",this.waveformBars=[];for(let i=0;i<16;i++){let a=document.createElement("div");a.className="eudia-waveform-bar",a.style.height="2px",t.appendChild(a),this.waveformBars.push(a)}this.containerEl.appendChild(t),this.durationEl=document.createElement("div"),this.durationEl.className="eudia-duration",this.durationEl.textContent="0:00",this.containerEl.appendChild(this.durationEl);let e=document.createElement("div");e.className="eudia-controls-minimal";let n=document.createElement("button");n.className="eudia-control-btn stop",n.innerHTML='<span class="eudia-stop-icon"></span>',n.title="Stop and summarize",n.onclick=()=>this.onStop(),e.appendChild(n);let s=document.createElement("button");s.className="eudia-control-btn cancel",s.textContent="Cancel",s.onclick=()=>this.onCancel(),e.appendChild(s),this.containerEl.appendChild(e),document.body.appendChild(this.containerEl)}hide(){this.containerEl&&(this.containerEl.remove(),this.containerEl=null,this.waveformBars=[],this.durationEl=null)}updateState(r){if(this.containerEl){if(this.waveformData.shift(),this.waveformData.push(r.audioLevel),this.waveformBars.forEach((t,e)=>{let n=this.waveformData[e]||0,s=Math.max(2,Math.min(24,n*.24));t.style.height=`${s}px`}),this.durationEl){let t=Math.floor(r.duration/60),e=Math.floor(r.duration%60);this.durationEl.textContent=`${t}:${e.toString().padStart(2,"0")}`}this.containerEl.className=r.isPaused?"eudia-transcription-bar paused":"eudia-transcription-bar active"}}showProcessing(){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar processing";let r=document.createElement("div");r.className="eudia-processing-spinner",this.containerEl.appendChild(r);let t=document.createElement("div");t.className="eudia-processing-text",t.textContent="Processing...",this.containerEl.appendChild(t)}showComplete(r){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar complete";let t=document.createElement("div");t.className="eudia-complete-checkmark",this.containerEl.appendChild(t);let e=document.createElement("div");if(e.className="eudia-complete-content",r.summaryPreview){let o=document.createElement("div");o.className="eudia-summary-preview",o.textContent=r.summaryPreview.length>80?r.summaryPreview.substring(0,80)+"...":r.summaryPreview,e.appendChild(o)}let n=document.createElement("div");n.className="eudia-complete-stats-row";let s=Math.floor(r.duration/60),i=Math.floor(r.duration%60);n.textContent=`${s}:${i.toString().padStart(2,"0")} recorded`,r.nextStepsCount>0&&(n.textContent+=` | ${r.nextStepsCount} action${r.nextStepsCount>1?"s":""}`),r.meddiccCount>0&&(n.textContent+=` | ${r.meddiccCount} signals`),e.appendChild(n),this.containerEl.appendChild(e);let a=document.createElement("button");a.className="eudia-control-btn close",a.textContent="Dismiss",a.onclick=()=>this.hide(),this.containerEl.appendChild(a),setTimeout(()=>this.hide(),8e3)}};var te=class extends p.Modal{constructor(r,t,e){super(r),this.plugin=t,this.onSelect=e}onOpen(){let{contentEl:r}=this;r.empty(),r.addClass("eudia-account-selector"),r.createEl("h3",{text:"Select Account for Meeting Note"}),this.searchInput=r.createEl("input",{type:"text",placeholder:"Search accounts..."}),this.searchInput.style.cssText="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);",this.resultsContainer=r.createDiv({cls:"eudia-account-results"}),this.resultsContainer.style.cssText="max-height: 300px; overflow-y: auto;",this.updateResults(""),this.searchInput.addEventListener("input",()=>this.updateResults(this.searchInput.value)),this.searchInput.focus()}updateResults(r){this.resultsContainer.empty();let t=this.plugin.settings.cachedAccounts,e=r?t.filter(n=>n.name.toLowerCase().includes(r.toLowerCase())).slice(0,15):t.slice(0,15);if(e.length===0){this.resultsContainer.createDiv({cls:"eudia-no-results",text:"No accounts found"});return}e.forEach(n=>{let s=this.resultsContainer.createDiv({cls:"eudia-account-item",text:n.name});s.onclick=()=>{this.onSelect(n),this.close()}})}onClose(){this.contentEl.empty()}},q=class extends p.Modal{constructor(t,e,n){super(t);this.accountContext=null;this.sessionId=null;this.plugin=e,this.accountContext=n||null}onOpen(){let{contentEl:t}=this;t.empty(),t.addClass("eudia-intelligence-modal");let e=t.createDiv({cls:"eudia-intelligence-header"});e.createEl("h2",{text:this.accountContext?`Ask about ${this.accountContext.name}`:"Ask gtm-brain"}),this.accountContext?e.createEl("p",{text:"Get insights, prep for meetings, or ask about this account.",cls:"eudia-intelligence-subtitle"}):e.createEl("p",{text:"Ask questions about your accounts, deals, or pipeline.",cls:"eudia-intelligence-subtitle"});let n=t.createDiv({cls:"eudia-intelligence-input-container"});this.queryInput=n.createEl("textarea",{placeholder:this.accountContext?`e.g., "What should I know before my next meeting?" or "What's the deal status?"`:`e.g., "Who owns Dolby?" or "What's my late stage pipeline?"`}),this.queryInput.addClass("eudia-intelligence-input"),this.queryInput.rows=3;let i=t.createDiv({cls:"eudia-intelligence-actions"}).createEl("button",{text:"Ask",cls:"eudia-btn-primary"});i.onclick=()=>this.submitQuery(),this.queryInput.onkeydown=d=>{d.key==="Enter"&&!d.shiftKey&&(d.preventDefault(),this.submitQuery())},this.threadContainer=t.createDiv({cls:"eudia-intelligence-thread"}),this.responseContainer=t.createDiv({cls:"eudia-intelligence-response"}),this.responseContainer.style.display="none";let o=t.createDiv({cls:"eudia-intelligence-thread-actions"}).createEl("button",{text:"New conversation",cls:"eudia-btn-secondary"});o.onclick=()=>{this.threadContainer.empty(),this.sessionId=null,this.queryInput.value="",this.queryInput.focus()};let c=t.createDiv({cls:"eudia-intelligence-suggestions"});c.createEl("p",{text:"Suggested:",cls:"eudia-suggestions-label"});let l;if(this.accountContext)l=["What should I know before my next meeting?","Summarize our relationship and deal status","What are the key pain points?"];else{let u=(this.plugin.settings.cachedAccounts||[]).slice(0,3).map(y=>y.name);u.length>=2?l=[`What should I know about ${u[0]} before my next meeting?`,`What's the account history with ${u[1]}?`,"What's my late-stage pipeline?"]:l=["What should I know before my next meeting?","What accounts need attention this week?","What is my late-stage pipeline?"]}l.forEach(d=>{let u=c.createEl("button",{text:d,cls:"eudia-suggestion-btn"});u.onclick=()=>{this.queryInput.value=d,this.submitQuery()}}),setTimeout(()=>this.queryInput.focus(),100)}async submitQuery(){let t=this.queryInput.value.trim();if(!t)return;this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-user"}).setText(t),this.queryInput.value="";let n=this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-loading"}),s=this.accountContext?.name?` about ${this.accountContext.name}`:"";n.setText(`Thinking${s}...`),this.scrollThread();try{let i={query:t,accountId:this.accountContext?.id,accountName:this.accountContext?.name,userEmail:this.plugin.settings.userEmail};this.sessionId&&(i.sessionId=this.sessionId);let a=await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/intelligence/query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(i),throw:!1,contentType:"application/json"});if(n.remove(),a.status>=400){let o=a.json?.error||`Server error (${a.status}). Please try again.`;this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-error"}).setText(o),this.scrollThread();return}if(a.json?.success){a.json.sessionId&&(this.sessionId=a.json.sessionId);let o=a.json.answer||"",c=[],l=o.match(/---\s*\n\s*You might also ask:\s*\n((?:\d+\.\s*.+\n?)+)/i);if(l){o=o.substring(0,o.indexOf(l[0])).trim();let f=l[1].trim().split(`
`);for(let w of f){let C=w.replace(/^\d+\.\s*/,"").trim();C.length>5&&c.push(C)}}let d=this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-ai"}),u=d.createDiv({cls:"eudia-intelligence-answer"});if(u.innerHTML=this.formatResponse(o),a.json.context){let f=a.json.context,w=[];f.accountName&&w.push(f.accountName),f.opportunityCount>0&&w.push(`${f.opportunityCount} opps`),f.hasNotes&&w.push("notes"),f.hasCustomerBrain&&w.push("history");let C=f.dataFreshness==="cached"||f.dataFreshness==="session-cached"?" (cached)":"";w.length&&d.createDiv({cls:"eudia-intelligence-context-info"}).setText(`${w.join(" \u2022 ")}${C}`)}if(c.length>0){let f=d.createDiv({cls:"eudia-suggestions-inline"});for(let w of c.slice(0,3)){let C=f.createEl("button",{text:w,cls:"eudia-suggestion-chip-inline"});C.onclick=()=>{this.queryInput.value=w,this.submitQuery()}}}let y=d.createDiv({cls:"eudia-feedback-row"}),m=y.createEl("button",{text:"\u2191 Helpful",cls:"eudia-feedback-btn"}),h=y.createEl("button",{text:"\u2193 Not helpful",cls:"eudia-feedback-btn"}),g=async(f,w,C)=>{w.disabled=!0,w.style.fontWeight="600",w.style.color=f==="helpful"?"var(--text-success)":"var(--text-error)",C.style.display="none";try{await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/intelligence/feedback`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:t,answerSnippet:o.substring(0,300),accountName:this.accountContext?.name||"",accountId:this.accountContext?.id||"",userEmail:this.plugin.settings.userEmail,sessionId:this.sessionId||"",rating:f}),throw:!1})}catch{}};m.onclick=()=>g("helpful",m,h),h.onclick=()=>g("not_helpful",h,m)}else{let o=a.json?.error||"Could not get an answer. Try rephrasing your question.";this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-error"}).setText(o)}this.scrollThread()}catch(i){n.remove(),console.error("[GTM Brain] Intelligence query error:",i);let a="Unable to connect. Please check your internet connection and try again.";i?.message?.includes("timeout")?a="Request timed out. The server may be busy - please try again.":(i?.message?.includes("network")||i?.message?.includes("fetch"))&&(a="Network error. Please check your connection and try again."),this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-error"}).setText(a),this.scrollThread()}}scrollThread(){this.threadContainer.scrollTop=this.threadContainer.scrollHeight}formatResponse(t){let e=t;return e=e.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu,""),e=e.replace(/\n{3,}/g,`

`),e=e.replace(/^([•\-]\s+.+)\n\n(?=[•\-]\s+)/gm,`$1
`),e=e.replace(/^(#{2,3}\s+.+)\n\n/gm,`$1
`),e=e.replace(/^#{1,3}\s+.+\n+(?=#{1,3}\s|\s*$)/gm,""),e=e.replace(/^#{2,3}\s+(.+)$/gm,'</p><h3 class="eudia-intel-header">$1</h3><p>'),e=e.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>"),e=e.replace(/^-\s+\[\s*\]\s+(.+)$/gm,'<li class="eudia-intel-todo">$1</li>'),e=e.replace(/^-\s+\[x\]\s+(.+)$/gm,'<li class="eudia-intel-done">$1</li>'),e=e.replace(/^[•\-]\s+(.+)$/gm,"<li>$1</li>"),e=e.replace(/(<li[^>]*>.*?<\/li>\s*)+/g,'<ul class="eudia-intel-list">$&</ul>'),e=e.replace(/\n\n/g,"</p><p>"),e=e.replace(/\n/g,"<br>"),e=e.replace(/<p>\s*(<ul)/g,"$1"),e=e.replace(/<\/ul>\s*<\/p>/g,"</ul>"),e=e.replace(/<p>\s*(<h3)/g,"$1"),e=e.replace(/<\/h3>\s*<\/p>/g,"</h3>"),e=e.replace(/<\/li>\s*<br>\s*<li/g,"</li><li"),e=e.replace(/<p>\s*<\/p>/g,""),e=e.replace(/<p>\s*<br>\s*<\/p>/g,""),e=e.replace(/(<br>\s*){2,}/g,""),e=e.replace(/<\/h3>\s*<br>/g,"</h3>"),e=e.replace(/<br>\s*<h3/g,"<h3"),e=e.replace(/<br>\s*<ul/g,"<ul"),e=e.replace(/<\/ul>\s*<br>/g,"</ul>"),e=e.replace(/^(<br>)+|(<br>)+$/g,""),e="<p>"+e+"</p>",e=e.replace(/<p><\/p>/g,""),e}onClose(){this.contentEl.empty()}};var ne=class extends p.ItemView{constructor(t,e){super(t);this.emailInput=null;this.pollInterval=null;this.plugin=e,this.accountOwnershipService=new D(e.settings.serverUrl),this.steps=[{id:"calendar",title:"Connect Your Calendar",description:"View your meetings and create notes with one click",status:"pending"},{id:"salesforce",title:"Connect to Salesforce",description:"Sync notes and access your accounts",status:"pending"},{id:"transcribe",title:"Ready to Transcribe",description:"Record and summarize meetings automatically",status:"pending"}]}getViewType(){return M}getDisplayText(){return"Setup"}getIcon(){return"settings"}async onOpen(){await this.checkExistingStatus(),await this.render()}async onClose(){this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null)}async checkExistingStatus(){if(this.plugin.settings.userEmail){this.steps[0].status="complete";try{(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0&&(this.steps[1].status="complete",this.plugin.settings.salesforceConnected=!0)}catch{}if(this.plugin.settings.accountsImported){let e=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(a=>a.children!==void 0)||[];e.length>0?(this.steps[2].status="complete",console.log(`[Eudia] Vault reopen: ${e.length} account folders verified`)):(console.warn("[Eudia] accountsImported=true but 0 account folders found \u2014 resetting for re-import"),this.plugin.settings.accountsImported=!1,this.plugin.settings.importedAccountCount=0,await this.plugin.saveSettings());try{let a=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");a&&await this.plugin.app.vault.delete(a)}catch{}let n=this.plugin.settings.userEmail,i=(this.plugin.settings.cachedAccounts||[]).filter(a=>a.id&&String(a.id).startsWith("001"));if(n&&i.length>0){let a=this.plugin.settings.accountsFolder||"Accounts",o=!1;for(let c of i.slice(0,5)){let l=(c.name||"").replace(/[<>:"/\\|?*]/g,"_").trim(),d=`${a}/${l}/Contacts.md`,u=this.plugin.app.vault.getAbstractFileByPath(d);if(u instanceof p.TFile&&!this.plugin.app.metadataCache.getFileCache(u)?.frontmatter?.enriched_at){o=!0;break}}o&&(console.log("[Eudia Setup] Accounts need enrichment \u2014 triggering on vault reopen..."),setTimeout(async()=>{try{let c=i.map(l=>({id:l.id,name:l.name,type:"",isOwned:!1,hadOpportunity:!0,website:null,industry:null}));await this.plugin.enrichAccountFolders(c),console.log(`[Eudia] Vault-reopen enrichment complete: ${c.length} accounts enriched`)}catch(c){console.log("[Eudia] Vault-reopen enrichment failed (will retry next open):",c)}},3e3))}}else{console.log("[Eudia Setup] Email set but accounts not imported \u2014 auto-retrying import...");let t=this.plugin.app.workspace.leftSplit,e=t?.collapsed;try{let n=this.plugin.settings.userEmail,s=P(n)?"admin":L(n)?"cs":"bl",i=[],a=[];if(console.log(`[Eudia Setup] Auto-retry for ${n} (group: ${s})`),s==="cs")i=[...k],console.log(`[Eudia Setup] Auto-retry CS: using ${i.length} static accounts`);else if(s==="admin")i=await this.accountOwnershipService.getAllAccountsForAdmin(n);else{let o=await this.accountOwnershipService.getAccountsWithProspects(n);i=o.accounts,a=o.prospects}if(i.length>0||a.length>0){if(t&&!e&&t.collapse(),s==="admin"?await this.plugin.createAdminAccountFolders(i):(await this.plugin.createTailoredAccountFolders(i,{}),a.length>0&&await this.plugin.createProspectAccountFiles(a)),H(n))try{await this.plugin.createCSManagerDashboard(n,i)}catch{}this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=i.length+a.length,await this.plugin.saveSettings(),this.steps[2].status="complete";try{let o=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");o&&await this.plugin.app.vault.delete(o)}catch{}t&&!e&&t.expand(),console.log(`[Eudia Setup] Auto-retry imported ${i.length} accounts for ${n}`),new p.Notice(`Enriching ${i.length} accounts with Salesforce contacts...`);try{let o=s==="cs"?i:[...i,...a];await this.plugin.enrichAccountFolders(o),new p.Notice(`${i.length} accounts loaded and enriched!`),console.log("[Eudia Setup] Auto-retry enrichment complete")}catch(o){console.log("[Eudia Setup] Auto-retry enrichment failed:",o),new p.Notice(`${i.length} accounts imported! Contacts will populate on next open.`)}}else console.warn(`[Eudia Setup] Auto-retry returned 0 accounts for ${n}. Server may still be starting.`),t&&!e&&t.expand()}catch(n){console.error("[Eudia Setup] Auto-retry account import failed:",n),t&&!e&&t.expand()}}}}getCompletionPercentage(){let t=this.steps.filter(e=>e.status==="complete").length;return Math.round(t/this.steps.length*100)}async render(){let t=this.containerEl.children[1];t.empty(),t.addClass("eudia-setup-view"),this.renderHeader(t),this.renderSteps(t),this.renderFooter(t)}renderHeader(t){let e=t.createDiv({cls:"eudia-setup-header"}),n=e.createDiv({cls:"eudia-setup-title-section"});n.createEl("h1",{text:"Welcome to Eudia Sales Vault",cls:"eudia-setup-main-title"}),n.createEl("p",{text:"Complete these steps to transcribe and summarize meetings -- capturing objections, next steps, and pain points to drive better client outcomes and smarter selling.",cls:"eudia-setup-subtitle"});let s=e.createDiv({cls:"eudia-setup-progress-section"}),i=this.getCompletionPercentage(),a=s.createDiv({cls:"eudia-setup-progress-label"});a.createSpan({text:"Setup Progress"}),a.createSpan({text:`${i}%`,cls:"eudia-setup-progress-value"});let c=s.createDiv({cls:"eudia-setup-progress-bar"}).createDiv({cls:"eudia-setup-progress-fill"});c.style.width=`${i}%`}renderSteps(t){let e=t.createDiv({cls:"eudia-setup-steps-container"});this.renderCalendarStep(e),this.renderSalesforceStep(e),this.renderTranscribeStep(e)}renderCalendarStep(t){let e=this.steps[0],n=t.createDiv({cls:`eudia-setup-step-card ${e.status}`}),s=n.createDiv({cls:"eudia-setup-step-header"}),i=s.createDiv({cls:"eudia-setup-step-number"});i.setText(e.status==="complete"?"":"1"),e.status==="complete"&&i.addClass("eudia-step-complete");let a=s.createDiv({cls:"eudia-setup-step-info"});a.createEl("h3",{text:e.title}),a.createEl("p",{text:e.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(e.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:`Connected as ${this.plugin.settings.userEmail}`});else{let c=o.createDiv({cls:"eudia-setup-input-group"});this.emailInput=c.createEl("input",{type:"email",placeholder:"yourname@eudia.com",cls:"eudia-setup-input"}),this.plugin.settings.userEmail&&(this.emailInput.value=this.plugin.settings.userEmail);let l=c.createEl("button",{text:"Connect",cls:"eudia-setup-btn primary"});l.onclick=async()=>{await this.handleCalendarConnect()},this.emailInput.onkeydown=async d=>{d.key==="Enter"&&await this.handleCalendarConnect()},o.createDiv({cls:"eudia-setup-validation-message"}),o.createEl("p",{cls:"eudia-setup-help-text",text:"Your calendar syncs automatically via Microsoft 365. We use your email to identify your meetings."})}}async handleCalendarConnect(){if(!this.emailInput)return;let t=this.emailInput.value.trim().toLowerCase(),e=this.containerEl.querySelector(".eudia-setup-validation-message");if(!t){e&&(e.textContent="Please enter your email",e.className="eudia-setup-validation-message error");return}if(!t.endsWith("@eudia.com")){e&&(e.textContent="Please use your @eudia.com email address",e.className="eudia-setup-validation-message error");return}e&&(e.textContent="Validating...",e.className="eudia-setup-validation-message loading");try{let n=await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${encodeURIComponent(t)}`,method:"GET",throw:!1});if(n.status===200&&n.json?.authorized){this.plugin.settings.userEmail=t,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),this.steps[0].status="complete",new p.Notice("Calendar connected successfully!"),e&&(e.textContent="Importing your accounts...",e.className="eudia-setup-validation-message loading");let s=this.plugin.app.workspace.leftSplit,i=s?.collapsed;s&&!i&&s.collapse();try{let a,o=[],c=P(t)?"admin":L(t)?"cs":"bl";if(console.log(`[Eudia] User group detected: ${c} for ${t}`),c==="cs"){if(console.log(`[Eudia] CS user detected \u2014 loading ${k.length} accounts from static data (instant, no server needed)`),a=[...k],o=[],e&&(e.textContent=`Loading ${a.length} Customer Success accounts...`),await this.plugin.createTailoredAccountFolders(a,{}),H(t))try{await this.plugin.createCSManagerDashboard(t,a)}catch(u){console.error("[Eudia] CS Manager dashboard creation failed (non-blocking):",u)}let d=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(u=>u.children!==void 0)||[];d.length>0?(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=a.length,console.log(`[Eudia] CS accounts verified: ${d.length} folders created`)):(console.warn(`[Eudia] CS folder creation may have failed \u2014 ${d.length} folders found. Keeping accountsImported=false for retry.`),this.plugin.settings.accountsImported=!1),await this.plugin.saveSettings();try{let u=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");u&&await this.plugin.app.vault.delete(u)}catch{}console.log(`[Eudia] CS accounts created: ${a.length} folders from static data`),e&&(e.textContent=`Enriching ${a.length} accounts with Salesforce contacts...`),new p.Notice(`Enriching ${a.length} accounts with contacts from Salesforce...`),console.log(`[Eudia] Starting synchronous enrichment for ${a.length} CS accounts...`);try{await this.plugin.enrichAccountFolders(a),console.log("[Eudia] Synchronous enrichment complete"),new p.Notice(`${a.length} accounts loaded with contacts from Salesforce!`),e&&(e.textContent=`${a.length} accounts loaded and enriched with Salesforce contacts!`)}catch(u){console.log("[Eudia] Synchronous enrichment failed, will retry in background:",u),new p.Notice(`${a.length} accounts loaded! Contacts will populate shortly...`);let y=t,m=[5e3,2e4,6e4],h=async g=>{let f=m[g];if(f!==void 0){await new Promise(w=>setTimeout(w,f));try{await this.plugin.enrichAccountFolders(a),console.log(`[Eudia] Background enrichment retry ${g+1} succeeded`)}catch{return h(g+1)}}};h(0)}}else if(c==="admin"){if(console.log("[Eudia] Admin user detected - importing all accounts"),a=await this.accountOwnershipService.getAllAccountsForAdmin(t),a.length>0){e&&(e.textContent=`Creating ${a.length} account folders...`),await this.plugin.createAdminAccountFolders(a);let d=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(y=>y.children!==void 0)||[];d.length>0?(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=a.length,console.log(`[Eudia] Admin accounts verified: ${d.length} folders created`)):(console.warn("[Eudia] Admin folder creation may have failed \u2014 keeping accountsImported=false for retry"),this.plugin.settings.accountsImported=!1),await this.plugin.saveSettings();try{let y=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");y&&await this.plugin.app.vault.delete(y)}catch{}new p.Notice(`Imported ${a.length} accounts! Enriching with Salesforce data...`);let u=a.filter(y=>y.id&&y.id.startsWith("001"));if(u.length>0){e&&(e.textContent=`Enriching ${u.length} accounts with Salesforce contacts...`);try{await this.plugin.enrichAccountFolders(u),new p.Notice(`${a.length} accounts loaded and enriched with Salesforce data!`),console.log(`[Eudia] Admin/exec synchronous enrichment complete: ${u.length} accounts`),e&&(e.textContent=`${a.length} accounts loaded and enriched!`)}catch(y){console.log("[Eudia] Admin/exec synchronous enrichment failed, will retry on next open:",y),new p.Notice(`${a.length} accounts imported! Contacts will populate on next vault open.`);let m=[5e3,2e4,6e4],h=async g=>{let f=m[g];if(f!==void 0){await new Promise(w=>setTimeout(w,f));try{await this.plugin.enrichAccountFolders(u),console.log(`[Eudia] Admin/exec background enrichment retry ${g+1} succeeded`)}catch{return h(g+1)}}};h(0)}}}}else{let l=await this.accountOwnershipService.getAccountsWithProspects(t);if(a=l.accounts,o=l.prospects,a.length>0||o.length>0){e&&(e.textContent=`Creating ${a.length} account folders...`),await this.plugin.createTailoredAccountFolders(a,{}),o.length>0&&await this.plugin.createProspectAccountFiles(o);let u=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(m=>m.children!==void 0)||[];u.length>0?(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=a.length+o.length,console.log(`[Eudia] BL accounts verified: ${u.length} folders created`)):(console.warn("[Eudia] BL folder creation may have failed \u2014 keeping accountsImported=false for retry"),this.plugin.settings.accountsImported=!1),await this.plugin.saveSettings();try{let m=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");m&&await this.plugin.app.vault.delete(m)}catch{}new p.Notice(`Imported ${a.length} active accounts + ${o.length} prospects!`);let y=[...a,...o];setTimeout(async()=>{try{await this.plugin.enrichAccountFolders(y)}catch(m){console.log("[Eudia] Background enrichment skipped:",m)}},500)}else{console.warn(`[Eudia] No accounts returned for ${t} \u2014 auto-retrying...`);let d=!1;for(let u=1;u<=3;u++){e&&(e.textContent=`Server warming up... retrying in 10s (attempt ${u}/3)`,e.className="eudia-setup-validation-message warning"),await new Promise(y=>setTimeout(y,1e4));try{let y=await this.plugin.accountOwnershipService.getAccountsWithProspects(t);if(y.accounts.length>0||y.prospects.length>0){a=y.accounts,o=y.prospects,e&&(e.textContent=`Creating ${a.length} account folders...`),await this.plugin.createTailoredAccountFolders(a,{}),o.length>0&&await this.plugin.createProspectAccountFiles(o),(this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(g=>g.children!==void 0)||[]).length>0&&(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=a.length+o.length),await this.plugin.saveSettings(),new p.Notice(`Imported ${a.length} accounts + ${o.length} prospects!`),d=!0;break}}catch(y){console.warn(`[Eudia] Retry ${u} failed:`,y)}}d||(e&&(e.textContent="Could not load accounts after 3 attempts. Close this window, wait 1 minute, then re-open Obsidian and try again.",e.className="eudia-setup-validation-message error"),new p.Notice("Account import failed after retries. Wait 1 minute and try again."))}}}catch(a){console.error("[Eudia] Account import failed:",a),e&&(e.textContent="Account import failed. Please try again.",e.className="eudia-setup-validation-message error"),new p.Notice("Account import failed \u2014 please try again.")}finally{s&&!i&&s.expand()}await this.render()}else e&&(e.innerHTML=`<strong>${t}</strong> is not authorized for calendar access. Contact your admin.`,e.className="eudia-setup-validation-message error")}catch{e&&(e.textContent="Connection failed. Please try again.",e.className="eudia-setup-validation-message error")}}renderSalesforceStep(t){let e=this.steps[1],n=t.createDiv({cls:`eudia-setup-step-card ${e.status}`}),s=n.createDiv({cls:"eudia-setup-step-header"}),i=s.createDiv({cls:"eudia-setup-step-number"});i.setText(e.status==="complete"?"":"2"),e.status==="complete"&&i.addClass("eudia-step-complete");let a=s.createDiv({cls:"eudia-setup-step-info"});a.createEl("h3",{text:e.title}),a.createEl("p",{text:e.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(!this.plugin.settings.userEmail){o.createDiv({cls:"eudia-setup-disabled-message",text:"Complete the calendar step first"});return}if(e.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:"Salesforce connected successfully"}),this.plugin.settings.accountsImported&&o.createDiv({cls:"eudia-setup-account-status",text:`${this.plugin.settings.importedAccountCount} accounts imported`});else{let l=o.createDiv({cls:"eudia-setup-button-group"}).createEl("button",{text:"Connect to Salesforce",cls:"eudia-setup-btn primary"}),d=o.createDiv({cls:"eudia-setup-sf-status"});l.onclick=async()=>{let u=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(u,"_blank"),d.textContent="Complete the login in the popup window...",d.className="eudia-setup-sf-status loading",new p.Notice("Complete the Salesforce login in the popup window",5e3),this.startSalesforcePolling(d)},o.createEl("p",{cls:"eudia-setup-help-text",text:"This links your Obsidian notes to your Salesforce account for automatic sync."})}}startSalesforcePolling(t){this.pollInterval&&window.clearInterval(this.pollInterval);let e=0,n=60;this.pollInterval=window.setInterval(async()=>{e++;try{(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),this.steps[1].status="complete",new p.Notice("Salesforce connected successfully!"),await this.importTailoredAccounts(t),await this.render()):e>=n&&(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),t.textContent="Connection timed out. Please try again.",t.className="eudia-setup-sf-status error")}catch{}},5e3)}async importTailoredAccounts(t){t.textContent="Importing your accounts...",t.className="eudia-setup-sf-status loading";try{let e=this.plugin.settings.userEmail,n=P(e)?"admin":L(e)?"cs":"bl";console.log(`[Eudia SF Import] Importing for ${e} (group: ${n})`);let s,i=[];if(n==="cs"){console.log("[Eudia SF Import] CS user SF Connect \u2014 fetching live data from Salesforce..."),t.textContent="Syncing with Salesforce for latest account data...";try{let m=await this.accountOwnershipService.getCSAccounts(e);s=m.accounts,i=m.prospects,console.log(`[Eudia SF Import] CS server sync: ${s.length} accounts (with real SF IDs + CSM data)`)}catch{if(this.plugin.settings.accountsImported){t.textContent="Salesforce connected! Account folders already loaded. Enrichment will retry later.",t.className="eudia-setup-sf-status success",this.steps[1].status="complete";return}s=[...k],console.log(`[Eudia SF Import] CS server unavailable \u2014 using ${s.length} static accounts`)}}else if(n==="admin")console.log("[Eudia] Admin user detected - importing all accounts"),t.textContent="Admin detected - importing all accounts...",s=await this.accountOwnershipService.getAllAccountsForAdmin(e);else{let m=await this.accountOwnershipService.getAccountsWithProspects(e);s=m.accounts,i=m.prospects}if(s.length===0&&i.length===0){t.textContent="No accounts found for your email. Contact your admin.",t.className="eudia-setup-sf-status warning";return}t.textContent=`Creating ${s.length} account folders...`;let a=this.plugin.app.workspace.leftSplit,o=a?.collapsed;if(a&&!o&&a.collapse(),P(e)?await this.plugin.createAdminAccountFolders(s):(await this.plugin.createTailoredAccountFolders(s,{}),i.length>0&&await this.plugin.createProspectAccountFiles(i)),H(e))try{await this.plugin.createCSManagerDashboard(e,s)}catch{}this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length+i.length,await this.plugin.saveSettings();try{let m=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");m&&await this.plugin.app.vault.delete(m)}catch{}a&&!o&&a.expand(),this.steps[2].status="complete";let c=s.filter(m=>m.isOwned!==!1).length,l=s.filter(m=>m.isOwned===!1).length;n==="admin"&&l>0?t.textContent=`${c} owned + ${l} view-only accounts imported! Enriching...`:t.textContent=`${s.length} active + ${i.length} prospect accounts imported! Enriching...`,t.className="eudia-setup-sf-status success";let d=[...s,...i],u=e,y=n;setTimeout(async()=>{try{let m=d.filter(h=>h.id&&h.id.startsWith("001"));if(m.length>0?(t.textContent=`Enriching ${m.length} accounts with Salesforce data...`,await this.plugin.enrichAccountFolders(m),t.textContent=`${s.length} accounts imported, ${m.length} enriched with Salesforce data`):t.textContent=`${s.length} accounts imported (enrichment requires Salesforce IDs)`,y==="cs"&&H(u))try{console.log("[Eudia SF Import] Regenerating CS Manager dashboard with live CSM data..."),await this.plugin.createCSManagerDashboard(u,s),console.log("[Eudia SF Import] CS Manager dashboard updated with CSM assignments")}catch(h){console.error("[Eudia SF Import] Dashboard regeneration failed (non-blocking):",h)}}catch(m){console.log("[Eudia] Background enrichment skipped:",m),t.textContent=`${s.length+i.length} accounts imported (enrichment will retry on next launch)`}},500)}catch{t.textContent="Failed to import accounts. Please try again.",t.className="eudia-setup-sf-status error";let n=this.plugin.app.workspace.leftSplit;if(n?.collapsed===!1)try{n.expand()}catch{}}}renderTranscribeStep(t){let e=this.steps[2],n=t.createDiv({cls:`eudia-setup-step-card ${e.status}`}),s=n.createDiv({cls:"eudia-setup-step-header"}),i=s.createDiv({cls:"eudia-setup-step-number"});i.setText(e.status==="complete"?"":"3"),e.status==="complete"&&i.addClass("eudia-step-complete");let a=s.createDiv({cls:"eudia-setup-step-info"});a.createEl("h3",{text:e.title}),a.createEl("p",{text:e.description});let o=n.createDiv({cls:"eudia-setup-step-content"}),c=o.createDiv({cls:"eudia-setup-instructions"}),l=c.createDiv({cls:"eudia-setup-instruction"});l.createSpan({cls:"eudia-setup-instruction-icon",text:"\u{1F399}"}),l.createSpan({text:"Click the microphone icon in the left sidebar during a call"});let d=c.createDiv({cls:"eudia-setup-instruction"});d.createSpan({cls:"eudia-setup-instruction-icon",text:"\u2328"}),d.createSpan({text:'Or press Cmd/Ctrl+P and search for "Transcribe Meeting"'});let u=c.createDiv({cls:"eudia-setup-instruction"});u.createSpan({cls:"eudia-setup-instruction-icon",text:"\u{1F4DD}"}),u.createSpan({text:"AI will summarize and extract key insights automatically"}),e.status!=="complete"&&o.createEl("p",{cls:"eudia-setup-help-text muted",text:"This step completes automatically after connecting to Salesforce and importing accounts."})}renderFooter(t){let e=t.createDiv({cls:"eudia-setup-footer"});if(this.steps.every(i=>i.status==="complete")){let i=e.createDiv({cls:"eudia-setup-completion"});i.createEl("h2",{text:"\u{1F389} You're all set!"}),i.createEl("p",{text:"Your sales vault is ready. Click below to start using Eudia."});let a=e.createEl("button",{text:"Open Calendar \u2192",cls:"eudia-setup-btn primary large"});a.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(M),await this.plugin.activateCalendarView()}}else{let i=e.createEl("button",{text:"Skip Setup (I'll do this later)",cls:"eudia-setup-btn secondary"});i.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(M),new p.Notice("You can complete setup anytime from Settings \u2192 Eudia Sync")}}let s=e.createEl("a",{text:"Advanced Settings",cls:"eudia-setup-settings-link"});s.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")}}},ae=class extends p.ItemView{constructor(t,e){super(t);this.refreshInterval=null;this.lastError=null;this.plugin=e}getViewType(){return R}getDisplayText(){return"Calendar"}getIcon(){return"calendar"}async onOpen(){await this.render(),this.refreshInterval=window.setInterval(()=>this.render(),5*60*1e3)}async onClose(){this.refreshInterval&&window.clearInterval(this.refreshInterval)}async render(){let t=this.containerEl.children[1];if(t.empty(),t.addClass("eudia-calendar-view"),!this.plugin.settings.userEmail){this.renderSetupPanel(t);return}this.renderHeader(t),await this.renderCalendarContent(t)}renderHeader(t){let e=t.createDiv({cls:"eudia-calendar-header"}),n=e.createDiv({cls:"eudia-calendar-title-row"});n.createEl("h4",{text:"Your Meetings"});let s=n.createDiv({cls:"eudia-calendar-actions"}),i=s.createEl("button",{cls:"eudia-btn-icon",text:"\u21BB"});i.title="Refresh (fetches latest from calendar)",i.onclick=async()=>{i.addClass("spinning"),this._forceRefresh=!0,await this.render(),i.removeClass("spinning")};let a=s.createEl("button",{cls:"eudia-btn-icon",text:"\u2699"});a.title="Settings",a.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")};let o=e.createDiv({cls:"eudia-status-bar"});this.renderConnectionStatus(o)}async renderConnectionStatus(t){let e={server:"connecting",calendar:"not_configured",salesforce:"not_configured"},n=this.plugin.settings.serverUrl,s=this.plugin.settings.userEmail;try{(await(0,p.requestUrl)({url:`${n}/api/health`,method:"GET",throw:!1})).status===200?(e.server="connected",e.serverMessage="Server online"):(e.server="error",e.serverMessage="Server unavailable")}catch{e.server="error",e.serverMessage="Cannot reach server"}if(s&&e.server==="connected")try{let d=await(0,p.requestUrl)({url:`${n}/api/calendar/validate/${encodeURIComponent(s)}`,method:"GET",throw:!1});d.status===200&&d.json?.authorized?(e.calendar="connected",e.calendarMessage="Calendar synced"):(e.calendar="not_authorized",e.calendarMessage="Not authorized")}catch{e.calendar="error",e.calendarMessage="Error checking access"}if(s&&e.server==="connected")try{let d=await(0,p.requestUrl)({url:`${n}/api/sf/auth/status?email=${encodeURIComponent(s)}`,method:"GET",throw:!1});d.status===200&&d.json?.connected?(e.salesforce="connected",e.salesforceMessage="Salesforce connected"):(e.salesforce="not_configured",e.salesforceMessage="Not connected")}catch{e.salesforce="not_configured"}let i=t.createDiv({cls:"eudia-status-indicators"}),a=i.createSpan({cls:`eudia-status-dot ${e.server}`});a.title=e.serverMessage||"Server";let o=i.createSpan({cls:`eudia-status-dot ${e.calendar}`});o.title=e.calendarMessage||"Calendar";let c=i.createSpan({cls:`eudia-status-dot ${e.salesforce}`});if(c.title=e.salesforceMessage||"Salesforce",t.createDiv({cls:"eudia-status-labels"}).createSpan({cls:"eudia-status-label",text:this.plugin.settings.userEmail}),e.calendar==="not_authorized"){let d=t.createDiv({cls:"eudia-status-warning"});d.innerHTML=`<strong>${s}</strong> is not authorized for calendar access. Contact your admin.`}}async renderCalendarContent(t){let e=t.createDiv({cls:"eudia-calendar-content"}),n=e.createDiv({cls:"eudia-calendar-loading"});n.innerHTML='<div class="eudia-spinner"></div><span>Loading meetings...</span>';try{let s=new $(this.plugin.settings.serverUrl,this.plugin.settings.userEmail,this.plugin.settings.timezone||"America/New_York"),i=this._forceRefresh||!1;this._forceRefresh=!1;let a=await s.getWeekMeetings(i);if(n.remove(),!a.success){this.renderError(e,a.error||"Failed to load calendar");return}let o=Object.keys(a.byDay||{}).sort();if(o.length===0){this.renderEmptyState(e);return}await this.renderCurrentMeeting(e,s);for(let c of o){let l=a.byDay[c];!l||l.length===0||this.renderDaySection(e,c,l)}}catch(s){n.remove(),this.renderError(e,s.message||"Failed to load calendar")}}async renderCurrentMeeting(t,e){try{let n=await e.getCurrentMeeting();if(n.meeting){let s=t.createDiv({cls:"eudia-now-card"});n.isNow?s.createDiv({cls:"eudia-now-badge",text:"\u25CF NOW"}):s.createDiv({cls:"eudia-now-badge soon",text:`In ${n.minutesUntilStart}m`});let i=s.createDiv({cls:"eudia-now-content"});i.createEl("div",{cls:"eudia-now-subject",text:n.meeting.subject}),n.meeting.accountName&&i.createEl("div",{cls:"eudia-now-account",text:n.meeting.accountName});let a=s.createEl("button",{cls:"eudia-now-action",text:"Create Note"});a.onclick=()=>this.createNoteForMeeting(n.meeting)}}catch{}}renderDaySection(t,e,n){let s=t.createDiv({cls:"eudia-calendar-day"});s.createEl("div",{cls:"eudia-calendar-day-header",text:$.getDayName(e)});for(let i of n){let a=s.createDiv({cls:`eudia-calendar-meeting ${i.isCustomerMeeting?"customer":"internal"}`});a.createEl("div",{cls:"eudia-calendar-time",text:$.formatTime(i.start,this.plugin.settings.timezone)});let o=a.createDiv({cls:"eudia-calendar-details"});if(o.createEl("div",{cls:"eudia-calendar-subject",text:i.subject}),i.accountName)o.createEl("div",{cls:"eudia-calendar-account",text:i.accountName});else if(i.attendees&&i.attendees.length>0){let c=i.attendees.slice(0,2).map(l=>l.name||l.email?.split("@")[0]||"Unknown").join(", ");o.createEl("div",{cls:"eudia-calendar-attendees",text:c})}a.onclick=()=>this.createNoteForMeeting(i),a.title="Click to create meeting note"}}renderEmptyState(t){let e=t.createDiv({cls:"eudia-calendar-empty"});e.innerHTML=`
      <div class="eudia-empty-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <p class="eudia-empty-title">No meetings this week</p>
      <p class="eudia-empty-subtitle">Enjoy your focus time!</p>
    `}renderError(t,e){let n=t.createDiv({cls:"eudia-calendar-error"}),s="",i="Unable to load calendar",a="";e.includes("not authorized")||e.includes("403")?(s="\u{1F512}",i="Calendar Access Required",a="Contact your admin to be added to the authorized users list."):e.includes("network")||e.includes("fetch")?(s="\u{1F4E1}",i="Connection Issue",a="Check your internet connection and try again."):(e.includes("server")||e.includes("500"))&&(s="\u{1F527}",i="Server Unavailable",a="The server may be waking up. Try again in 30 seconds."),n.innerHTML=`
      <div class="eudia-error-icon">${s}</div>
      <p class="eudia-error-title">${i}</p>
      <p class="eudia-error-message">${e}</p>
      ${a?`<p class="eudia-error-action">${a}</p>`:""}
    `;let o=n.createEl("button",{cls:"eudia-btn-retry",text:"Try Again"});o.onclick=()=>this.render()}renderSetupPanel(t){let e=t.createDiv({cls:"eudia-calendar-setup-panel"});e.innerHTML=`
      <div class="eudia-setup-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <h3 class="eudia-setup-title">Connect Your Calendar</h3>
      <p class="eudia-setup-desc">Enter your Eudia email to see your meetings and create notes with one click.</p>
    `;let n=e.createDiv({cls:"eudia-setup-input-group"}),s=n.createEl("input",{type:"email",placeholder:"yourname@eudia.com"});s.addClass("eudia-setup-email");let i=n.createEl("button",{cls:"eudia-setup-connect",text:"Connect"}),a=e.createDiv({cls:"eudia-setup-status"});i.onclick=async()=>{let o=s.value.trim().toLowerCase();if(!o||!o.endsWith("@eudia.com")){a.textContent="Please use your @eudia.com email",a.className="eudia-setup-status error";return}i.disabled=!0,i.textContent="Connecting...",a.textContent="";try{if(!(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${o}`,method:"GET"})).json?.authorized){a.innerHTML=`<strong>${o}</strong> is not authorized. Contact your admin to be added.`,a.className="eudia-setup-status error",i.disabled=!1,i.textContent="Connect";return}this.plugin.settings.userEmail=o,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),a.textContent="Connected",a.className="eudia-setup-status success",this.plugin.scanLocalAccountFolders().catch(()=>{}),setTimeout(()=>this.render(),500)}catch(c){let l=c.message||"Connection failed";l.includes("403")?a.innerHTML=`<strong>${o}</strong> is not authorized for calendar access.`:a.textContent=l,a.className="eudia-setup-status error",i.disabled=!1,i.textContent="Connect"}},s.onkeydown=o=>{o.key==="Enter"&&i.click()},e.createEl("p",{cls:"eudia-setup-help",text:"Your calendar syncs automatically via Microsoft 365."})}extractCompanyFromDomain(t){let e=t.toLowerCase().split("."),n=["mail","email","app","portal","crm","www","smtp","sales","support","login","sso","auth","api","my"],s=["com","org","net","io","co","ai","gov","edu","uk","us","de","fr","jp","au","ca"],i=e.filter(o=>!s.includes(o)&&o.length>1);if(i.length===0)return e[0]||"";if(i.length>1&&n.includes(i[0]))return i[1].charAt(0).toUpperCase()+i[1].slice(1);let a=i[i.length-1];return a.charAt(0).toUpperCase()+a.slice(1)}getExternalDomainsFromAttendees(t){if(!t||t.length===0)return[];let e=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com","live.com","msn.com","aol.com","protonmail.com","googlemail.com","mail.com","zoho.com","ymail.com"],n=new Set,s=[];for(let i of t){if(!i.email)continue;let o=i.email.toLowerCase().match(/@([a-z0-9.-]+)/);if(o){let c=o[1];if(c.includes("eudia.com")||e.includes(c)||n.has(c))continue;n.add(c);let l=this.extractCompanyFromDomain(c);l.length>=2&&s.push({domain:c,company:l})}}return s}findBestAccountMatch(t,e,n){let s=this.plugin.settings.accountsFolder||"Accounts",i=this.app.vault.getAbstractFileByPath(s);if(!(i instanceof p.TFolder))return null;let a=[];for(let c of i.children)c instanceof p.TFolder&&a.push(c.name);if(a.length===0)return null;let o=[];for(let{domain:c,company:l}of t){let d=this.findAccountFolder(l),u=d?1:0;o.push({domain:c,company:l,folder:d,score:u})}if(o.sort((c,l)=>l.score-c.score),o.length>0&&o[0].folder){let c=o[0],l=c.folder.split("/").pop()||c.company;return console.log(`[Eudia Calendar] Best domain match: "${c.company}" from ${c.domain} -> ${c.folder}`),{folder:c.folder,accountName:l,source:"domain"}}if(e){let c=this.findAccountFolder(e);if(c){let l=c.split("/").pop()||e;return console.log(`[Eudia Calendar] Server account match: "${e}" -> ${c}`),{folder:c,accountName:l,source:"server"}}}if(n){let c=this.findAccountFolder(n);if(c){let l=c.split("/").pop()||n;return console.log(`[Eudia Calendar] Subject match: "${n}" -> ${c}`),{folder:c,accountName:l,source:"subject"}}}for(let{company:c}of t){let l=a.find(d=>{let u=d.toLowerCase(),y=c.toLowerCase();return u.includes(y)||y.includes(u)});if(l){let d=`${s}/${l}`;return console.log(`[Eudia Calendar] Partial domain match: "${c}" -> ${d}`),{folder:d,accountName:l,source:"domain-partial"}}}return null}extractAccountFromAttendees(t){let e=this.getExternalDomainsFromAttendees(t);if(e.length===0)return null;let n=e[0];return console.log(`[Eudia Calendar] Extracted company "${n.company}" from attendee domain ${n.domain}`),n.company}extractAccountFromSubject(t){if(!t)return null;let e=t.match(/^([^\/]+)\s*\/\s*Eudia|Eudia\s*\/\s*([^\/\-|]+)/i);if(e){let s=(e[1]||e[2]||"").trim();if(s.toLowerCase()!=="eudia")return s}let n=t.match(/^Eudia\s*[-–]\s*([^|]+)|^([^-–]+)\s*[-–]\s*Eudia/i);if(n){let i=(n[1]||n[2]||"").trim().replace(/\s+(Connect|Weekly|Call|Meeting|Intro|Demo|Check\s*in|Sync).*$/i,"").trim();if(i.toLowerCase()!=="eudia"&&i.length>0)return i}if(!t.toLowerCase().includes("eudia")){let s=t.match(/^([^-–|]+)/);if(s){let i=s[1].trim();if(i.length>2&&i.length<50)return i}}return null}findAccountFolder(t){if(!t)return null;let e=this.plugin.settings.accountsFolder||"Accounts",n=this.app.vault.getAbstractFileByPath(e);if(!(n instanceof p.TFolder))return console.log(`[Eudia Calendar] Accounts folder "${e}" not found`),null;let s=t.toLowerCase().trim(),i=[];for(let u of n.children)u instanceof p.TFolder&&i.push(u.name);console.log(`[Eudia Calendar] Searching for "${s}" in ${i.length} folders`);let a=i.find(u=>u.toLowerCase()===s);if(a)return console.log(`[Eudia Calendar] Exact match found: ${a}`),`${e}/${a}`;let o=i.find(u=>u.toLowerCase().startsWith(s));if(o)return console.log(`[Eudia Calendar] Folder starts with match: ${o}`),`${e}/${o}`;let c=i.find(u=>s.startsWith(u.toLowerCase()));if(c)return console.log(`[Eudia Calendar] Search starts with folder match: ${c}`),`${e}/${c}`;let l=i.find(u=>{let y=u.toLowerCase();return y.length>=3&&s.includes(y)});if(l)return console.log(`[Eudia Calendar] Search contains folder match: ${l}`),`${e}/${l}`;let d=i.find(u=>{let y=u.toLowerCase();return s.length>=3&&y.includes(s)});return d?(console.log(`[Eudia Calendar] Folder contains search match: ${d}`),`${e}/${d}`):(console.log(`[Eudia Calendar] No folder match found for "${s}"`),null)}async createNoteForMeeting(t){let e=t.start.split("T")[0],n=this.plugin.settings.eudiaEmail||"",s=P(n),i=(t.attendees||[]).map(v=>v.email).filter(Boolean),a=re(t.subject,i);if(s&&a.isPipelineMeeting&&a.confidence>=60){await this._createPipelineNote(t,e);return}let o=t.subject.replace(/[<>:"/\\|?*]/g,"_").substring(0,50),c=`${e} - ${o}.md`,l=null,d=t.accountName||null,u=null;console.log(`[Eudia Calendar] === Creating note for meeting: "${t.subject}" ===`),console.log(`[Eudia Calendar] Attendees: ${JSON.stringify(t.attendees?.map(v=>v.email)||[])}`);let y=this.getExternalDomainsFromAttendees(t.attendees||[]);console.log(`[Eudia Calendar] External domains found: ${JSON.stringify(y)}`);let m=this.extractAccountFromSubject(t.subject);console.log(`[Eudia Calendar] Subject-extracted name: "${m||"none"}"`);let h=this.findBestAccountMatch(y,t.accountName,m||void 0);if(h&&(l=h.folder,d=h.accountName,console.log(`[Eudia Calendar] Best match (${h.source}): "${d}" -> ${l}`)),!l){let v=this.plugin.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(v)instanceof p.TFolder&&(l=v,console.log(`[Eudia Calendar] No match found, using Accounts root: ${l}`))}if(d){let v=this.plugin.settings.cachedAccounts.find(b=>b.name.toLowerCase()===d?.toLowerCase());v&&(u=v.id,d=v.name,console.log(`[Eudia Calendar] Matched to cached account: ${v.name} (${v.id})`))}let g=l?`${l}/${c}`:c,f=this.app.vault.getAbstractFileByPath(g);if(f instanceof p.TFile){await this.app.workspace.getLeaf().openFile(f);try{let v=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;v?.revealInFolder&&v.revealInFolder(f)}catch{}new p.Notice(`Opened existing note: ${c}`);return}let w=(t.attendees||[]).map(v=>v.name||v.email?.split("@")[0]||"Unknown").slice(0,5).join(", "),C=`---
title: "${t.subject}"
date: ${e}
attendees: [${w}]
account: "${d||""}"
account_id: "${u||""}"
meeting_start: ${t.start}
meeting_type: discovery
sync_to_salesforce: false
clo_meeting: false
source: ""
transcribed: false
---

# ${t.subject}

## Attendees
${(t.attendees||[]).map(v=>`- ${v.name||v.email}`).join(`
`)}

## Pre-Call Notes

*Add any prep notes, context, or questions before the meeting*



---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` \u2192 **"Transcribe Meeting"**

---

`;try{let v=await this.app.vault.create(g,C);await this.app.workspace.getLeaf().openFile(v);try{let b=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;b?.revealInFolder&&b.revealInFolder(v)}catch{}new p.Notice(`Created: ${g}`)}catch(v){console.error("[Eudia Calendar] Failed to create note:",v),new p.Notice(`Could not create note: ${v.message||"Unknown error"}`)}}async _createPipelineNote(t,e){let n=new Date(e+"T00:00:00"),s=String(n.getMonth()+1).padStart(2,"0"),i=String(n.getDate()).padStart(2,"0"),a=String(n.getFullYear()).slice(-2),o=`${s}.${i}.${a}`,c=`Team Pipeline Meeting - ${o}.md`,l="Pipeline Meetings";this.app.vault.getAbstractFileByPath(l)||await this.app.vault.createFolder(l);let u=`${l}/${c}`,y=this.app.vault.getAbstractFileByPath(u);if(y instanceof p.TFile){await this.app.workspace.getLeaf().openFile(y);try{let g=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;g?.revealInFolder&&g.revealInFolder(y)}catch{}new p.Notice(`Opened existing: ${c}`);return}let m=(t.attendees||[]).map(g=>g.name||g.email?.split("@")[0]||"Unknown"),h=`---
title: "Team Pipeline Meeting - ${o}"
date: ${e}
attendees: [${m.slice(0,10).join(", ")}]
meeting_type: pipeline_review
meeting_start: ${t.start}
transcribed: false
---

# Weekly Pipeline Review | ${n.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"})}

## Attendees
${m.map(g=>`- ${g}`).join(`
`)}

---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` \u2192 **"Transcribe Meeting"**

After transcription, this note will be automatically formatted with:
- **Priority Actions** grouped by urgency
- **BL Deal Context** with commit totals
- **Per-BL Account Tables** (Account | Status | Next Action)
- **Growth & Cross-Team Updates**

---

`;try{let g=await this.app.vault.create(u,h);await this.app.workspace.getLeaf().openFile(g);try{let f=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;f?.revealInFolder&&f.revealInFolder(g)}catch{}new p.Notice(`Created pipeline note: ${c}`),console.log(`[Eudia Pipeline] Created pipeline meeting note: ${u}`)}catch(g){console.error("[Eudia Pipeline] Failed to create pipeline note:",g),new p.Notice(`Could not create pipeline note: ${g.message||"Unknown error"}`)}}},V=class extends p.Plugin{constructor(){super(...arguments);this.audioRecorder=null;this.recordingStatusBar=null;this.micRibbonIcon=null;this.liveTranscript="";this.liveTranscriptChunkInterval=null;this.isTranscribingChunk=!1;this.sfSyncStatusBarEl=null;this.sfSyncIntervalId=null}async onload(){await this.loadSettings(),this.transcriptionService=new z(this.settings.serverUrl),this.calendarService=new $(this.settings.serverUrl,this.settings.userEmail,this.settings.timezone||"America/New_York"),this.smartTagService=new J,this.checkForPluginUpdate(),this.registerView(R,t=>new ae(t,this)),this.registerView(M,t=>new ne(t,this)),this.addRibbonIcon("calendar","Open Calendar",()=>this.activateCalendarView()),this.micRibbonIcon=this.addRibbonIcon("microphone","Transcribe Meeting",async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}),this.addRibbonIcon("message-circle","Ask GTM Brain",()=>{this.openIntelligenceQueryForCurrentNote()}),this.registerEvent(this.app.vault.on("create",async t=>{if(!(t instanceof p.TFile)||t.extension!=="md")return;let e=this.settings.accountsFolder||"Accounts";if(!t.path.startsWith(e+"/")||!t.basename.startsWith("Untitled"))return;let n=t.path.split("/");if(n.length<3)return;let s=n[1],i=n.slice(0,2).join("/"),a="",o=["Contacts.md","Note 1.md","Intelligence.md"];for(let f of o){let w=this.app.vault.getAbstractFileByPath(`${i}/${f}`);if(w instanceof p.TFile)try{let v=(await this.app.vault.read(w)).match(/account_id:\s*"?([^"\n]+)"?/);if(v){a=v[1].trim();break}}catch{}}let c=this.app.vault.getAbstractFileByPath(i),l=0;if(c&&c.children)for(let f of c.children){let w=f.name?.match(/^Note\s+(\d+)/i);w&&(l=Math.max(l,parseInt(w[1])))}let d=l+1,u=new Date,y=u.toLocaleDateString("en-US",{month:"short",day:"numeric"}),m=u.toISOString().split("T")[0],h=`Note ${d} - ${y}.md`,g=`---
account: "${s}"
account_id: "${a}"
type: meeting_note
sync_to_salesforce: false
created: ${m}
---

# ${s} - Meeting Note

**Date:** ${y}
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`;try{let f=`${i}/${h}`;await this.app.vault.modify(t,g),await this.app.fileManager.renameFile(t,f),console.log(`[Eudia] Auto-templated: ${f} (account_id: ${a})`)}catch(f){console.warn("[Eudia] Auto-template failed:",f)}})),this.addCommand({id:"transcribe-meeting",name:"Transcribe Meeting",callback:async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}}),this.addCommand({id:"open-calendar",name:"Open Calendar",callback:()=>this.activateCalendarView()}),this.addCommand({id:"sync-accounts",name:"Sync Salesforce Accounts",callback:()=>this.syncAccounts()}),this.addCommand({id:"sync-note",name:"Sync Note to Salesforce",callback:()=>this.syncNoteToSalesforce()}),this.addCommand({id:"new-meeting-note",name:"New Meeting Note",callback:()=>this.createMeetingNote()}),this.addCommand({id:"ask-gtm-brain",name:"Ask gtm-brain",callback:()=>this.openIntelligenceQueryForCurrentNote()}),this.addCommand({id:"enrich-accounts",name:"Enrich Account Folders with Salesforce Data",callback:async()=>{if(!this.settings.userEmail){new p.Notice("Please set up your email first.");return}let t=new D(this.settings.serverUrl),e;L(this.settings.userEmail)?e=await t.getCSAccounts(this.settings.userEmail):e=await t.getAccountsWithProspects(this.settings.userEmail);let n=[...e.accounts,...e.prospects];if(n.length===0){new p.Notice("No accounts found to enrich.");return}await this.enrichAccountFolders(n)}}),this.addCommand({id:"refresh-analytics",name:"Refresh Analytics Dashboard",callback:async()=>{let t=this.app.workspace.getActiveFile();t?await this.refreshAnalyticsDashboard(t):new p.Notice("No active file")}}),this.addCommand({id:"live-query-transcript",name:"Query Current Transcript (Live)",callback:async()=>{if(!this.audioRecorder?.isRecording()){new p.Notice("No active recording. Start recording first to use live query.");return}if(!this.liveTranscript||this.liveTranscript.length<50){new p.Notice("Not enough transcript captured yet. Keep recording for a few more minutes.");return}this.openLiveQueryModal()}}),this.sfSyncStatusBarEl=this.addStatusBarItem(),this.sfSyncStatusBarEl.setText("SF Sync: Idle"),this.sfSyncStatusBarEl.addClass("eudia-sf-sync-status"),this.addSettingTab(new ie(this.app,this)),this.registerEditorSuggest(new Q(this.app,this)),this.app.workspace.onLayoutReady(async()=>{if(this.settings.setupCompleted){if(this.settings.syncOnStartup){if(await this.scanLocalAccountFolders(),this.settings.userEmail&&this.settings.syncAccountsOnStartup){let t=new Date().toISOString().split("T")[0];this.settings.lastAccountRefreshDate!==t&&setTimeout(async()=>{try{console.log("[Eudia] Startup account sync - checking for changes...");let n=await this.syncAccountFolders();if(n.success){if(this.settings.lastAccountRefreshDate=t,await this.saveSettings(),n.added>0||n.archived>0){let s=[];n.added>0&&s.push(`${n.added} added`),n.archived>0&&s.push(`${n.archived} archived`),new p.Notice(`Account folders synced: ${s.join(", ")}`)}}else console.log("[Eudia] Sync failed:",n.error)}catch{console.log("[Eudia] Startup sync skipped (server unreachable), will retry tomorrow")}},2e3)}this.settings.showCalendarView&&this.settings.userEmail&&await this.activateCalendarView(),this.settings.userEmail&&this.settings.cachedAccounts.length>0&&setTimeout(async()=>{try{await this.checkAndAutoEnrich()}catch{console.log("[Eudia] Auto-enrich skipped (server unreachable)")}},5e3),this.settings.userEmail&&this.telemetry?setTimeout(async()=>{try{let t=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),e=0;t&&t instanceof p.TFolder&&(e=t.children.filter(i=>i instanceof p.TFolder&&!i.name.startsWith("_")).length);let n={salesforce:this.settings.salesforceConnected?"connected":"not_configured",calendar:this.settings.calendarConfigured?"connected":"not_configured"};await this.telemetry.sendHeartbeat(e,n);let s=await this.telemetry.checkForPushedConfig();if(s.length>0){let i=!1;for(let a of s)a.key&&this.settings.hasOwnProperty(a.key)&&(this.settings[a.key]=a.value,i=!0,console.log(`[Eudia] Applied pushed config: ${a.key} = ${a.value}`));i&&(await this.saveSettings(),new p.Notice("Settings updated by admin"))}await this.checkAndConsumeSyncFlags(),this.startSalesforceSyncScanner()}catch{console.log("[Eudia] Heartbeat/config check skipped"),this.startSalesforceSyncScanner()}},3e3):this.settings.sfAutoSyncEnabled&&this.settings.salesforceConnected&&setTimeout(()=>this.startSalesforceSyncScanner(),5e3)}}else{await new Promise(e=>setTimeout(e,100));let t=document.querySelector(".modal-container .modal");if(t){let e=t.querySelector(".modal-close-button");e&&e.click()}await this.activateSetupView()}this.app.workspace.on("file-open",async t=>{if(t&&(t.path.includes("_Analytics/")||t.path.includes("_Customer Health/")))try{let e=await this.app.vault.read(t);if(e.includes("type: analytics_dashboard")){let s=e.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/)?.[1],i=new Date().toISOString().split("T")[0];s!==i&&(console.log(`[Eudia] Auto-refreshing analytics: ${t.name}`),await this.refreshAnalyticsDashboard(t))}}catch{}})})}async onunload(){this.app.workspace.detachLeavesOfType(R)}async checkForPluginUpdate(){try{let t=this.settings.serverUrl||"https://gtm-wizard.onrender.com",e=await(0,p.requestUrl)({url:`${t}/api/plugin/version`,method:"GET",headers:{"Content-Type":"application/json"}});if(!e.json?.success)return;let n=e.json.currentVersion,s=this.manifest?.version||"0.0.0",i=n.split(".").map(Number),a=s.split(".").map(Number),o=!1;for(let c=0;c<3;c++){if((i[c]||0)>(a[c]||0)){o=!0;break}if((i[c]||0)<(a[c]||0))break}o?(console.log(`[Eudia Update] New version available: ${n} (current: ${s})`),await this.performAutoUpdate(t,n,s)):console.log(`[Eudia Update] Plugin is up to date (v${s})`)}catch(t){console.log("[Eudia Update] Could not check for updates:",t.message||t)}}async performAutoUpdate(t,e,n){try{if(this.audioRecorder?.isRecording()){console.log("[Eudia Update] Skipping auto-update \u2014 recording in progress"),new p.Notice(`Eudia update v${e} available.
Finish your recording, then restart Obsidian to update.`,1e4);return}let s=this.manifest.dir;if(!s){console.log("[Eudia Update] Cannot determine plugin directory \u2014 skipping");return}let i=this.app.vault.adapter;console.log("[Eudia Update] Downloading plugin files...");let[a,o,c]=await Promise.all([(0,p.requestUrl)({url:`${t}/api/plugin/main.js`}),(0,p.requestUrl)({url:`${t}/api/plugin/manifest.json`}),(0,p.requestUrl)({url:`${t}/api/plugin/styles.css`})]),l=a.text,d=o.text,u=c.text,y=1024,m=5*1024*1024;for(let[C,v]of[["main.js",l],["manifest.json",d],["styles.css",u]])if(!v||v.length<y||v.length>m){console.log(`[Eudia Update] Downloaded ${C} failed validation (${v?.length??0} bytes) \u2014 aborting`);return}try{let C=await i.read(`${s}/main.js`);await i.write(`${s}/main.js.bak`,C),console.log("[Eudia Update] Backed up current main.js")}catch{console.log("[Eudia Update] Could not back up main.js \u2014 continuing")}await i.write(`${s}/main.js`,l),await i.write(`${s}/manifest.json`,d),await i.write(`${s}/styles.css`,u),console.log(`[Eudia Update] Files written \u2014 v${n} \u2192 v${e}`);try{(0,p.requestUrl)({url:`${t}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"info",message:`Auto-updated from v${n} to v${e}`,userEmail:this.settings.userEmail||"anonymous",pluginVersion:e,platform:"obsidian",context:{fromVersion:n,toVersion:e}})}).catch(()=>{})}catch{}let h=document.createDocumentFragment(),g=document.createElement("div");g.style.cssText="display:flex;flex-direction:column;gap:8px;";let f=document.createElement("span");f.textContent=`Eudia updated to v${e}. Reload to apply.`,g.appendChild(f);let w=document.createElement("button");w.textContent="Reload now",w.style.cssText="padding:4px 12px;border-radius:4px;border:1px solid var(--interactive-accent);background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:12px;align-self:flex-start;",w.addEventListener("click",()=>{this.app.commands.executeCommandById("app:reload")}),g.appendChild(w),h.appendChild(g),new p.Notice(h,0)}catch(s){console.log("[Eudia Update] Auto-update failed:",s.message||s)}}async loadSettings(){this.settings=Object.assign({},Me,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}async activateCalendarView(){let t=this.app.workspace,e=t.getLeavesOfType(R);if(e.length>0)t.revealLeaf(e[0]);else{let n=t.getRightLeaf(!1);n&&(await n.setViewState({type:R,active:!0}),t.revealLeaf(n))}}async activateSetupView(){let t=this.app.workspace,e=t.getLeavesOfType(M);if(e.length>0)t.revealLeaf(e[0]);else{let n=t.getLeaf(!0);n&&(await n.setViewState({type:M,active:!0}),t.revealLeaf(n))}}async createTailoredAccountFolders(t,e){let n=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);let i=0,a=new Date().toISOString().split("T")[0],o=async l=>{let d=l.name.replace(/[<>:"/\\|?*]/g,"_").trim(),u=`${n}/${d}`;if(this.app.vault.getAbstractFileByPath(u)instanceof p.TFolder)return console.log(`[Eudia] Account folder already exists: ${d}`),!1;try{await this.app.vault.createFolder(u);let m=e?.[l.id],h=!!m,g=this.buildContactsContent(l,m,a),f=this.buildIntelligenceContent(l,m,a),w=this.buildMeetingNotesContent(l,m),C=this.buildNextStepsContent(l,m,a),v=[{name:"Note 1.md",content:`---
account: "${l.name}"
account_id: "${l.id}"
type: meeting_note
sync_to_salesforce: false
created: ${a}
---

# ${l.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 2.md",content:`---
account: "${l.name}"
account_id: "${l.id}"
type: meeting_note
sync_to_salesforce: false
created: ${a}
---

# ${l.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 3.md",content:`---
account: "${l.name}"
account_id: "${l.id}"
type: meeting_note
sync_to_salesforce: false
created: ${a}
---

# ${l.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Meeting Notes.md",content:w},{name:"Contacts.md",content:g},{name:"Intelligence.md",content:f},{name:"Next Steps.md",content:C}];for(let W of v){let I=`${u}/${W.name}`;await this.app.vault.create(I,W.content)}return console.log(`[Eudia] Created account folder with subnotes${h?" (enriched)":""}: ${d}`),!0}catch(m){return console.error(`[Eudia] Failed to create folder for ${d}:`,m),!1}},c=5;for(let l=0;l<t.length;l+=c){let d=t.slice(l,l+c),u=await Promise.allSettled(d.map(y=>o(y)));i+=u.filter(y=>y.status==="fulfilled"&&y.value===!0).length}i>0?(this.settings.cachedAccounts=t.map(l=>({id:l.id,name:l.name})),await this.saveSettings(),new p.Notice(`Created ${i} account folders`)):console.warn(`[Eudia] createTailoredAccountFolders: 0 folders created out of ${t.length} accounts \u2014 not updating cachedAccounts`),await this.ensureNextStepsFolderExists()}buildContactsContent(t,e,n){let s=e?`
enriched_at: "${new Date().toISOString()}"`:"",i=`---
account: "${t.name}"
account_id: "${t.id}"
type: contacts
sync_to_salesforce: false${s}
---`;return e?.contacts?`${i}

# ${t.name} - Key Contacts

${e.contacts}

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`:`${i}

# ${t.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
| *No contacts on record yet* | | | | |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`}buildIntelligenceContent(t,e,n){let s=e?`
enriched_at: "${new Date().toISOString()}"`:"",i=`---
account: "${t.name}"
account_id: "${t.id}"
type: intelligence
sync_to_salesforce: false${s}
---`;return e?.intelligence?`${i}

# ${t.name} - Account Intelligence

${e.intelligence}

## News & Signals

*Recent news, earnings mentions, leadership changes.*
`:`${i}

# ${t.name} - Account Intelligence

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
`}buildMeetingNotesContent(t,e){let n=e?`
enriched_at: "${new Date().toISOString()}"`:"",s=`---
account: "${t.name}"
account_id: "${t.id}"
type: meetings_index
sync_to_salesforce: false${n}
---`,i=[];return e?.opportunities&&i.push(e.opportunities),e?.recentActivity&&i.push(e.recentActivity),i.length>0?`${s}

# ${t.name} - Meeting Notes

${i.join(`

`)}

## Quick Start

1. Open **Note 1** for your next meeting
2. Click the **microphone** to record and transcribe
3. **Next Steps** are auto-extracted after transcription
4. Set \`sync_to_salesforce: true\` to sync to Salesforce
`:`${s}

# ${t.name} - Meeting Notes

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
`}buildNextStepsContent(t,e,n){let s=n||new Date().toISOString().split("T")[0],i=e?`
enriched_at: "${new Date().toISOString()}"`:"",a=`---
account: "${t.name}"
account_id: "${t.id}"
type: next_steps
auto_updated: true
last_updated: ${s}
sync_to_salesforce: false${i}
---`;return e?.nextSteps?`${a}

# ${t.name} - Next Steps

${e.nextSteps}

---

## History

*Previous next steps will be archived here.*
`:`${a}

# ${t.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}async fetchEnrichmentData(t){let e=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=t.filter(a=>a.id&&a.id.startsWith("001"));if(n.length===0)return{};let s={},i=20;console.log(`[Eudia Enrich] Fetching enrichment data for ${n.length} accounts`);for(let a=0;a<n.length;a+=i){let c=n.slice(a,a+i).map(l=>l.id);try{let l=await(0,p.requestUrl)({url:`${e}/api/accounts/enrich-batch`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountIds:c,userEmail:this.settings.userEmail})});l.json?.success&&l.json?.enrichments&&Object.assign(s,l.json.enrichments)}catch(l){console.error(`[Eudia Enrich] Batch fetch failed (batch ${a/i+1}):`,l)}a+i<n.length&&await new Promise(l=>setTimeout(l,100))}return console.log(`[Eudia Enrich] Got enrichment data for ${Object.keys(s).length}/${n.length} accounts`),s}async createProspectAccountFiles(t){if(!t||t.length===0)return 0;let e=this.settings.accountsFolder||"Accounts",n=`${e}/_Prospects`;if(!this.app.vault.getAbstractFileByPath(n))try{await this.app.vault.createFolder(n)}catch{}let i=0;for(let a of t){let o=a.name.replace(/[<>:"/\\|?*]/g,"_").trim(),c=`${n}/${o}`;if(this.app.vault.getAbstractFileByPath(c)instanceof p.TFolder)continue;let d=`${e}/${o}`;if(this.app.vault.getAbstractFileByPath(d)instanceof p.TFolder)continue;let y=`${n}/${o}.md`,m=this.app.vault.getAbstractFileByPath(y);if(m instanceof p.TFile)try{await this.app.vault.delete(m)}catch{}try{await this.app.vault.createFolder(c);let h=new Date().toISOString().split("T")[0],g=[{name:"Note 1.md",content:`---
account: "${a.name}"
account_id: "${a.id}"
type: meeting_note
tier: prospect
sync_to_salesforce: false
created: ${h}
---

# ${a.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 2.md",content:`---
account: "${a.name}"
account_id: "${a.id}"
type: meeting_note
tier: prospect
sync_to_salesforce: false
created: ${h}
---

# ${a.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 3.md",content:`---
account: "${a.name}"
account_id: "${a.id}"
type: meeting_note
tier: prospect
sync_to_salesforce: false
created: ${h}
---

# ${a.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Meeting Notes.md",content:`---
account: "${a.name}"
account_id: "${a.id}"
type: meetings_index
tier: prospect
sync_to_salesforce: false
---

# ${a.name} - Meeting Notes

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
account: "${a.name}"
account_id: "${a.id}"
type: contacts
tier: prospect
sync_to_salesforce: false
---

# ${a.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
|      |       |       |       |       |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`},{name:"Intelligence.md",content:`---
account: "${a.name}"
account_id: "${a.id}"
type: intelligence
tier: prospect
sync_to_salesforce: false
---

# ${a.name} - Account Intelligence

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
account: "${a.name}"
account_id: "${a.id}"
type: next_steps
tier: prospect
auto_updated: true
last_updated: ${h}
sync_to_salesforce: false
---

# ${a.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}];for(let f of g){let w=`${c}/${f.name}`;await this.app.vault.create(w,f.content)}i++}catch(h){console.log(`[Eudia] Failed to create prospect folder for ${a.name}:`,h)}}return i>0&&console.log(`[Eudia] Created ${i} prospect account folders in _Prospects/`),i}async createCSManagerDashboard(t,e){let n="CS Manager",s=new Date().toISOString().split("T")[0],i=pe(t);if(!this.app.vault.getAbstractFileByPath(n))try{await this.app.vault.createFolder(n)}catch{}let a={};for(let u of e){let y=u.ownerName||"Unassigned";a[y]||(a[y]=[]),a[y].push(u)}let o=`---
role: cs_manager
manager: "${t}"
direct_reports: ${i.length}
total_accounts: ${e.length}
created: ${s}
auto_refresh: true
---

# CS Manager Overview

**Manager:** ${t}
**Direct Reports:** ${i.join(", ")||"None configured"}
**Total CS Accounts:** ${e.length}
**Last Refreshed:** ${s}

---

## Account Distribution by Sales Rep

`,c=Object.keys(a).sort();for(let u of c){let y=a[u];o+=`### ${u} (${y.length} accounts)
`;for(let m of y.slice(0,10))o+=`- **${m.name}** \u2014 ${m.type||"Account"}
`;y.length>10&&(o+=`- _...and ${y.length-10} more_
`),o+=`
`}o+=`---

## CS Staffing Pipeline

| Account | Type | Owner | CSM |
|---------|------|-------|-----|
`;for(let u of e.slice(0,50))o+=`| ${u.name} | ${u.type||""} | ${u.ownerName||""} | ${u.csmName||""} |
`;o+=`
---

## How Meeting Notes Sync

Meeting notes created by your direct reports flow through Salesforce:
1. **Rep records a meeting** in their vault and clicks "Sync to Salesforce"
2. **Notes sync to Salesforce** \`Customer_Brain__c\` field on the Account
3. **Your vault refreshes** \u2014 account Intelligence and Meeting Notes sub-notes pull the latest activity from Salesforce each time the vault opens or you click "Connect to Salesforce" in Setup

> To see the latest notes from Jon and Farah, ensure they are syncing their meeting notes to Salesforce. Your vault will automatically pull their activity on the next enrichment cycle.

---

*This dashboard auto-updates when the vault syncs. New Stage 4/5 and Existing accounts will appear automatically.*
`;let l=`${n}/CS Manager Overview.md`,d=this.app.vault.getAbstractFileByPath(l);d instanceof p.TFile?await this.app.vault.modify(d,o):await this.app.vault.create(l,o);for(let u of i){let y=u.split("@")[0].replace("."," ").replace(/\b\w/g,b=>b.toUpperCase()),m=u.split("@")[0].replace("."," ").toLowerCase(),h=m.split(" ")[0],g=m.split(" ").pop()||"",f=e.filter(b=>{let W=(b.csmName||"").toLowerCase();if(W&&(W.includes(h)||W.includes(g)))return!0;let I=(b.ownerName||"").toLowerCase();return I.includes(h)||I.includes(g)}),w=`---
rep: "${u}"
rep_name: "${y}"
role: cs_rep_summary
account_count: ${f.length}
created: ${s}
---

# ${y} \u2014 CS Account Summary

**Email:** ${u}
**CS Accounts:** ${f.length}

---

## Assigned Accounts

`;if(f.length>0){w+=`| Account | Type | Owner | Folder |
|---------|------|-------|--------|
`;for(let b of f){let W=b.name.replace(/[<>:"/\\|?*]/g,"_").trim();w+=`| ${b.name} | ${b.type||""} | ${b.ownerName||""} | [[Accounts/${W}/Contacts\\|View]] |
`}}else w+=`*No accounts currently matched to this rep. Accounts will populate after connecting to Salesforce (Step 2).*
`;w+=`
---

## Recent Activity

Meeting notes and activity for ${y}'s accounts sync through Salesforce:
- Notes appear in each account's **Meeting Notes** and **Intelligence** sub-notes
- Activity updates when the vault enriches (on open or Salesforce connect)
- Ensure ${y} is syncing their meeting notes to Salesforce for latest data

---

*Updates automatically as new CS-relevant accounts sync.*
`;let C=`${n}/${y}.md`,v=this.app.vault.getAbstractFileByPath(C);v instanceof p.TFile?await this.app.vault.modify(v,w):await this.app.vault.create(C,w)}console.log(`[Eudia] Created CS Manager dashboard for ${t} with ${e.length} accounts across ${c.length} reps`)}async createAdminAccountFolders(t){let e=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e),await this.ensurePipelineFolderExists();let s=0,i=0,a=new Date().toISOString().split("T")[0],o=async l=>{let d=l.name.replace(/[<>:"/\\|?*]/g,"_").trim(),u=`${e}/${d}`;if(this.app.vault.getAbstractFileByPath(u)instanceof p.TFolder)return!1;try{return await this.app.vault.createFolder(u),await this.createExecAccountSubnotes(u,l,a),l.isOwned?s++:i++,console.log(`[Eudia Admin] Created ${l.isOwned?"owned":"view-only"} folder: ${d}`),!0}catch(m){return console.error(`[Eudia Admin] Failed to create folder for ${d}:`,m),!1}},c=5;for(let l=0;l<t.length;l+=c){let d=t.slice(l,l+c);await Promise.allSettled(d.map(u=>o(u)))}this.settings.cachedAccounts=t.map(l=>({id:l.id,name:l.name})),await this.saveSettings(),s+i>0&&new p.Notice(`Created ${s} owned + ${i} view-only account folders`),await this.ensureNextStepsFolderExists()}async createExecAccountSubnotes(t,e,n){let s=e.ownerName||"Unknown",i=[{name:"Note 1.md",content:`---
account: "${e.name}"
account_id: "${e.id}"
type: meeting_note
sync_to_salesforce: false
created: ${n}
---

# ${e.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 2.md",content:`---
account: "${e.name}"
account_id: "${e.id}"
type: meeting_note
sync_to_salesforce: false
created: ${n}
---

# ${e.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 3.md",content:`---
account: "${e.name}"
account_id: "${e.id}"
type: meeting_note
sync_to_salesforce: false
created: ${n}
---

# ${e.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Meeting Notes.md",content:`---
account: "${e.name}"
account_id: "${e.id}"
type: meetings_index
owner: "${s}"
sync_to_salesforce: false
---

# ${e.name} - Meeting Notes

**Account Owner:** ${s}

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
account: "${e.name}"
account_id: "${e.id}"
type: contacts
sync_to_salesforce: false
---

# ${e.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
|      |       |       |       |       |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`},{name:"Intelligence.md",content:`---
account: "${e.name}"
account_id: "${e.id}"
type: intelligence
sync_to_salesforce: false
---

# ${e.name} - Account Intelligence

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
account: "${e.name}"
account_id: "${e.id}"
type: next_steps
auto_updated: true
last_updated: ${n}
sync_to_salesforce: false
---

# ${e.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}];for(let a of i){let o=`${t}/${a.name}`;await this.app.vault.create(o,a.content)}}async createFullAccountSubnotes(t,e,n){let s=[{name:"Note 1.md",content:`---
account: "${e.name}"
account_id: "${e.id}"
type: meeting_note
sync_to_salesforce: false
created: ${n}
---

# ${e.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Next Steps.md",content:`---
account: "${e.name}"
account_id: "${e.id}"
type: next_steps
auto_updated: true
last_updated: ${n}
sync_to_salesforce: false
---

# ${e.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}];for(let i of s){let a=`${t}/${i.name}`;await this.app.vault.create(a,i.content)}}async ensurePipelineFolderExists(){let t="Pipeline",e=`${t}/Pipeline Review Notes.md`;if(this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t),!this.app.vault.getAbstractFileByPath(e)){let a=`---
type: pipeline_dashboard
auto_updated: true
last_updated: ${new Date().toISOString().split("T")[0]}
---

# Pipeline Review Notes

This folder contains transcribed notes from internal pipeline review meetings.

## How It Works

1. **Record** a pipeline review meeting (forecast call, deal review, etc.)
2. **Transcribe** using the microphone - the system detects it's a pipeline meeting
3. **Account updates** are extracted per-account discussed
4. **This dashboard** aggregates all pipeline review notes

---

## Recent Pipeline Reviews

| Date | Meeting | Key Updates |
|------|---------|-------------|
|      |         |             |

---

## Pipeline Health Snapshot

*Updated after each pipeline review meeting.*

### Accounts Advancing
*None yet*

### Accounts At Risk
*None yet*

### New Opportunities
*None yet*
`;await this.app.vault.create(e,a)}}async ensureNextStepsFolderExists(){let t="Next Steps",e=`${t}/All Next Steps.md`;if(this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t),!this.app.vault.getAbstractFileByPath(e)){let i=new Date().toISOString().split("T")[0],a=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${i}
---

# All Next Steps Dashboard

*Last updated: ${i} ${a}*

---

## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;await this.app.vault.create(e,o)}}async updateAccountNextSteps(t,e,n){try{console.log(`[Eudia] updateAccountNextSteps called for: ${t}`),console.log(`[Eudia] Content length: ${e?.length||0} chars`);let s=t.replace(/[<>:"/\\|?*]/g,"_").trim(),i=`${this.settings.accountsFolder}/${s}/Next Steps.md`;console.log(`[Eudia] Looking for Next Steps file at: ${i}`);let a=this.app.vault.getAbstractFileByPath(i);if(!a||!(a instanceof p.TFile)){console.log(`[Eudia] \u274C Next Steps file NOT FOUND at: ${i}`);let w=this.app.vault.getAbstractFileByPath(`${this.settings.accountsFolder}/${s}`);w&&w instanceof p.TFolder?console.log(`[Eudia] Files in ${s} folder:`,w.children.map(C=>C.name)):console.log(`[Eudia] Account folder also not found: ${this.settings.accountsFolder}/${s}`);return}console.log("[Eudia] Found Next Steps file, updating...");let o=new Date().toISOString().split("T")[0],c=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),l=n.split("/").pop()?.replace(".md","")||"Meeting",d=e;!e.includes("- [ ]")&&!e.includes("- [x]")&&(d=e.split(`
`).filter(w=>w.trim()).map(w=>{let C=w.replace(/^[-•*]\s*/,"").trim();return C?`- [ ] ${C}`:""}).filter(Boolean).join(`
`));let u=await this.app.vault.read(a),y="",m=u.match(/## History\n\n\*Previous next steps are archived below\.\*\n\n([\s\S]*?)$/);m&&m[1]&&(y=m[1].trim());let h=`### ${o} - ${l}
${d||"*None*"}`,g=y?`${h}

---

${y}`:h,f=`---
account: "${t}"
account_id: "${this.settings.cachedAccounts.find(w=>w.name===t)?.id||""}"
type: next_steps
auto_updated: true
last_updated: ${o}
sync_to_salesforce: false
---

# ${t} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*Last updated: ${o} ${c} from ${l}*

${d||"*No next steps identified*"}

---

## History

*Previous next steps are archived below.*

${g}
`;await this.app.vault.modify(a,f),console.log(`[Eudia] Updated Next Steps for ${t} (history preserved)`),await this.regenerateNextStepsDashboard()}catch(s){console.error(`[Eudia] Failed to update Next Steps for ${t}:`,s)}}async regenerateNextStepsDashboard(){try{let e=this.app.vault.getAbstractFileByPath("Next Steps/All Next Steps.md");if(!e||!(e instanceof p.TFile)){await this.ensureNextStepsFolderExists();return}let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!n||!(n instanceof p.TFolder))return;let s=[];for(let c of n.children)if(c instanceof p.TFolder){let l=`${c.path}/Next Steps.md`,d=this.app.vault.getAbstractFileByPath(l);if(d instanceof p.TFile){let u=await this.app.vault.read(d),y=u.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/),m=y?y[1]:"Unknown",h=u.split(`
`).filter(g=>g.match(/^- \[[ x]\]/)).slice(0,5);(h.length>0||m!=="Unknown")&&s.push({account:c.name,lastUpdated:m,nextSteps:h})}}s.sort((c,l)=>l.lastUpdated.localeCompare(c.lastUpdated));let i=new Date().toISOString().split("T")[0],a=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${i}
---

# All Next Steps Dashboard

*Last updated: ${i} ${a}*

---

`;if(s.length===0)o+=`## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;else{for(let c of s)o+=`## ${c.account}

`,c.nextSteps.length>0?o+=c.nextSteps.join(`
`)+`
`:o+=`*No current next steps*
`,o+=`
*Updated: ${c.lastUpdated}*

---

`;o+=`## Summary

`,o+=`| Account | Last Updated | Open Items |
`,o+=`|---------|--------------|------------|
`;for(let c of s){let l=c.nextSteps.filter(d=>d.includes("- [ ]")).length;o+=`| ${c.account} | ${c.lastUpdated} | ${l} |
`}}await this.app.vault.modify(e,o),console.log("[Eudia] Regenerated All Next Steps dashboard")}catch(t){console.error("[Eudia] Failed to regenerate Next Steps dashboard:",t)}}async startRecording(){if(!T.isSupported()){new p.Notice("Audio transcription is not supported in this browser");return}let t=this.app.workspace.getActiveFile();if(t||(await this.createMeetingNote(),t=this.app.workspace.getActiveFile()),!t){new p.Notice("Please open or create a note first");return}this.audioRecorder=new T,this.recordingStatusBar=new ee(()=>this.audioRecorder?.pause(),()=>this.audioRecorder?.resume(),()=>this.stopRecording(),()=>this.cancelRecording());try{await this.audioRecorder.start(),this.recordingStatusBar.show(),this.micRibbonIcon?.addClass("eudia-ribbon-recording");let e=!1,n=setInterval(()=>{if(this.audioRecorder?.isRecording()){let s=this.audioRecorder.getState();if(this.recordingStatusBar?.updateState(s),s.duration>=2700&&!e){e=!0;let i=new class extends p.Modal{constructor(){super(...arguments);this.result=!0}onOpen(){let{contentEl:c}=this;c.createEl("h2",{text:"Still recording?"}),c.createEl("p",{text:"You have been recording for 45 minutes. Are you still in this meeting?"}),c.createEl("p",{text:"Recording will auto-stop at 90 minutes.",cls:"mod-warning"});let l=c.createDiv({cls:"modal-button-container"});l.createEl("button",{text:"Keep Recording",cls:"mod-cta"}).onclick=()=>{this.close()},l.createEl("button",{text:"Stop Recording"}).onclick=()=>{this.result=!1,this.close()}}onClose(){this.result||a.stopRecording()}}(this.app),a=this;i.open()}s.duration>=5400&&(new p.Notice("Recording stopped \u2014 maximum 90 minutes reached."),this.stopRecording(),clearInterval(n))}else clearInterval(n)},100);this.liveTranscript="",this.startLiveTranscription(),new p.Notice("Transcription started. Click stop when finished.")}catch(e){new p.Notice(`Failed to start transcription: ${e.message}`),this.recordingStatusBar?.hide(),this.recordingStatusBar=null}}async stopRecording(){if(!this.audioRecorder?.isRecording())return;let t=this.app.workspace.getActiveFile();if(!t){new p.Notice("No active file to save transcription"),this.cancelRecording();return}this.recordingStatusBar?.showProcessing();try{let e=await this.audioRecorder.stop();await this.processRecording(e,t)}catch(e){new p.Notice(`Transcription failed: ${e.message}`)}finally{this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null}}async cancelRecording(){this.audioRecorder?.isRecording()&&this.audioRecorder.cancel(),this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null,new p.Notice("Transcription cancelled")}startLiveTranscription(){this.stopLiveTranscription();let t=12e4;this.liveTranscriptChunkInterval=setInterval(async()=>{await this.transcribeCurrentChunk()},t),setTimeout(async()=>{this.audioRecorder?.isRecording()&&await this.transcribeCurrentChunk()},3e4),console.log("[Eudia] Live transcription started")}stopLiveTranscription(){this.liveTranscriptChunkInterval&&(clearInterval(this.liveTranscriptChunkInterval),this.liveTranscriptChunkInterval=null),console.log("[Eudia] Live transcription stopped")}async transcribeCurrentChunk(){if(!this.audioRecorder?.isRecording()||this.isTranscribingChunk)return;let t=this.audioRecorder.extractNewChunks();if(!(!t||t.size<5e3)){this.isTranscribingChunk=!0,console.log(`[Eudia] Transcribing chunk: ${t.size} bytes`);try{let e=new FileReader,s=await new Promise((o,c)=>{e.onload=()=>{let d=e.result.split(",")[1];o(d)},e.onerror=c,e.readAsDataURL(t)}),i=this.audioRecorder.getMimeType(),a=await this.transcriptionService.transcribeChunk(s,i);a.success&&a.text&&(this.liveTranscript+=(this.liveTranscript?`

`:"")+a.text,console.log(`[Eudia] Chunk transcribed, total transcript length: ${this.liveTranscript.length}`))}catch(e){console.error("[Eudia] Chunk transcription error:",e)}finally{this.isTranscribingChunk=!1}}}openLiveQueryModal(){let t=new p.Modal(this.app);t.titleEl.setText("Query Live Transcript");let e=t.contentEl;e.addClass("eudia-live-query-modal"),e.createDiv({cls:"eudia-live-query-instructions"}).setText(`Ask a question about what has been discussed so far (${Math.round(this.liveTranscript.length/4)} words captured):`);let s=e.createEl("textarea",{cls:"eudia-live-query-input",attr:{placeholder:'e.g., "What did Tom say about pricing?" or "What were the main concerns raised?"',rows:"3"}}),i=e.createDiv({cls:"eudia-live-query-response"});i.style.display="none";let a=e.createEl("button",{text:"Ask",cls:"eudia-btn-primary"});a.addEventListener("click",async()=>{let o=s.value.trim();if(!o){new p.Notice("Please enter a question");return}a.disabled=!0,a.setText("Searching..."),i.style.display="block",i.setText("Searching transcript..."),i.addClass("eudia-loading");try{let c=await this.transcriptionService.liveQueryTranscript(o,this.liveTranscript,this.getAccountNameFromActiveFile());i.removeClass("eudia-loading"),c.success?i.setText(c.answer):(i.setText(c.error||"Failed to query transcript"),i.addClass("eudia-error"))}catch(c){i.removeClass("eudia-loading"),i.setText(`Error: ${c.message}`),i.addClass("eudia-error")}finally{a.disabled=!1,a.setText("Ask")}}),s.addEventListener("keydown",o=>{o.key==="Enter"&&!o.shiftKey&&(o.preventDefault(),a.click())}),t.open(),s.focus()}getAccountNameFromActiveFile(){let t=this.app.workspace.getActiveFile();if(!t)return;let e=t.path.match(/Accounts\/([^\/]+)\//i);if(e)return e[1]}async processRecording(t,e){let n=t.audioBlob?.size||0;if(console.log(`[Eudia] Audio blob size: ${n} bytes, duration: ${t.duration}s`),n<1e3){new p.Notice("Recording too short or no audio captured. Please try again.");return}try{let d=await T.analyzeAudioBlob(t.audioBlob);console.log(`[Eudia] Audio diagnostic: hasAudio=${d.hasAudio}, peak=${d.peakLevel}, silent=${d.silentPercent}%`),d.warning&&(console.warn(`[Eudia] Audio warning: ${d.warning}`),d.hasAudio?new p.Notice(`Warning: ${d.warning.split(":")[0]}`,5e3):new p.Notice("Warning: Audio appears to be silent. Transcription may not work correctly. Check your microphone settings.",8e3))}catch(d){console.warn("[Eudia] Audio diagnostic failed, continuing anyway:",d)}let s=t.duration||0,a=Math.max(1,Math.ceil(s/600))*30+30,o=a<60?`~${a} seconds`:`~${Math.ceil(a/60)} minute${Math.ceil(a/60)>1?"s":""}`;new p.Notice(`Processing ${Math.ceil(s/60)} min recording. Should take ${o}.`);let c=await this.app.vault.read(e),l=`

---
**Processing your recording...**
Started: ${new Date().toLocaleTimeString()}
Estimated: ${o}

*You can navigate away \u2014 the summary will appear here when ready.*
---
`;await this.app.vault.modify(e,c+l),this.processTranscriptionAsync(t,e).catch(d=>{console.error("Background transcription failed:",d),new p.Notice(`Transcription failed: ${d.message}`)})}async processTranscriptionAsync(t,e){try{let n={},s=e.path.split("/");console.log(`[Eudia] Processing transcription for: ${e.path}`),console.log(`[Eudia] Path parts: ${JSON.stringify(s)}, accountsFolder: ${this.settings.accountsFolder}`);let i=s[0]==="Pipeline Meetings",a=!1;try{let h=(await this.app.vault.read(e)).match(/^---\n([\s\S]*?)\n---/);h&&(a=/meeting_type:\s*pipeline_review/.test(h[1]))}catch{}if(!a&&i&&(a=!0),a){console.log("[Eudia Pipeline] Detected pipeline review meeting, using pipeline prompt");let m="";try{let h=await(0,p.requestUrl)({url:`${this.settings.serverUrl||"https://gtm-brain.onrender.com"}/api/pipeline-context`,method:"GET",headers:{"Content-Type":"application/json"}});h.json?.success&&h.json?.context&&(m=h.json.context,console.log(`[Eudia Pipeline] Loaded Salesforce pipeline context (${m.length} chars)`))}catch(h){console.warn("[Eudia Pipeline] Could not fetch pipeline context:",h)}n={meetingType:"pipeline_review",pipelineContext:m}}else if(s.length>=2&&s[0]===this.settings.accountsFolder){let m=s[1];console.log(`[Eudia] Detected account folder: ${m}`);let h=this.settings.cachedAccounts.find(g=>g.name.toLowerCase()===m.toLowerCase());h?(n={accountName:h.name,accountId:h.id},console.log(`[Eudia] Found cached account: ${h.name} (${h.id})`)):(n={accountName:m,accountId:""},console.log(`[Eudia] Account not in cache, using folder name: ${m}`))}else console.log("[Eudia] File not in Accounts folder, skipping account context");let o=[];try{let m=await this.calendarService.getCurrentMeeting();m.meeting?.attendees&&(o=m.meeting.attendees.map(h=>h.name||h.email.split("@")[0]).filter(Boolean).slice(0,10))}catch{}let c=await this.transcriptionService.transcribeAudio(t.audioBlob,{...n,speakerHints:o}),l=m=>m?!!(m.summary?.trim()||m.nextSteps?.trim()):!1,d=c.sections;if(l(d)||c.text?.trim()&&(d=await this.transcriptionService.processTranscription(c.text,n)),!l(d)&&!c.text?.trim()){let h=(await this.app.vault.read(e)).replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g,"");await this.app.vault.modify(e,h+`

**Transcription failed:** No audio detected.
`),new p.Notice("Transcription failed: No audio detected.");return}let u;a?u=this.buildPipelineNoteContent(d,c,e.path):u=this.buildNoteContent(d,c),await this.app.vault.modify(e,u);let y=Math.floor(t.duration/60);if(new p.Notice(`Transcription complete (${y} min recording)`),!a){let m=d.nextSteps||d.actionItems;console.log(`[Eudia] Next Steps extraction - accountContext: ${n?.accountName||"undefined"}`),console.log(`[Eudia] Next Steps content found: ${m?"YES ("+m.length+" chars)":"NO"}`),console.log(`[Eudia] sections.nextSteps: ${d.nextSteps?"YES":"NO"}, sections.actionItems: ${d.actionItems?"YES":"NO"}`),m&&n?.accountName?(console.log(`[Eudia] Calling updateAccountNextSteps for ${n.accountName}`),await this.updateAccountNextSteps(n.accountName,m,e.path)):console.log("[Eudia] Skipping Next Steps update - missing content or account context")}this.settings.autoSyncAfterTranscription&&await this.syncNoteToSalesforce()}catch(n){try{let i=(await this.app.vault.read(e)).replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g,"");await this.app.vault.modify(e,i+`

**Transcription failed:** ${n.message}
`)}catch{}throw n}}buildPipelineNoteContent(t,e,n){let s=new Date,i=String(s.getMonth()+1).padStart(2,"0"),a=String(s.getDate()).padStart(2,"0"),o=String(s.getFullYear()).slice(-2),c=s.toISOString().split("T")[0],l=`${i}.${a}.${o}`,d=h=>h==null?"":Array.isArray(h)?h.map(String).join(`
`):typeof h=="object"?JSON.stringify(h,null,2):String(h),u=d(t.summary),y=e.transcript||e.text||"",m=`---
title: "Team Pipeline Meeting - ${l}"
date: ${c}
meeting_type: pipeline_review
transcribed: true
---

# Weekly Pipeline Review | ${s.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"})}

`;if(u)m+=u;else{let h=[t.painPoints,t.productInterest,t.nextSteps,t.actionItems].filter(Boolean).map(d).join(`

`);h?m+=h:m+="*Pipeline summary could not be generated. See transcript below.*"}return y&&(m+=`

---

<details>
<summary><strong>Full Transcript</strong> (${Math.ceil(y.length/1e3)}k chars)</summary>

${y}

</details>
`),m}buildNoteContent(t,e){let n=g=>g==null?"":Array.isArray(g)?g.map(f=>typeof f=="object"?f.category?`**${f.category}**: ${f.signal||f.insight||""}`:JSON.stringify(f):String(f)).join(`
`):typeof g=="object"?JSON.stringify(g):String(g),s=n(t.title)||"Meeting Notes",i=n(t.summary),a=n(t.painPoints),o=n(t.productInterest),c=n(t.meddiccSignals),l=n(t.nextSteps),d=n(t.actionItems),u=n(t.keyDates),y=n(t.risksObjections),m=n(t.attendees),h=`---
title: "${s}"
date: ${new Date().toISOString().split("T")[0]}
transcribed: true
sync_to_salesforce: false
clo_meeting: false
source: ""
confidence: ${e.confidence}
---

# ${s}

## Summary

${i||"*AI summary will appear here*"}

`;return a&&!a.includes("None explicitly")&&(h+=`## Pain Points

${a}

`),o&&!o.includes("None identified")&&(h+=`## Product Interest

${o}

`),c&&(h+=`## MEDDICC Signals

${c}

`),l&&(h+=`## Next Steps

${l}

`),d&&(h+=`## Action Items

${d}

`),u&&!u.includes("No specific dates")&&(h+=`## Key Dates

${u}

`),y&&!y.includes("None raised")&&(h+=`## Risks and Objections

${y}

`),m&&(h+=`## Attendees

${m}

`),this.settings.appendTranscript&&e.text&&(h+=`---

## Full Transcript

${e.text}
`),h}openIntelligenceQuery(){new q(this.app,this).open()}openIntelligenceQueryForCurrentNote(){let t=this.app.workspace.getActiveFile(),e;if(t){let n=this.app.metadataCache.getFileCache(t)?.frontmatter;if(n?.account_id&&n?.account)e={id:n.account_id,name:n.account};else if(n?.account){let s=this.settings.cachedAccounts.find(i=>i.name.toLowerCase()===n.account.toLowerCase());s?e={id:s.id,name:s.name}:e={id:"",name:n.account}}else{let s=t.path.split("/");if(s.length>=2&&s[0]===this.settings.accountsFolder){let i=s[1],a=this.settings.cachedAccounts.find(o=>o.name.replace(/[<>:"/\\|?*]/g,"_").trim()===i);a?e={id:a.id,name:a.name}:e={id:"",name:i}}}}new q(this.app,this,e).open()}async syncAccounts(t=!1){t||new p.Notice("Syncing Salesforce accounts...");try{let n=(await(0,p.requestUrl)({url:`${this.settings.serverUrl}/api/accounts/obsidian`,method:"GET",headers:{Accept:"application/json"}})).json;if(!n.success||!n.accounts){t||new p.Notice("Failed to fetch accounts from server");return}this.settings.cachedAccounts=n.accounts.map(s=>({id:s.id,name:s.name})),this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings(),t||new p.Notice(`Synced ${n.accounts.length} accounts for matching`)}catch(e){t||new p.Notice(`Failed to sync accounts: ${e.message}`)}}async scanLocalAccountFolders(){try{let t=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!t||!(t instanceof p.TFolder))return;let e=[];for(let n of t.children)n instanceof p.TFolder&&e.push({id:`local-${n.name.replace(/\s+/g,"-").toLowerCase()}`,name:n.name});this.settings.cachedAccounts=e,this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings()}catch(t){console.error("Failed to scan local account folders:",t)}}async refreshAccountFolders(){if(!this.settings.userEmail)throw new Error("Please configure your email first");let t=new D(this.settings.serverUrl);if((await t.getAccountsForUser(this.settings.userEmail)).length===0)return console.log("[Eudia] No accounts found for user"),0;let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),s=[];if(n&&n instanceof p.TFolder)for(let o of n.children)o instanceof p.TFolder&&s.push(o.name);let i=await t.getNewAccounts(this.settings.userEmail,s);if(i.length===0)return console.log("[Eudia] All account folders exist"),0;console.log(`[Eudia] Creating ${i.length} new account folders`);let a=await this.fetchEnrichmentData(i);return await this.createTailoredAccountFolders(i,a),i.length}async checkAndConsumeSyncFlags(){if(!this.settings.userEmail)return;let t=encodeURIComponent(this.settings.userEmail.toLowerCase().trim()),e=this.settings.serverUrl||"https://gtm-wizard.onrender.com";try{let i=((await(0,p.requestUrl)({url:`${e}/api/admin/users/${t}/sync-flags`,method:"GET"})).json?.flags||[]).filter(o=>!o.consumed_at);if(i.length===0)return;console.log(`[Eudia] Found ${i.length} pending sync flag(s)`);let a=!1;for(let o of i)if(o.flag==="resync_accounts"){a=!0;let c=o.payload||{},l=c.added?.length||0,d=c.removed?.length||0;console.log(`[Eudia] Sync flag: resync_accounts (+${l} / -${d})`)}else o.flag==="update_plugin"?new p.Notice("A plugin update is available. Please download the latest vault."):o.flag==="reset_setup"&&(console.log("[Eudia] Sync flag: reset_setup received"),this.settings.setupCompleted=!1,await this.saveSettings(),new p.Notice("Setup has been reset by admin. Please re-run the setup wizard."));if(a){console.log("[Eudia] Triggering account folder resync from sync flag..."),new p.Notice("Syncing account updates...");let o=await this.syncAccountFolders();o.success?new p.Notice(`Account sync complete: ${o.added} new, ${o.archived} archived`):console.log(`[Eudia] Account resync error: ${o.error}`)}try{await(0,p.requestUrl)({url:`${e}/api/admin/users/${t}/sync-flags/consume`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagIds:i.map(o=>o.id)})}),console.log(`[Eudia] Consumed ${i.length} sync flag(s)`)}catch{console.log("[Eudia] Failed to consume sync flags (will retry next startup)")}}catch{console.log("[Eudia] Sync flag check skipped (endpoint not available)")}}async syncAccountFolders(){if(!this.settings.userEmail)return{success:!1,added:0,archived:0,error:"No email configured"};let t=this.settings.userEmail.toLowerCase().trim();console.log(`[Eudia] Syncing account folders for: ${t}`);try{let e=await fetch(`${this.settings.serverUrl}/api/bl-accounts/${encodeURIComponent(t)}`);if(!e.ok){let S=await e.json().catch(()=>({}));throw new Error(S.error||`Server returned ${e.status}`)}let n=await e.json();if(!n.success||!n.accounts)throw new Error(n.error||"Invalid response from server");let s=n.meta?.userGroup||"bl",i=n.meta?.queryDescription||"accounts",a=n.meta?.region||null;console.log(`[Eudia] User group: ${s}, accounts: ${n.accounts.length} (${i})`),a&&console.log(`[Eudia] Sales Leader region: ${a}`);let o=n.accounts||[],c=n.prospectAccounts||[],l=o.length+c.length;console.log(`[Eudia] Server returned: ${o.length} active + ${c.length} prospects = ${l} total`);let d=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),u=new Map,y=`${this.settings.accountsFolder}/_Prospects`,m=this.app.vault.getAbstractFileByPath(y),h=new Map,g=new Map;if(d&&d instanceof p.TFolder)for(let S of d.children)S instanceof p.TFolder&&!S.name.startsWith("_")&&u.set(S.name.toLowerCase().trim(),S);if(m&&m instanceof p.TFolder)for(let S of m.children)S instanceof p.TFolder?h.set(S.name.toLowerCase().trim(),S):S instanceof p.TFile&&S.extension==="md"&&g.set(S.basename.toLowerCase().trim(),S);let f=new Set(o.map(S=>S.name.toLowerCase().trim())),w=o.filter(S=>{let A=S.name.toLowerCase().trim();return!u.has(A)}),C=c.filter(S=>{let A=S.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();return!h.has(A)&&!g.has(A)&&!u.has(S.name.toLowerCase().trim())}),v=[];for(let S of o){let A=S.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();(h.has(A)||g.has(A))&&!u.has(S.name.toLowerCase().trim())&&v.push(S)}let b=new Set([...o.map(S=>S.name.toLowerCase().trim()),...c.map(S=>S.name.toLowerCase().trim())]),W=[];if(s==="bl")for(let[S,A]of u.entries())b.has(S)||W.push(A);let I=0,B=0,_=0,K=0;if(v.length>0){console.log(`[Eudia] Promoting ${v.length} accounts from prospect to active`);for(let S of v){let A=S.name.replace(/[<>:"/\\|?*]/g,"_").trim(),j=h.get(A.toLowerCase()),x=g.get(A.toLowerCase());try{if(j){let F=`${this.settings.accountsFolder}/${A}`;await this.app.vault.rename(j,F),_++,new p.Notice(`${S.name} promoted to active`)}else if(x){await this.app.vault.delete(x);let F=[{id:S.id,name:S.name,type:S.customerType,isOwned:!0,hadOpportunity:!0}],he=await this.fetchEnrichmentData(F);await this.createTailoredAccountFolders(F,he),_++,new p.Notice(`${S.name} promoted to active -- full account folder created`)}}catch(F){console.error(`[Eudia] Failed to promote ${S.name}:`,F)}}}if(w.length>0){console.log(`[Eudia] Creating ${w.length} new active account folders for ${s}`);let S=new Set(v.map(j=>j.name.toLowerCase().trim())),A=w.filter(j=>!S.has(j.name.toLowerCase().trim()));if(A.length>0){let j=A.map(x=>({id:x.id,name:x.name,type:x.customerType,isOwned:s==="bl",ownerName:x.ownerName,hadOpportunity:!0}));if(s==="admin"||s==="exec")await this.createAdminAccountFolders(j);else{let x=await this.fetchEnrichmentData(j);await this.createTailoredAccountFolders(j,x)}I=A.length}this.telemetry&&this.telemetry.reportInfo("Accounts synced - added",{count:I,userGroup:s,region:a||void 0})}return C.length>0&&s==="bl"&&(console.log(`[Eudia] Creating ${C.length} new prospect files`),K=await this.createProspectAccountFiles(C.map(S=>({id:S.id,name:S.name,type:"Prospect",hadOpportunity:!1,website:S.website,industry:S.industry})))),this.settings.archiveRemovedAccounts&&W.length>0&&(console.log(`[Eudia] Archiving ${W.length} removed account folders`),B=await this.archiveAccountFolders(W),this.telemetry&&this.telemetry.reportInfo("Accounts synced - archived",{count:B})),console.log(`[Eudia] Sync complete: ${I} active added, ${K} prospects added, ${_} promoted, ${B} archived (group: ${s})`),{success:!0,added:I+K+_,archived:B,userGroup:s}}catch(e){return console.error("[Eudia] Account sync error:",e),this.telemetry&&this.telemetry.reportError("Account sync failed",{error:e.message}),{success:!1,added:0,archived:0,error:e.message}}}async archiveAccountFolders(t){let e=0,n=`${this.settings.accountsFolder}/_Archived`;this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);for(let i of t)try{let a=`${n}/${i.name}`;if(this.app.vault.getAbstractFileByPath(a)){let d=new Date().toISOString().split("T")[0];await this.app.fileManager.renameFile(i,`${n}/${i.name}_${d}`)}else await this.app.fileManager.renameFile(i,a);let c=`${n}/${i.name}/_archived.md`,l=`---
archived_date: ${new Date().toISOString()}
reason: Account no longer in book of business
---

This account folder was archived because it no longer appears in your Salesforce book of business.

To restore, move this folder back to the Accounts directory.
`;try{await this.app.vault.create(c,l)}catch{}e++,console.log(`[Eudia] Archived: ${i.name}`)}catch(a){console.error(`[Eudia] Failed to archive ${i.name}:`,a)}return e}async syncSpecificNoteToSalesforce(t){let e=await this.app.vault.read(t),n=this.app.metadataCache.getFileCache(t)?.frontmatter;if(!n?.sync_to_salesforce)return{success:!1,error:"sync_to_salesforce not enabled"};let s=n.account_id,i=n.account;if(!s&&i){let a=this.settings.cachedAccounts.find(o=>o.name.toLowerCase()===i.toLowerCase());a&&(s=a.id)}if(!s){let a=t.path.split("/");if(a.length>=2&&a[0]===this.settings.accountsFolder){let o=a[1]==="_Prospects"&&a.length>=3?a[2]:a[1],c=this.settings.cachedAccounts.find(l=>l.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);c&&(s=c.id,i=c.name)}}if(!s)return{success:!1,error:`Could not determine account for ${t.path}`};try{let a=await(0,p.requestUrl)({url:`${this.settings.serverUrl}/api/notes/sync`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:s,accountName:i,noteTitle:t.basename,notePath:t.path,content:e,frontmatter:n,syncedAt:new Date().toISOString(),userEmail:this.settings.userEmail})});return a.json?.success?{success:!0}:{success:!1,error:a.json?.error||"Unknown error",authRequired:a.json?.authRequired}}catch(a){return{success:!1,error:a.message}}}async syncNoteToSalesforce(){let t=this.app.workspace.getActiveFile();if(!t){new p.Notice("No active file to sync");return}if(!this.app.metadataCache.getFileCache(t)?.frontmatter?.sync_to_salesforce){new p.Notice("Set sync_to_salesforce: true in frontmatter to enable sync");return}new p.Notice("Syncing to Salesforce...");let n=await this.syncSpecificNoteToSalesforce(t);n.success?new p.Notice("Synced to Salesforce"):n.authRequired?new p.Notice("Salesforce authentication required. Please reconnect."):new p.Notice("Failed to sync: "+(n.error||"Unknown error"))}async checkAndAutoEnrich(){let t=this.settings.accountsFolder||"Accounts",e=this.app.vault.getAbstractFileByPath(t);if(!e||!(e instanceof p.TFolder))return;let n=[];for(let s of e.children){if(!(s instanceof p.TFolder)||s.name.startsWith("_"))continue;let i=`${s.path}/Contacts.md`,a=this.app.vault.getAbstractFileByPath(i);if(!(!a||!(a instanceof p.TFile))){if(this.app.metadataCache.getFileCache(a)?.frontmatter?.enriched_at)continue}let o=s.name,c=this.settings.cachedAccounts.find(l=>l.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);c&&c.id&&n.push({id:c.id,name:c.name,owner:"",ownerEmail:""})}if(n.length===0){console.log("[Eudia] Auto-enrich: all account folders already enriched");return}console.log(`[Eudia] Auto-enrich: ${n.length} accounts need enrichment`);try{await this.enrichAccountFolders(n)}catch(s){console.error("[Eudia] Auto-enrich failed:",s)}}async enrichAccountFolders(t){if(!t||t.length===0)return;let e=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=this.settings.accountsFolder||"Accounts",s=t.filter(d=>d.id&&d.id.startsWith("001"));if(s.length===0)return;let i=s.length,a=0,o=0;console.log(`[Eudia Enrich] Starting enrichment for ${i} accounts`),new p.Notice(`Enriching account data: 0/${i}...`);let c=20;for(let d=0;d<s.length;d+=c){let u=s.slice(d,d+c),y=u.map(h=>h.id);try{let h=await(0,p.requestUrl)({url:`${e}/api/accounts/enrich-batch`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountIds:y,userEmail:this.settings.userEmail})});if(h.json?.success&&h.json?.enrichments){let g=h.json.enrichments;for(let f of u){let w=g[f.id];if(w)try{await this.writeEnrichmentToAccount(f,w,n),a++}catch(C){o++,console.error(`[Eudia Enrich] Write failed for ${f.name}:`,C)}}}}catch(h){o+=u.length,console.error("[Eudia Enrich] Batch fetch failed:",h)}let m=Math.min(d+c,i);new p.Notice(`Enriching account data: ${m}/${i}...`),d+c<s.length&&await new Promise(h=>setTimeout(h,100))}let l=o>0?`Enrichment complete: ${a} enriched, ${o} skipped`:`Enrichment complete: ${a} accounts enriched with Salesforce data`;console.log(`[Eudia Enrich] ${l}`),new p.Notice(l)}async writeEnrichmentToAccount(t,e,n){let s=t.name.replace(/[<>:"/\\|?*]/g,"_").trim(),i=`${n}/${s}`,a=this.app.vault.getAbstractFileByPath(i);if(a instanceof p.TFolder||(i=`${n}/_Prospects/${s}`,a=this.app.vault.getAbstractFileByPath(i)),!(a instanceof p.TFolder))return;let o=new Date().toISOString(),c=async(l,d)=>{let u=`${i}/${l}`,y=this.app.vault.getAbstractFileByPath(u);if(!(y instanceof p.TFile))return;let m=await this.app.vault.read(y),h="",g=m;if(m.startsWith("---")){let v=m.indexOf("---",3);v!==-1&&(h=m.substring(0,v+3),g=m.substring(v+3),h.includes("enriched_at:")?h=h.replace(/enriched_at:.*/,`enriched_at: "${o}"`):h=h.substring(0,v)+`enriched_at: "${o}"
---`)}let f=g.match(/^(\s*#[^\n]+)/),C=`${f?f[1]:""}

${d}
`;await this.app.vault.modify(y,`${h}
${C}`)};if(e.contacts&&await c("Contacts.md",`${e.contacts}

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*`),e.intelligence&&await c("Intelligence.md",e.intelligence),e.nextSteps&&await c("Next Steps.md",e.nextSteps),e.opportunities||e.recentActivity){let l=`${i}/Meeting Notes.md`,d=this.app.vault.getAbstractFileByPath(l);if(d instanceof p.TFile){let u=await this.app.vault.read(d),y="",m=u;if(u.startsWith("---")){let w=u.indexOf("---",3);w!==-1&&(y=u.substring(0,w+3),m=u.substring(w+3),y.includes("enriched_at:")?y=y.replace(/enriched_at:.*/,`enriched_at: "${o}"`):y=y.substring(0,w)+`enriched_at: "${o}"
---`)}let h=m.match(/^(\s*#[^\n]+)/),f=[h?h[1]:`
# ${t.name} - Meeting Notes`,""];e.opportunities&&f.push(e.opportunities,""),e.recentActivity&&f.push(e.recentActivity,""),f.push("## Quick Start","","1. Open **Note 1** for your next meeting","2. Click the **microphone** to record and transcribe","3. **Next Steps** are auto-extracted after transcription","4. Set `sync_to_salesforce: true` to sync to Salesforce"),await this.app.vault.modify(d,`${y}
${f.join(`
`)}
`)}}}startSalesforceSyncScanner(){if(!this.settings.sfAutoSyncEnabled){console.log("[Eudia SF Sync] Auto-sync is disabled in settings"),this.updateSfSyncStatusBar("SF Sync: Off");return}let t=(this.settings.sfAutoSyncIntervalMinutes||15)*60*1e3;console.log(`[Eudia SF Sync] Starting scanner \u2014 interval: ${this.settings.sfAutoSyncIntervalMinutes}min`),this.updateSfSyncStatusBar("SF Sync: Idle");let e=window.setTimeout(()=>{this.runSalesforceSyncScan()},3e4);this.registerInterval(e),this.sfSyncIntervalId=window.setInterval(()=>{this.runSalesforceSyncScan()},t),this.registerInterval(this.sfSyncIntervalId)}async runSalesforceSyncScan(){if(!(!this.settings.sfAutoSyncEnabled||!this.settings.userEmail)){console.log("[Eudia SF Sync] Running scan...");try{let t=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!(t instanceof p.TFolder)){console.log("[Eudia SF Sync] Accounts folder not found");return}let e=[],n=d=>{for(let u of d.children)u instanceof p.TFile&&u.extension==="md"?e.push(u):u instanceof p.TFolder&&n(u)};n(t);let s=[];for(let d of e){let y=this.app.metadataCache.getFileCache(d)?.frontmatter;if(!y?.sync_to_salesforce)continue;let m=y.last_sf_sync?new Date(y.last_sf_sync).getTime():0;d.stat.mtime>m&&s.push(d)}if(s.length===0){console.log("[Eudia SF Sync] No flagged notes need syncing"),this.updateSfSyncStatusBar("SF Sync: Idle");return}console.log(`[Eudia SF Sync] ${s.length} note(s) queued for sync`),this.updateSfSyncStatusBar(`SF Sync: Syncing ${s.length}...`);let i=0,a=0;for(let d of s){let u=await this.syncSpecificNoteToSalesforce(d);if(u.success)i++,await this.updateNoteSyncTimestamp(d);else if(a++,console.log(`[Eudia SF Sync] Failed to sync ${d.path}: ${u.error}`),u.authRequired){new p.Notice("Salesforce authentication expired. Please reconnect to resume auto-sync."),this.updateSfSyncStatusBar("SF Sync: Auth required");return}}let c=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}),l=a>0?`SF Sync: ${i} synced, ${a} failed at ${c}`:`SF Sync: ${i} note${i!==1?"s":""} synced at ${c}`;console.log(`[Eudia SF Sync] ${l}`),this.updateSfSyncStatusBar(l),i>0&&new p.Notice(l)}catch(t){console.error("[Eudia SF Sync] Scan error:",t),this.updateSfSyncStatusBar("SF Sync: Error")}}}async updateNoteSyncTimestamp(t){try{let e=await this.app.vault.read(t),n=new Date().toISOString();if(e.startsWith("---")){let s=e.indexOf("---",3);if(s!==-1){let i=e.substring(0,s),a=e.substring(s);if(i.includes("last_sf_sync:")){let o=i.replace(/last_sf_sync:.*/,`last_sf_sync: "${n}"`)+a;await this.app.vault.modify(t,o)}else{let o=i+`last_sf_sync: "${n}"
`+a;await this.app.vault.modify(t,o)}}}}catch(e){console.error(`[Eudia SF Sync] Failed to update sync timestamp for ${t.path}:`,e)}}updateSfSyncStatusBar(t){this.sfSyncStatusBarEl&&this.sfSyncStatusBarEl.setText(t)}async createMeetingNote(){return new Promise(t=>{new te(this.app,this,async n=>{if(!n){t();return}let s=new Date().toISOString().split("T")[0],i=n.name.replace(/[<>:"/\\|?*]/g,"_").trim(),a=`${this.settings.accountsFolder}/${i}`,o=`${s} Meeting.md`,c=`${a}/${o}`;this.app.vault.getAbstractFileByPath(a)||await this.app.vault.createFolder(a);let l=`---
title: "Meeting with ${n.name}"
date: ${s}
account: "${n.name}"
account_id: "${n.id}"
meeting_type: discovery
sync_to_salesforce: false
transcribed: false
---

# Meeting with ${n.name}

## Pre-Call Notes

*Add context or questions here*



---

## Ready to Transcribe

Click the microphone icon or \`Cmd/Ctrl+P\` \u2192 "Transcribe Meeting"

---

`,d=await this.app.vault.create(c,l);await this.app.workspace.getLeaf().openFile(d),new p.Notice(`Created meeting note for ${n.name}`),t()}).open()})}async fetchAndInsertContext(){new p.Notice("Fetching pre-call context...")}async refreshAnalyticsDashboard(t){if(!this.settings.userEmail){console.log("[Eudia] Cannot refresh analytics - no email configured");return}let n=(await this.app.vault.read(t)).match(/^---\n([\s\S]*?)\n---/);if(!n)return;let s=n[1];if(!s.includes("type: analytics_dashboard"))return;let i=s.match(/category:\s*(\w+)/)?.[1]||"team";console.log(`[Eudia] Refreshing analytics dashboard: ${t.name} (${i})`);try{let a=null,o=this.settings.serverUrl,c=encodeURIComponent(this.settings.userEmail);switch(i){case"pain_points":a=(await(0,p.requestUrl)({url:`${o}/api/analytics/pain-points?days=30`,method:"GET"})).json,a.success&&await this.updatePainPointNote(t,a.painPoints);break;case"objections":a=(await(0,p.requestUrl)({url:`${o}/api/analytics/objection-playbook?days=90`,method:"GET"})).json,a.success&&await this.updateObjectionNote(t,a);break;case"coaching":case"team":default:a=(await(0,p.requestUrl)({url:`${o}/api/analytics/team-trends?managerId=${c}`,method:"GET"})).json,a.success&&await this.updateTeamPerformanceNote(t,a.trends);break}a?.success&&new p.Notice(`Analytics refreshed: ${t.name}`)}catch(a){console.error("[Eudia] Analytics refresh error:",a)}}async updatePainPointNote(t,e){if(!e||e.length===0)return;let n=new Date().toISOString().split("T")[0],s=e.slice(0,10).map(l=>`| ${l.painPoint||"--"} | ${l.count||0} | ${l.category||"--"} | ${l.averageSeverity||"medium"} |`).join(`
`),i={};for(let l of e){let d=l.category||"other";i[d]||(i[d]=[]),i[d].push(l)}let a="";for(let[l,d]of Object.entries(i)){a+=`
### ${l.charAt(0).toUpperCase()+l.slice(1)}
`;for(let u of d.slice(0,3))a+=`- ${u.painPoint}
`}let o=e.filter(l=>l.exampleQuotes&&l.exampleQuotes.length>0).slice(0,5).map(l=>`> "${l.exampleQuotes[0]}" - on ${l.painPoint}`).join(`

`),c=`---
type: analytics_dashboard
auto_refresh: true
category: pain_points
last_updated: ${n}
---

# Customer Pain Point Tracker

*Aggregated pain points from customer conversations*

---

## Top Pain Points (Last 30 Days)

| Pain Point | Frequency | Category | Severity |
|------------|-----------|----------|----------|
${s}

---

## By Category
${a}

---

## Example Quotes

${o||"*No quotes available*"}

---

> **Tip:** Use these pain points to prepare for customer calls.
`;await this.app.vault.modify(t,c)}async updateObjectionNote(t,e){if(!e.objections||e.objections.length===0)return;let n=new Date().toISOString().split("T")[0],s=e.objections.slice(0,10).map(o=>{let c=o.handleRatePercent>=75?"\u2705 Strong":o.handleRatePercent>=50?"\u26A0\uFE0F Moderate":"\u274C Needs Work";return`| ${o.objection?.substring(0,40)||"--"}... | ${o.count||0} | ${o.handleRatePercent||0}% | ${c} |`}).join(`
`),i="";for(let o of e.objections.slice(0,5))if(o.bestResponses&&o.bestResponses.length>0){i+=`
### Objection: "${o.objection?.substring(0,50)}..."

`,i+=`**Frequency:** ${o.count} times  
`,i+=`**Handle Rate:** ${o.handleRatePercent}%

`,i+=`**Best Responses:**
`;for(let c of o.bestResponses.slice(0,2))i+=`1. *"${c.response}"* - ${c.rep||"Team member"}
`;i+=`
`}let a=`---
type: analytics_dashboard
auto_refresh: true
category: objections
last_updated: ${n}
---

# Objection Playbook

*Common objections with handling success rates and best responses*

---

## Top Objections (Last 90 Days)

| Objection | Frequency | Handle Rate | Status |
|-----------|-----------|-------------|--------|
${s}

---

## Best Practices
${i||"*No best practices available yet*"}

---

## Coaching Notes

*Objections with <50% handle rate need training focus*

Average handle rate: ${e.avgHandleRate||0}%

---

> **Tip:** Review this playbook before important calls.
`;await this.app.vault.modify(t,a)}async updateTeamPerformanceNote(t,e){if(!e)return;let n=new Date().toISOString().split("T")[0],s=a=>a>0?`\u2191 ${Math.abs(a).toFixed(1)}%`:a<0?`\u2193 ${Math.abs(a).toFixed(1)}%`:"--",i=`---
type: analytics_dashboard
auto_refresh: true
refresh_interval: daily
last_updated: ${n}
---

# Team Performance Dashboard

*Auto-updated from GTM Brain analytics*

---

## Team Overview

| Metric | This Week | Trend |
|--------|-----------|-------|
| Calls Analyzed | ${e.callCount||0} | -- |
| Avg Score | ${e.avgScore?.toFixed(1)||"--"} | ${s(e.scoreTrend)} |
| Talk Ratio | ${e.avgTalkRatio?Math.round(e.avgTalkRatio*100):"--"}% | ${s(e.talkRatioTrend)} |
| Value Score | ${e.avgValueScore?.toFixed(1)||"--"} | ${s(e.valueScoreTrend)} |
| Next Step Rate | ${e.nextStepRate?Math.round(e.nextStepRate*100):"--"}% | -- |

---

## Top Pain Points

${e.topPainPoints?.slice(0,5).map(a=>`- **${a.painPoint}** (${a.count} mentions)`).join(`
`)||"*No pain points captured yet*"}

---

## Trending Topics

${e.trendingTopics?.slice(0,8).map(a=>`- ${a.topic} (${a.count})`).join(`
`)||"*No topics captured yet*"}

---

## Top Objections

${e.topObjections?.slice(0,5).map(a=>`- ${a.objection} - ${a.handleRatePercent}% handled`).join(`
`)||"*No objections captured yet*"}

---

> **Note:** This dashboard refreshes automatically when you open it.
> Data is aggregated from all analyzed calls in your region.
`;await this.app.vault.modify(t,i)}},ie=class extends p.PluginSettingTab{constructor(r,t){super(r,t),this.plugin=t}display(){let{containerEl:r}=this;r.empty(),r.createEl("h2",{text:"Eudia Sync & Scribe"}),r.createEl("h3",{text:"Your Profile"});let t=r.createDiv();t.style.cssText="padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px; margin-top: 16px;";let e=t.createDiv();e.style.cssText="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";let n=e.createSpan(),s=e.createSpan(),i=t.createDiv();i.style.cssText="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;",i.setText("Connect with Salesforce to sync notes with your user attribution.");let a=t.createEl("button");a.style.cssText="padding: 10px 20px; cursor: pointer; border-radius: 6px;";let o=null,c=async()=>{if(!this.plugin.settings.userEmail)return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);",s.setText("Enter email above first"),a.setText("Setup Required"),a.disabled=!0,a.style.opacity="0.5",a.style.cursor="not-allowed",!1;a.disabled=!1,a.style.opacity="1",a.style.cursor="pointer";try{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); animation: pulse 1s infinite;",s.setText("Checking..."),(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;",s.setText("Connected to Salesforce"),a.setText("Reconnect"),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),!0):(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;",s.setText("Not connected"),a.setText("Connect to Salesforce"),!1)}catch{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;",s.setText("Status unavailable"),a.setText("Connect to Salesforce"),!1}};new p.Setting(r).setName("Eudia Email").setDesc("Your @eudia.com email address for calendar and Salesforce sync").addText(m=>m.setPlaceholder("yourname@eudia.com").setValue(this.plugin.settings.userEmail).onChange(async h=>{let g=h.trim().toLowerCase();this.plugin.settings.userEmail=g,await this.plugin.saveSettings(),await c()})),new p.Setting(r).setName("Timezone").setDesc("Your local timezone for calendar event display").addDropdown(m=>{me.forEach(h=>{m.addOption(h.value,h.label)}),m.setValue(this.plugin.settings.timezone),m.onChange(async h=>{this.plugin.settings.timezone=h,await this.plugin.saveSettings(),this.plugin.calendarService?.setTimezone(h),new p.Notice(`Timezone set to ${me.find(g=>g.value===h)?.label||h}`)})}),r.createEl("h3",{text:"Salesforce Connection"}),r.appendChild(t);let l=()=>{o&&window.clearInterval(o);let m=0,h=30;o=window.setInterval(async()=>{m++,await c()?(o&&(window.clearInterval(o),o=null),new p.Notice("Salesforce connected successfully!")):m>=h&&o&&(window.clearInterval(o),o=null)},5e3)};a.onclick=async()=>{if(!this.plugin.settings.userEmail){new p.Notice("Please enter your email first");return}let m=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(m,"_blank"),new p.Notice("Complete the Salesforce login in the popup window",5e3),l()},c(),r.createEl("h3",{text:"Server"}),new p.Setting(r).setName("GTM Brain Server").setDesc("Server URL for calendar, accounts, and sync").addText(m=>m.setValue(this.plugin.settings.serverUrl).onChange(async h=>{this.plugin.settings.serverUrl=h,await this.plugin.saveSettings()}));let d=r.createDiv({cls:"settings-advanced-collapsed"}),u=d.createDiv({cls:"eudia-transcription-status"});u.style.cssText="padding: 12px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;",u.innerHTML='<span style="color: var(--text-muted);">Checking server transcription status...</span>',(async()=>{try{(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/plugin/config`,method:"GET"})).json?.capabilities?.serverTranscription?u.innerHTML='<span class="eudia-check-icon"></span> Server transcription is available. No local API key needed.':u.innerHTML='<span class="eudia-warn-icon"></span> Server transcription unavailable. Add a local API key below.'}catch{u.innerHTML='<span style="color: #f59e0b;">\u26A0</span> Could not check server status. Local API key recommended as backup.'}})();let y=new p.Setting(r).setName("Advanced Options").setDesc("Show fallback API key (usually not needed)").addToggle(m=>m.setValue(!1).onChange(h=>{d.style.display=h?"block":"none"}));d.style.display="none",r.createEl("h3",{text:"Transcription"}),new p.Setting(r).setName("Save Audio Files").setDesc("Keep original audio recordings").addToggle(m=>m.setValue(this.plugin.settings.saveAudioFiles).onChange(async h=>{this.plugin.settings.saveAudioFiles=h,await this.plugin.saveSettings()})),new p.Setting(r).setName("Append Full Transcript").setDesc("Include complete transcript in notes").addToggle(m=>m.setValue(this.plugin.settings.appendTranscript).onChange(async h=>{this.plugin.settings.appendTranscript=h,await this.plugin.saveSettings()})),r.createEl("h3",{text:"Sync"}),new p.Setting(r).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle(m=>m.setValue(this.plugin.settings.syncOnStartup).onChange(async h=>{this.plugin.settings.syncOnStartup=h,await this.plugin.saveSettings()})),new p.Setting(r).setName("Auto-Sync After Transcription").setDesc("Push notes to Salesforce after transcription").addToggle(m=>m.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async h=>{this.plugin.settings.autoSyncAfterTranscription=h,await this.plugin.saveSettings()})),new p.Setting(r).setName("Auto-Sync Flagged Notes").setDesc("Periodically push notes with sync_to_salesforce: true to Salesforce").addToggle(m=>m.setValue(this.plugin.settings.sfAutoSyncEnabled).onChange(async h=>{this.plugin.settings.sfAutoSyncEnabled=h,await this.plugin.saveSettings(),h?this.plugin.startSalesforceSyncScanner():this.plugin.updateSfSyncStatusBar("SF Sync: Off")})),new p.Setting(r).setName("Auto-Sync Interval").setDesc("How often to scan for flagged notes (in minutes)").addDropdown(m=>{m.addOption("5","Every 5 minutes"),m.addOption("15","Every 15 minutes"),m.addOption("30","Every 30 minutes"),m.setValue(String(this.plugin.settings.sfAutoSyncIntervalMinutes)),m.onChange(async h=>{this.plugin.settings.sfAutoSyncIntervalMinutes=parseInt(h),await this.plugin.saveSettings(),new p.Notice(`SF auto-sync interval set to ${h} minutes. Restart Obsidian for changes to take effect.`)})}),r.createEl("h3",{text:"Folders"}),new p.Setting(r).setName("Accounts Folder").setDesc("Where account folders are stored").addText(m=>m.setValue(this.plugin.settings.accountsFolder).onChange(async h=>{this.plugin.settings.accountsFolder=h||"Accounts",await this.plugin.saveSettings()})),new p.Setting(r).setName("Recordings Folder").setDesc("Where audio files are saved").addText(m=>m.setValue(this.plugin.settings.recordingsFolder).onChange(async h=>{this.plugin.settings.recordingsFolder=h||"Recordings",await this.plugin.saveSettings()})),r.createEl("h3",{text:"Actions"}),new p.Setting(r).setName("Sync Accounts Now").setDesc(`${this.plugin.settings.cachedAccounts.length} accounts available for matching`).addButton(m=>m.setButtonText("Sync").setCta().onClick(async()=>{await this.plugin.syncAccounts(),this.display()})),new p.Setting(r).setName("Refresh Account Folders").setDesc("Check for new account assignments and create folders for them").addButton(m=>m.setButtonText("Refresh Folders").onClick(async()=>{m.setButtonText("Checking..."),m.setDisabled(!0);try{let h=await this.plugin.refreshAccountFolders();h>0?new p.Notice(`Created ${h} new account folder${h>1?"s":""}`):new p.Notice("All account folders are up to date")}catch(h){new p.Notice("Failed to refresh folders: "+h.message)}m.setButtonText("Refresh Folders"),m.setDisabled(!1),this.display()})),this.plugin.settings.lastSyncTime&&r.createEl("p",{text:`Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()}`,cls:"setting-item-description"}),r.createEl("p",{text:`Audio transcription: ${T.isSupported()?"Supported":"Not supported"}`,cls:"setting-item-description"})}};
