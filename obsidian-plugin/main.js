var ye=Object.create;var U=Object.defineProperty;var ge=Object.getOwnPropertyDescriptor;var fe=Object.getOwnPropertyNames;var we=Object.getPrototypeOf,Oe=Object.prototype.hasOwnProperty;var ve=(f,s)=>{for(var e in s)U(f,e,{get:s[e],enumerable:!0})},se=(f,s,e,t)=>{if(s&&typeof s=="object"||typeof s=="function")for(let n of fe(s))!Oe.call(f,n)&&n!==e&&U(f,n,{get:()=>s[n],enumerable:!(t=ge(s,n))||t.enumerable});return f};var z=(f,s,e)=>(e=f!=null?ye(we(f)):{},se(s||!f||!f.__esModule?U(e,"default",{value:f,enumerable:!0}):e,f)),Se=f=>se(U({},"__esModule",{value:!0}),f);var Le={};ve(Le,{default:()=>K});module.exports=Se(Le);var u=require("obsidian");var $=class f{constructor(){this.mediaRecorder=null;this.audioChunks=[];this.stream=null;this.startTime=0;this.pausedDuration=0;this.pauseStartTime=0;this.durationInterval=null;this.audioContext=null;this.analyser=null;this.levelInterval=null;this.lastExtractedChunkIndex=0;this.mimeTypeCache="audio/webm";this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0};this.stateCallback=null;this.levelHistory=[];this.trackingLevels=!1}onStateChange(s){this.stateCallback=s}static isIOSOrSafari(){let s=navigator.userAgent,e=/iPad|iPhone|iPod/.test(s)&&!window.MSStream,t=/^((?!chrome|android).)*safari/i.test(s);return e||t}getSupportedMimeType(){let s=f.isIOSOrSafari(),e=s?["audio/mp4","audio/mp4;codecs=aac","audio/aac","audio/webm;codecs=opus","audio/webm"]:["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];for(let t of e)if(MediaRecorder.isTypeSupported(t))return console.log(`[AudioRecorder] Using MIME type: ${t} (iOS/Safari: ${s})`),t;return s?"audio/mp4":"audio/webm"}async startRecording(){if(this.state.isRecording)throw new Error("Already recording");try{let s=f.isIOSOrSafari(),e=s?{echoCancellation:!0,noiseSuppression:!0}:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0,sampleRate:48e3,channelCount:1};this.stream=await navigator.mediaDevices.getUserMedia({audio:e}),console.log(`[AudioRecorder] Microphone access granted (iOS/Safari: ${s})`),this.setupAudioAnalysis();let t=this.getSupportedMimeType();this.mimeTypeCache=t,this.mediaRecorder=new MediaRecorder(this.stream,{mimeType:t,audioBitsPerSecond:96e3}),this.audioChunks=[],this.lastExtractedChunkIndex=0,this.mediaRecorder.ondataavailable=n=>{n.data.size>0&&this.audioChunks.push(n.data)},this.mediaRecorder.start(1e3),this.startTime=Date.now(),this.pausedDuration=0,this.state={isRecording:!0,isPaused:!1,duration:0,audioLevel:0},this.startDurationTracking(),this.startLevelTracking(),this.notifyStateChange()}catch(s){throw this.cleanup(),new Error(`Failed to start recording: ${s.message}`)}}setupAudioAnalysis(){if(this.stream)try{this.audioContext=new AudioContext;let s=this.audioContext.createMediaStreamSource(this.stream);this.analyser=this.audioContext.createAnalyser(),this.analyser.fftSize=256,s.connect(this.analyser)}catch(s){console.warn("Failed to set up audio analysis:",s)}}startDurationTracking(){this.durationInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused){let s=Date.now()-this.startTime-this.pausedDuration;this.state.duration=Math.floor(s/1e3),this.notifyStateChange()}},100)}startLevelTracking(){if(!this.analyser)return;let s=new Uint8Array(this.analyser.frequencyBinCount);this.levelInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused&&this.analyser){this.analyser.getByteFrequencyData(s);let e=0;for(let n=0;n<s.length;n++)e+=s[n];let t=e/s.length;this.state.audioLevel=Math.min(100,Math.round(t/255*100*2)),this.notifyStateChange()}},50)}pauseRecording(){!this.state.isRecording||this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="recording"&&(this.mediaRecorder.pause(),this.pauseStartTime=Date.now(),this.state.isPaused=!0,this.notifyStateChange())}resumeRecording(){!this.state.isRecording||!this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="paused"&&(this.mediaRecorder.resume(),this.pausedDuration+=Date.now()-this.pauseStartTime,this.state.isPaused=!1,this.notifyStateChange())}async stopRecording(){return new Promise((s,e)=>{if(!this.mediaRecorder||!this.state.isRecording){e(new Error("Not currently recording"));return}let t=this.mediaRecorder.mimeType,n=this.state.duration,r=!1,i=setTimeout(()=>{if(!r){r=!0,console.warn("AudioRecorder: onstop timeout, forcing completion");try{let a=new Blob(this.audioChunks,{type:t}),o=new Date,c=o.toISOString().split("T")[0],l=o.toTimeString().split(" ")[0].replace(/:/g,"-"),d=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm",m=`recording-${c}-${l}.${d}`;this.cleanup(),s({audioBlob:a,duration:n,mimeType:t,filename:m})}catch{this.cleanup(),e(new Error("Failed to process recording after timeout"))}}},1e4);this.mediaRecorder.onstop=()=>{if(!r){r=!0,clearTimeout(i);try{console.log(`[AudioRecorder] Chunks collected: ${this.audioChunks.length}`);let a=new Blob(this.audioChunks,{type:t});console.log(`[AudioRecorder] Blob size: ${a.size} bytes`);let o=new Date,c=o.toISOString().split("T")[0],l=o.toTimeString().split(" ")[0].replace(/:/g,"-"),d=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm",m=`recording-${c}-${l}.${d}`;this.cleanup(),s({audioBlob:a,duration:n,mimeType:t,filename:m})}catch(a){this.cleanup(),e(a)}}},this.mediaRecorder.onerror=a=>{r||(r=!0,clearTimeout(i),this.cleanup(),e(new Error("Recording error occurred")))},this.mediaRecorder.state==="recording"&&this.mediaRecorder.requestData(),setTimeout(()=>{this.mediaRecorder&&this.mediaRecorder.state!=="inactive"&&this.mediaRecorder.stop()},100)})}cancelRecording(){this.cleanup()}cleanup(){this.durationInterval&&(clearInterval(this.durationInterval),this.durationInterval=null),this.levelInterval&&(clearInterval(this.levelInterval),this.levelInterval=null),this.audioContext&&(this.audioContext.close().catch(()=>{}),this.audioContext=null,this.analyser=null),this.stream&&(this.stream.getTracks().forEach(s=>s.stop()),this.stream=null),this.mediaRecorder=null,this.audioChunks=[],this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0},this.notifyStateChange()}getState(){return{...this.state}}static isSupported(){if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder)return!1;let e=["audio/webm","audio/mp4","audio/ogg","audio/webm;codecs=opus"].some(t=>MediaRecorder.isTypeSupported(t));return e||console.warn("[AudioRecorder] No supported audio formats found"),e}static getMobileInstructions(){return this.isIOSOrSafari()?"For best results on iOS, ensure you have granted microphone permissions in Settings > Privacy > Microphone.":null}notifyStateChange(){this.stateCallback&&this.stateCallback({...this.state})}static formatDuration(s){let e=Math.floor(s/60),t=s%60;return`${e.toString().padStart(2,"0")}:${t.toString().padStart(2,"0")}`}static async blobToBase64(s){return new Promise((e,t)=>{let n=new FileReader;n.onload=()=>{let i=n.result.split(",")[1];e(i)},n.onerror=t,n.readAsDataURL(s)})}static async blobToArrayBuffer(s){return s.arrayBuffer()}async start(){return this.startRecording()}async stop(){return this.stopRecording()}pause(){return this.pauseRecording()}resume(){return this.resumeRecording()}cancel(){return this.cancelRecording()}isRecording(){return this.state.isRecording}extractNewChunks(){if(!this.state.isRecording||this.audioChunks.length===0)return null;let s=this.audioChunks.slice(this.lastExtractedChunkIndex);return s.length===0?null:(this.lastExtractedChunkIndex=this.audioChunks.length,new Blob(s,{type:this.mimeTypeCache}))}getAllChunksAsBlob(){return this.audioChunks.length===0?null:new Blob(this.audioChunks,{type:this.mimeTypeCache})}getDuration(){return this.state.duration}getMimeType(){return this.mimeTypeCache}startLevelHistoryTracking(){this.levelHistory=[],this.trackingLevels=!0}recordLevelSample(){this.trackingLevels&&this.levelHistory.push(this.state.audioLevel)}getAudioDiagnostic(){if(this.levelHistory.length===0)return{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:100,warning:"Unable to analyze audio levels - recording may be too short"};let s=this.levelHistory.reduce((i,a)=>i+a,0)/this.levelHistory.length,e=Math.max(...this.levelHistory),t=this.levelHistory.filter(i=>i<5).length,n=Math.round(t/this.levelHistory.length*100),r=null;return e<5?r="SILENT AUDIO: No audio was detected during recording. Check your microphone settings and ensure Obsidian has microphone permission.":s<10&&n>80?r="VERY LOW AUDIO: Audio levels were extremely low. The transcription may not be accurate. Check your microphone or move closer to it.":n>90&&(r="MOSTLY SILENT: Over 90% of the recording had no audio. Make sure you're capturing the meeting audio, not just silence."),{hasAudio:e>=5,averageLevel:Math.round(s),peakLevel:e,silentPercent:n,warning:r}}static async analyzeAudioBlob(s){try{let e=new AudioContext,t=await s.arrayBuffer(),n;try{n=await e.decodeAudioData(t)}catch{return await e.close(),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:"Could not analyze audio format. Proceeding with transcription."}}let r=n.getChannelData(0),i=0,a=0,o=0,c=.01,l=100,d=0;for(let v=0;v<r.length;v+=l){let w=Math.abs(r[v]);i+=w,w>a&&(a=w),w<c&&o++,d++}await e.close();let m=i/d,y=Math.round(o/d*100),p=Math.round(m*100*10),h=Math.round(a*100),g=null;return a<.01?g='SILENT AUDIO DETECTED: The recording appears to contain only silence. This typically causes Whisper to hallucinate random text like "Yes. Yes. Yes." Check your audio input source.':m<.005&&y>95?g="NEAR-SILENT AUDIO: The recording is almost entirely silent. The transcription will likely be inaccurate.":y>90&&(g="MOSTLY SILENT: Over 90% of the recording is silent. Consider checking your audio setup."),{hasAudio:a>=.01,averageLevel:p,peakLevel:h,silentPercent:y,warning:g}}catch(e){return console.error("Audio analysis failed:",e),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:null}}}};var P=require("obsidian");var X=class{constructor(){this.salesforceAccounts=[]}setAccounts(s){this.salesforceAccounts=s}detectAccount(s,e,t){if(s){let n=this.detectFromTitle(s);if(n.confidence>=70)return n}if(t){let n=this.detectFromFilePath(t);if(n.confidence>=70)return n}if(e&&e.length>0){let n=this.detectFromAttendees(e);if(n.confidence>=50)return n}return{account:null,accountId:null,confidence:0,source:"none",evidence:"No account detected from available context"}}detectFromTitle(s){if(!s)return{account:null,accountId:null,confidence:0,source:"title",evidence:"No title"};let e=[{regex:/^([A-Za-z0-9][^-–—]+?)\s*[-–—]\s*(?:[A-Z][a-z]+|[A-Za-z]{2,})/,confidence:85},{regex:/(?:call|meeting|sync|check-in|demo|discovery)\s+(?:with|re:?|@)\s+([^-–—]+?)(?:\s*[-–—]|$)/i,confidence:80},{regex:/^([A-Za-z][^-–—]+?)\s+(?:discovery|demo|review|kickoff|intro|onboarding|sync)\s*(?:call)?$/i,confidence:75},{regex:/^([^:]+?):\s+/i,confidence:70},{regex:/^\[([^\]]+)\]/,confidence:75}],t=["weekly","daily","monthly","internal","team","1:1","one on one","standup","sync","meeting","call","notes","monday","tuesday","wednesday","thursday","friday","untitled","new","test"];for(let n of e){let r=s.match(n.regex);if(r&&r[1]){let i=r[1].trim();if(t.some(o=>i.toLowerCase()===o)||i.length<2)continue;let a=this.fuzzyMatchSalesforce(i);return a?{account:a.name,accountId:a.id,confidence:Math.min(n.confidence+10,100),source:"salesforce_match",evidence:`Matched "${i}" from title to Salesforce account "${a.name}"`}:{account:i,accountId:null,confidence:n.confidence,source:"title",evidence:"Extracted from meeting title pattern"}}}return{account:null,accountId:null,confidence:0,source:"title",evidence:"No pattern matched"}}detectFromFilePath(s){let e=s.match(/Accounts\/([^\/]+)\//i);if(e&&e[1]){let t=e[1].trim(),n=this.fuzzyMatchSalesforce(t);return n?{account:n.name,accountId:n.id,confidence:95,source:"salesforce_match",evidence:`File in account folder "${t}" matched to "${n.name}"`}:{account:t,accountId:null,confidence:85,source:"title",evidence:`File located in Accounts/${t} folder`}}return{account:null,accountId:null,confidence:0,source:"none",evidence:"Not in Accounts folder"}}detectFromAttendees(s){let e=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com"],t=new Set;for(let a of s){let c=a.toLowerCase().match(/@([a-z0-9.-]+)/);if(c){let l=c[1];!l.includes("eudia.com")&&!e.includes(l)&&t.add(l)}}if(t.size===0)return{account:null,accountId:null,confidence:0,source:"attendee_domain",evidence:"No external domains"};for(let a of t){let o=a.split(".")[0],c=o.charAt(0).toUpperCase()+o.slice(1),l=this.fuzzyMatchSalesforce(c);if(l)return{account:l.name,accountId:l.id,confidence:75,source:"salesforce_match",evidence:`Matched attendee domain ${a} to "${l.name}"`}}let n=Array.from(t)[0],r=n.split(".")[0];return{account:r.charAt(0).toUpperCase()+r.slice(1),accountId:null,confidence:50,source:"attendee_domain",evidence:`Guessed from external attendee domain: ${n}`}}fuzzyMatchSalesforce(s){if(!s||this.salesforceAccounts.length===0)return null;let e=s.toLowerCase().trim();for(let t of this.salesforceAccounts)if(t.name?.toLowerCase()===e)return t;for(let t of this.salesforceAccounts)if(t.name?.toLowerCase().startsWith(e))return t;for(let t of this.salesforceAccounts)if(t.name?.toLowerCase().includes(e))return t;for(let t of this.salesforceAccounts)if(e.includes(t.name?.toLowerCase()))return t;return null}suggestAccounts(s,e=10){if(!s||s.length<2)return this.salesforceAccounts.slice(0,e).map(r=>({...r,score:0}));let t=s.toLowerCase(),n=[];for(let r of this.salesforceAccounts){let i=r.name?.toLowerCase()||"",a=0;i===t?a=100:i.startsWith(t)?a=90:i.includes(t)?a=70:t.includes(i)&&(a=50),a>0&&n.push({...r,score:a})}return n.sort((r,i)=>i.score-r.score).slice(0,e)}},Be=new X,Ce=["pipeline review","pipeline call","weekly pipeline","forecast call","forecast review","deal review","opportunity review","sales review","pipeline sync","forecast sync","deal sync","pipeline update","forecast meeting"];function re(f,s){if(f){let e=f.toLowerCase();for(let t of Ce)if(e.includes(t))return{isPipelineMeeting:!0,confidence:95,evidence:`Title contains "${t}"`}}if(s&&s.length>=2){let e=["eudia.com","johnsonhana.com"];if(s.every(n=>{let r=n.toLowerCase().split("@")[1]||"";return e.some(i=>r.includes(i))})&&s.length>=3){if(f){let n=f.toLowerCase();if(["sync","review","update","weekly","team","forecast"].some(a=>n.includes(a)))return{isPipelineMeeting:!0,confidence:70,evidence:`All internal attendees (${s.length}) with team meeting signal`}}return{isPipelineMeeting:!1,confidence:40,evidence:"All internal attendees but no clear pipeline signal"}}}return{isPipelineMeeting:!1,confidence:0,evidence:"No pipeline meeting indicators found"}}function be(f,s){let e="";return(s?.account||s?.opportunities?.length)&&(e=`
ACCOUNT CONTEXT (use to inform your analysis):
${s.account?`- Account: ${s.account.name}`:""}
${s.account?.owner?`- Account Owner: ${s.account.owner}`:""}
${s.opportunities?.length?`- Open Opportunities: ${s.opportunities.map(t=>`${t.name} (${t.stage}, $${(t.acv/1e3).toFixed(0)}k)`).join("; ")}`:""}
${s.contacts?.length?`- Known Contacts: ${s.contacts.slice(0,5).map(t=>`${t.name} - ${t.title}`).join("; ")}`:""}
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
- Action items have clear owners`}function Ae(f){return`You are a sales operations analyst producing the weekly pipeline review summary for Eudia, an AI-powered legal technology company. You are processing the transcript of an internal team pipeline review meeting.
${f?`

SALESFORCE PIPELINE DATA (current as of today):
${f}

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
10. If the meeting discussed general topics like demo stability, growth motion, enablement, or hiring \u2014 capture these in the Growth & Cross-Team section, not mixed into account tables.`}var Y=class{constructor(s){this.serverUrl=s}setServerUrl(s){this.serverUrl=s}async transcribeAndSummarize(s,e,t,n,r){try{let i=r?.meetingType==="pipeline_review",a=i?Ae(r?.pipelineContext):be(t,r),o=await(0,P.requestUrl)({url:`${this.serverUrl}/api/transcribe-and-summarize`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:s,mimeType:e,accountName:i?"Pipeline Review":t,accountId:n,meetingType:r?.meetingType||"discovery",context:r?{customerBrain:r.account?.customerBrain,opportunities:r.opportunities,contacts:r.contacts}:void 0,systemPrompt:a})});return o.json.success?{success:!0,transcript:o.json.transcript||"",sections:this.normalizeSections(o.json.sections),duration:o.json.duration||0}:{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:o.json.error||"Transcription failed"}}catch(i){console.error("Server transcription error:",i),i.response&&console.error("Server response:",i.response);let a="";try{i.response?.json?.error?a=i.response.json.error:typeof i.response=="string"&&(a=JSON.parse(i.response).error||"")}catch{}let o=a||`Transcription failed: ${i.message}`;return i.message?.includes("413")?o="Audio file too large for server. Try a shorter recording.":i.message?.includes("500")?o=a||"Server error during transcription. Please try again.":(i.message?.includes("Failed to fetch")||i.message?.includes("NetworkError"))&&(o="Could not reach transcription server. Check your internet connection."),console.error("Final error message:",o),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:o}}}parseSections(s){let e=this.getEmptySections(),t={summary:"summary",attendees:"attendees","meddicc signals":"meddiccSignals","product interest":"productInterest","pain points":"painPoints","buying triggers":"buyingTriggers","key dates":"keyDates","next steps":"nextSteps","action items":"actionItems","action items (internal)":"actionItems","deal signals":"dealSignals","risks & objections":"risksObjections","risks and objections":"risksObjections","competitive intelligence":"competitiveIntel"},n=/## ([^\n]+)\n([\s\S]*?)(?=## |$)/g,r;for(;(r=n.exec(s))!==null;){let i=r[1].trim().toLowerCase(),a=r[2].trim(),o=t[i];o&&(e[o]=a)}return e}normalizeSections(s){let e=this.getEmptySections();return s?{...e,...s}:e}async getMeetingContext(s){try{let e=await(0,P.requestUrl)({url:`${this.serverUrl}/api/meeting-context/${s}`,method:"GET",headers:{Accept:"application/json"}});return e.json.success?{success:!0,account:e.json.account,opportunities:e.json.opportunities,contacts:e.json.contacts,lastMeeting:e.json.lastMeeting}:{success:!1,error:e.json.error||"Failed to fetch context"}}catch(e){return console.error("Meeting context error:",e),{success:!1,error:e.message||"Network error"}}}async syncToSalesforce(s,e,t,n,r,i){try{let a=await(0,P.requestUrl)({url:`${this.serverUrl}/api/transcription/sync-to-salesforce`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:s,accountName:e,noteTitle:t,sections:n,transcript:r,meetingDate:i||new Date().toISOString(),syncedAt:new Date().toISOString()})});return a.json.success?{success:!0,customerBrainUpdated:a.json.customerBrainUpdated,eventCreated:a.json.eventCreated,eventId:a.json.eventId,contactsCreated:a.json.contactsCreated,tasksCreated:a.json.tasksCreated}:{success:!1,error:a.json.error||"Sync failed"}}catch(a){return console.error("Salesforce sync error:",a),{success:!1,error:a.message||"Network error"}}}getEmptySections(){return{summary:"",attendees:"",meddiccSignals:"",productInterest:"",painPoints:"",buyingTriggers:"",keyDates:"",nextSteps:"",actionItems:"",dealSignals:"",risksObjections:"",competitiveIntel:""}}async liveQueryTranscript(s,e,t){if(!e||e.trim().length<50)return{success:!1,answer:"",error:"Not enough transcript captured yet. Keep recording for a few more minutes."};try{let n=await(0,P.requestUrl)({url:`${this.serverUrl}/api/live-query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:s,transcript:e,accountName:t,systemPrompt:this.buildLiveQueryPrompt()})});return n.json.success?{success:!0,answer:n.json.answer||"No relevant information found in the transcript."}:{success:!1,answer:"",error:n.json.error||"Query failed"}}catch(n){return console.error("Live query error:",n),{success:!1,answer:"",error:n.message||"Failed to query transcript"}}}async transcribeChunk(s,e){try{let t=await(0,P.requestUrl)({url:`${this.serverUrl}/api/transcribe-chunk`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:s,mimeType:e})});return t.json.success?{success:!0,text:t.json.text||""}:{success:!1,text:"",error:t.json.error||"Chunk transcription failed"}}catch(t){return console.error("Chunk transcription error:",t),{success:!1,text:"",error:t.message||"Failed to transcribe chunk"}}}buildLiveQueryPrompt(){return`You are an AI assistant helping a salesperson during an active customer call. 
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

Format your response as a brief, actionable answer suitable for quick reference during a call.`}static formatSectionsForNote(s,e,t){let n="";if(s.summary&&(n+=`## TL;DR

${s.summary}

`),t?.enabled&&t?.talkTime){n+=`## Call Analytics

`;let i=t.talkTime.repPercent,a=t.talkTime.customerPercent,o=t.talkTime.isHealthyRatio?"\u2705":"\u26A0\uFE0F";n+=`**Talk Time:** Rep ${i}% / Customer ${a}% ${o}
`;let c=Math.round(i/5),l=Math.round(a/5);if(n+=`\`${"\u2588".repeat(c)}${"\u2591".repeat(20-c)}\` Rep
`,n+=`\`${"\u2588".repeat(l)}${"\u2591".repeat(20-l)}\` Customer

`,t.coaching){let d=t.coaching;if(d.totalQuestions>0){let m=Math.round(d.openQuestions/d.totalQuestions*100);n+=`**Questions:** ${d.totalQuestions} total (${d.openQuestions} open, ${d.closedQuestions} closed - ${m}% open)
`}if(d.objections&&d.objections.length>0){let m=d.objections.filter(y=>y.handled).length;n+=`**Objections:** ${d.objections.length} raised, ${m} handled
`}d.valueScore!==void 0&&(n+=`**Value Articulation:** ${d.valueScore}/10
`),d.nextStepClear!==void 0&&(n+=`**Next Step Clarity:** ${d.nextStepClear?"\u2705 Clear":"\u26A0\uFE0F Unclear"}
`),n+=`
`}}s.painPoints&&!s.painPoints.includes("None explicitly stated")&&(n+=`## Pain Points

${s.painPoints}

`),s.productInterest&&!s.productInterest.includes("None identified")&&(n+=`## Product Interest

${s.productInterest}

`),s.meddiccSignals&&(n+=`## MEDDICC Signals

${s.meddiccSignals}

`),s.nextSteps&&(n+=`## Next Steps

${s.nextSteps}

`),s.actionItems&&(n+=`## Action Items (Internal)

${s.actionItems}

`),s.keyDates&&!s.keyDates.includes("No specific dates")&&(n+=`## Key Dates

${s.keyDates}

`),s.buyingTriggers&&(n+=`## Buying Triggers

${s.buyingTriggers}

`),s.dealSignals&&(n+=`## Deal Signals

${s.dealSignals}

`),s.risksObjections&&!s.risksObjections.includes("None raised")&&(n+=`## Risks & Objections

${s.risksObjections}

`),s.competitiveIntel&&!s.competitiveIntel.includes("No competitive")&&(n+=`## Competitive Intelligence

${s.competitiveIntel}

`),s.attendees&&(n+=`## Attendees

${s.attendees}

`);let r=t?.enabled&&t?.formattedTranscript?t.formattedTranscript:e;if(r){let i=t?.enabled?"Full Transcript (Speaker-Attributed)":"Full Transcript";n+=`---

<details>
<summary><strong>${i}</strong></summary>

${r}

</details>
`}return n}static formatSectionsWithAudio(s,e,t,n){let r=this.formatSectionsForNote(s,e,n);return t&&(r+=`
---

## Recording

![[${t}]]
`),r}static formatContextForNote(s){if(!s.success)return"";let e=`## Pre-Call Context

`;if(s.account&&(e+=`**Account:** ${s.account.name}
`,e+=`**Owner:** ${s.account.owner}

`),s.opportunities&&s.opportunities.length>0){e+=`### Open Opportunities

`;for(let t of s.opportunities){let n=t.acv?`$${(t.acv/1e3).toFixed(0)}k`:"TBD";e+=`- **${t.name}** - ${t.stage} - ${n}`,t.targetSignDate&&(e+=` - Target: ${new Date(t.targetSignDate).toLocaleDateString()}`),e+=`
`}e+=`
`}if(s.contacts&&s.contacts.length>0){e+=`### Key Contacts

`;for(let t of s.contacts.slice(0,5))e+=`- **${t.name}**`,t.title&&(e+=` - ${t.title}`),e+=`
`;e+=`
`}if(s.lastMeeting&&(e+=`### Last Meeting

`,e+=`${new Date(s.lastMeeting.date).toLocaleDateString()} - ${s.lastMeeting.subject}

`),s.account?.customerBrain){let t=s.account.customerBrain.substring(0,500);t&&(e+=`### Recent Notes

`,e+=`${t}${s.account.customerBrain.length>500?"...":""}

`)}return e+=`---

`,e}async blobToBase64(s){return new Promise((e,t)=>{let n=new FileReader;n.onload=()=>{let i=n.result.split(",")[1];e(i)},n.onerror=t,n.readAsDataURL(s)})}async transcribeAudio(s,e){try{let t=await this.blobToBase64(s),n=s.type||"audio/webm",r=e?.meetingType==="pipeline_review"?{success:!0,meetingType:"pipeline_review",pipelineContext:e.pipelineContext}:void 0,i=await this.transcribeAndSummarize(t,n,e?.accountName,e?.accountId,r);return{text:i.transcript,confidence:i.success?.95:0,duration:i.duration,sections:i.sections}}catch(t){return console.error("transcribeAudio error:",t),{text:"",confidence:0,duration:0,sections:this.getEmptySections()}}}async processTranscription(s,e){if(!s||s.trim().length===0)return this.getEmptySections();try{let t=await(0,P.requestUrl)({url:`${this.serverUrl}/api/process-sections`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript:s,accountName:e?.accountName,context:e})});if(t.json?.success&&t.json?.sections){let n=t.json.sections;return{summary:n.summary||"",painPoints:n.painPoints||n.keyPoints||"",productInterest:n.productInterest||"",meddiccSignals:n.meddiccSignals||"",nextSteps:n.nextSteps||"",actionItems:n.actionItems||"",keyDates:n.keyDates||"",buyingTriggers:n.buyingTriggers||"",dealSignals:n.dealSignals||"",risksObjections:n.risksObjections||n.concerns||"",competitiveIntel:n.competitiveIntel||"",attendees:n.attendees||"",transcript:s}}return console.warn("Server process-sections returned no sections, using fallback"),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:s}}catch(t){return console.error("processTranscription server error:",t),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:s}}}};var q=require("obsidian"),F=class f{constructor(s,e,t="America/New_York"){this.serverUrl=s,this.userEmail=e.toLowerCase(),this.timezone=t}setUserEmail(s){this.userEmail=s.toLowerCase()}setServerUrl(s){this.serverUrl=s}setTimezone(s){this.timezone=s}async getTodaysMeetings(s=!1){if(!this.userEmail)return{success:!1,date:new Date().toISOString().split("T")[0],email:"",meetingCount:0,meetings:[],error:"User email not configured"};try{let e=encodeURIComponent(this.timezone),t=s?"&forceRefresh=true":"";return(await(0,q.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/today?timezone=${e}${t}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(e){return console.error("Failed to fetch today's meetings:",e),{success:!1,date:new Date().toISOString().split("T")[0],email:this.userEmail,meetingCount:0,meetings:[],error:e.message||"Failed to fetch calendar"}}}async getWeekMeetings(s=!1){if(!this.userEmail)return{success:!1,startDate:"",endDate:"",email:"",totalMeetings:0,byDay:{},error:"User email not configured"};try{let e=encodeURIComponent(this.timezone),t=s?"&forceRefresh=true":"";return(await(0,q.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/week?timezone=${e}${t}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(e){return console.error("Failed to fetch week's meetings:",e),{success:!1,startDate:"",endDate:"",email:this.userEmail,totalMeetings:0,byDay:{},error:e.message||"Failed to fetch calendar"}}}async getMeetingsInRange(s,e){if(!this.userEmail)return[];try{let t=s.toISOString().split("T")[0],n=e.toISOString().split("T")[0],r=await(0,q.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${t}&end=${n}`,method:"GET",headers:{Accept:"application/json"}});return r.json.success?r.json.meetings||[]:[]}catch(t){return console.error("Failed to fetch calendar range:",t),[]}}async getCurrentMeeting(){let s=await this.getTodaysMeetings();if(!s.success||s.meetings.length===0)return{meeting:null,isNow:!1};let e=new Date;for(let t of s.meetings){let n=f.safeParseDate(t.start),r=f.safeParseDate(t.end);if(e>=n&&e<=r)return{meeting:t,isNow:!0};let i=(n.getTime()-e.getTime())/(1e3*60);if(i>0&&i<=15)return{meeting:t,isNow:!1,minutesUntilStart:Math.ceil(i)}}return{meeting:null,isNow:!1}}async getMeetingsForAccount(s){let e=await this.getWeekMeetings();if(!e.success)return[];let t=[];Object.values(e.byDay).forEach(r=>{t.push(...r)});let n=s.toLowerCase();return t.filter(r=>r.accountName?.toLowerCase().includes(n)||r.subject.toLowerCase().includes(n)||r.attendees.some(i=>i.email.toLowerCase().includes(n.split(" ")[0])))}static formatMeetingForNote(s){let e=s.attendees.filter(t=>t.isExternal!==!1).map(t=>t.name||t.email.split("@")[0]).slice(0,5).join(", ");return{title:s.subject,attendees:e,meetingStart:s.start,accountName:s.accountName}}static getDayName(s){let e;s.length===10&&s.includes("-")?e=new Date(s+"T00:00:00"):e=new Date(s);let t=new Date;t.setHours(0,0,0,0);let n=new Date(e);n.setHours(0,0,0,0);let r=Math.round((n.getTime()-t.getTime())/(1e3*60*60*24));return r===0?"Today":r===1?"Tomorrow":e.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}static formatTime(s,e){let t=s;t&&!t.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(t)&&(t=t+"Z");let n=new Date(t);if(isNaN(n.getTime()))return s;let r={hour:"numeric",minute:"2-digit",hour12:!0};return e&&(r.timeZone=e),n.toLocaleTimeString("en-US",r)}static safeParseDate(s){if(!s)return new Date(NaN);let e=s;return!e.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(e)&&(e=e+"Z"),new Date(e)}static getMeetingDuration(s,e){let t=f.safeParseDate(s),n=f.safeParseDate(e);return Math.round((n.getTime()-t.getTime())/(1e3*60))}};var We=["ai-contracting-tech","ai-contracting-services","ai-compliance-tech","ai-compliance-services","ai-ma-tech","ai-ma-services","sigma"],je=["metrics-identified","economic-buyer-identified","decision-criteria-discussed","decision-process-discussed","pain-confirmed","champion-identified","competition-mentioned"],xe=["progressing","stalled","at-risk","champion-engaged","early-stage"],Ee=["discovery","demo","negotiation","qbr","implementation","follow-up"],ke=`You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

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
}`,V=class{constructor(s,e){this.openaiApiKey=null;this.serverUrl=s,this.openaiApiKey=e||null}setOpenAIKey(s){this.openaiApiKey=s}setServerUrl(s){this.serverUrl=s}async extractTags(s){let e=this.buildTagContext(s);if(!e.trim())return{success:!1,tags:this.getEmptyTags(),error:"No content to analyze"};try{return await this.extractTagsViaServer(e)}catch(t){return console.warn("Server tag extraction failed, trying local:",t.message),this.openaiApiKey?await this.extractTagsLocal(e):this.extractTagsRuleBased(s)}}buildTagContext(s){let e=[];return s.summary&&e.push(`SUMMARY:
${s.summary}`),s.productInterest&&e.push(`PRODUCT INTEREST:
${s.productInterest}`),s.meddiccSignals&&e.push(`MEDDICC SIGNALS:
${s.meddiccSignals}`),s.dealSignals&&e.push(`DEAL SIGNALS:
${s.dealSignals}`),s.painPoints&&e.push(`PAIN POINTS:
${s.painPoints}`),s.attendees&&e.push(`ATTENDEES:
${s.attendees}`),e.join(`

`)}async extractTagsViaServer(s){let e=await fetch(`${this.serverUrl}/api/extract-tags`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:s,openaiApiKey:this.openaiApiKey})});if(!e.ok)throw new Error(`Server returned ${e.status}`);let t=await e.json();if(!t.success)throw new Error(t.error||"Tag extraction failed");return{success:!0,tags:this.validateAndNormalizeTags(t.tags)}}async extractTagsLocal(s){if(!this.openaiApiKey)return{success:!1,tags:this.getEmptyTags(),error:"No OpenAI API key configured"};try{let e=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:ke},{role:"user",content:`Extract tags from this meeting content:

${s}`}],temperature:.1,response_format:{type:"json_object"}})});if(!e.ok)throw new Error(`OpenAI returned ${e.status}`);let n=(await e.json()).choices?.[0]?.message?.content;if(!n)throw new Error("No content in response");let r=JSON.parse(n);return{success:!0,tags:this.validateAndNormalizeTags(r)}}catch(e){return console.error("Local tag extraction error:",e),{success:!1,tags:this.getEmptyTags(),error:e.message||"Tag extraction failed"}}}extractTagsRuleBased(s){let e=Object.values(s).join(" ").toLowerCase(),t={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:.4};return(e.includes("contract")||e.includes("contracting"))&&(e.includes("service")?t.product_interest.push("ai-contracting-services"):t.product_interest.push("ai-contracting-tech")),e.includes("compliance")&&t.product_interest.push("ai-compliance-tech"),(e.includes("m&a")||e.includes("due diligence")||e.includes("acquisition"))&&t.product_interest.push("ai-ma-tech"),e.includes("sigma")&&t.product_interest.push("sigma"),(e.includes("metric")||e.includes("%")||e.includes("roi")||e.includes("save"))&&t.meddicc_signals.push("metrics-identified"),(e.includes("budget")||e.includes("cfo")||e.includes("economic buyer"))&&t.meddicc_signals.push("economic-buyer-identified"),(e.includes("pain")||e.includes("challenge")||e.includes("problem")||e.includes("struggle"))&&t.meddicc_signals.push("pain-confirmed"),(e.includes("champion")||e.includes("advocate")||e.includes("sponsor"))&&t.meddicc_signals.push("champion-identified"),(e.includes("competitor")||e.includes("alternative")||e.includes("vs")||e.includes("compared to"))&&t.meddicc_signals.push("competition-mentioned"),(e.includes("next step")||e.includes("follow up")||e.includes("schedule"))&&(t.deal_health="progressing"),(e.includes("concern")||e.includes("objection")||e.includes("hesitant")||e.includes("risk"))&&(t.deal_health="at-risk"),e.includes("demo")||e.includes("show you")||e.includes("demonstration")?t.meeting_type="demo":e.includes("pricing")||e.includes("negotiat")||e.includes("contract terms")?t.meeting_type="negotiation":e.includes("quarterly")||e.includes("qbr")||e.includes("review")?t.meeting_type="qbr":(e.includes("implementation")||e.includes("onboard")||e.includes("rollout"))&&(t.meeting_type="implementation"),{success:!0,tags:t}}validateAndNormalizeTags(s){let e={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:s.confidence||.8};return Array.isArray(s.product_interest)&&(e.product_interest=s.product_interest.filter(t=>We.includes(t))),Array.isArray(s.meddicc_signals)&&(e.meddicc_signals=s.meddicc_signals.filter(t=>je.includes(t))),xe.includes(s.deal_health)&&(e.deal_health=s.deal_health),Ee.includes(s.meeting_type)&&(e.meeting_type=s.meeting_type),Array.isArray(s.key_stakeholders)&&(e.key_stakeholders=s.key_stakeholders.slice(0,10)),e}getEmptyTags(){return{product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:0}}static formatTagsForFrontmatter(s){return{product_interest:s.product_interest.length>0?s.product_interest:null,meddicc_signals:s.meddicc_signals.length>0?s.meddicc_signals:null,deal_health:s.deal_health,meeting_type:s.meeting_type,key_stakeholders:s.key_stakeholders.length>0?s.key_stakeholders:null,tag_confidence:Math.round(s.confidence*100)}}static generateTagSummary(s){let e=[];return s.product_interest.length>0&&e.push(`**Products:** ${s.product_interest.join(", ")}`),s.meddicc_signals.length>0&&e.push(`**MEDDICC:** ${s.meddicc_signals.join(", ")}`),e.push(`**Deal Health:** ${s.deal_health}`),e.push(`**Meeting Type:** ${s.meeting_type}`),e.join(" | ")}};var oe=["keigan.pesenti@eudia.com","michael.ayres@eudia.com","michael.ayers@eudia.com","mike.flynn@eudia.com","michael.flynn@eudia.com","zack@eudia.com","zach@eudia.com"],ce=["omar@eudia.com","david@eudia.com","ashish@eudia.com","siddharth.saxena@eudia.com"],le={"mitchell.loquaci@eudia.com":{name:"Mitchell Loquaci",region:"US",role:"RVP Sales"},"stephen.mulholland@eudia.com":{name:"Stephen Mulholland",region:"EMEA",role:"VP Sales"},"riona.mchale@eudia.com":{name:"Riona McHale",region:"IRE_UK",role:"Head of Sales"}},de=["nikhita.godiwala@eudia.com","jon.dedych@eudia.com","farah.haddad@eudia.com"],Ne=["nikhita.godiwala@eudia.com"],Te={"nikhita.godiwala@eudia.com":["jon.dedych@eudia.com","farah.haddad@eudia.com"]},I=[{id:"cs-static-accenture",name:"Accenture",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"cs-static-aes",name:"AES",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-airbnb",name:"Airbnb",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-airship",name:"Airship Group Inc",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-amazon",name:"Amazon",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-anthropic",name:"Anthropic",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"cs-static-appliedai",name:"AppliedAI",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"cs-static-arabic-cs",name:"Arabic Computer Systems",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Alex Fox"},{id:"cs-static-aramark",name:"Aramark Ireland",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"cs-static-army-corps",name:"Army Corps of Engineers",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"cs-static-aryza",name:"Aryza",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"cs-static-asana",name:"Asana",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-aviva",name:"Aviva Insurance",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"cs-static-boi",name:"Bank of Ireland",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"cs-static-bayer",name:"Bayer",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"cs-static-best-buy",name:"Best Buy",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-bny-mellon",name:"BNY Mellon",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-cargill",name:"Cargill",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"cs-static-chevron",name:"Chevron",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"cs-static-chs",name:"CHS",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-coherent",name:"Coherent",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-coillte",name:"Coillte",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"cs-static-coimisiun",name:"Coimisiun na Mean",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"cs-static-coleman",name:"Coleman Legal",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"cs-static-commscope",name:"CommScope Technologies",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"cs-static-consensys",name:"Consensys",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"cs-static-corebridge",name:"Corebridge Financial",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"cs-static-cox",name:"Cox Media Group",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Justin Hills"},{id:"cs-static-creed",name:"Creed McStay",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"cs-static-datalex",name:"Datalex",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"cs-static-davy",name:"Davy",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"cs-static-delinea",name:"Delinea",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Justin Hills"},{id:"cs-static-dept-children",name:"Department of Children, Disability and Equality",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Alex Fox"},{id:"cs-static-dept-climate",name:"Department of Climate, Energy and the Environment",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Alex Fox"},{id:"cs-static-dhl",name:"DHL",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-dolby",name:"Dolby",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-dropbox",name:"Dropbox",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"cs-static-duracell",name:"Duracell",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Justin Hills"},{id:"cs-static-ecms",name:"ECMS",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"cs-static-ecolab",name:"Ecolab",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-esb",name:"Electricity Supply Board",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"cs-static-esb-ni",name:"ESB NI/Electric Ireland",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Alex Fox"},{id:"cs-static-etsy",name:"Etsy",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-fox",name:"Fox",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-fresh-del-monte",name:"Fresh Del Monte",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-ge-vernova",name:"GE Vernova",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"cs-static-gilead",name:"Gilead Sciences",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-glanbia",name:"Glanbia",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"cs-static-goodbody",name:"Goodbody Stockbrokers",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"cs-static-graybar",name:"Graybar Electric",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-hayes",name:"Hayes Solicitors LLP",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"cs-static-home-depot",name:"Home Depot",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Mitch Loquaci"},{id:"cs-static-indeed",name:"Indeed",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"cs-static-intuit",name:"Intuit",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-iqvia",name:"IQVIA",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Sean Boyd"},{id:"cs-static-kellanova",name:"Kellanova",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"cs-static-keurig",name:"Keurig Dr Pepper",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"cs-static-kingspan",name:"Kingspan",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"cs-static-mediolanum",name:"Mediolanum",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"cs-static-medtronic",name:"Medtronic",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-meta",name:"Meta",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-national-grid",name:"National Grid",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"cs-static-nato",name:"NATO",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"cs-static-northern-trust",name:"Northern Trust Management Services",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"cs-static-novelis",name:"Novelis",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Mitch Loquaci"},{id:"cs-static-ntma",name:"NTMA",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Emer Flynn"},{id:"cs-static-openai",name:"OpenAi",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"cs-static-orsted",name:"Orsted",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"cs-static-peregrine",name:"Peregrine Hospitality",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"cs-static-perrigo",name:"Perrigo Pharma",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"cs-static-petsmart",name:"Petsmart",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"cs-static-plusgrade",name:"Plusgrade",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-pure-storage",name:"Pure Storage",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"cs-static-re-turn",name:"Re-Turn",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"cs-static-salesforce",name:"Salesforce",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-sequoia",name:"Sequoia Climate Fund",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"cs-static-servicenow",name:"ServiceNow",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-sisk",name:"Sisk Group",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Alex Fox"},{id:"cs-static-southwest",name:"Southwest Airlines",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-spark",name:"Spark Brighter Thinking",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"cs-static-stripe",name:"Stripe",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"cs-static-tailored-brands",name:"Tailored Brands",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"cs-static-taoglas",name:"Taoglas Limited",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"cs-static-te-connectivity",name:"TE Connectivity",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-teamwork",name:"Teamwork.com",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"cs-static-weir-group",name:"The Weir Group PLC",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-wonderful",name:"The Wonderful Company",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"cs-static-tiktok",name:"TikTok",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"cs-static-tinder",name:"Tinder LLC",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"cs-static-toshiba",name:"Toshiba US",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-usaf",name:"U.S. Air Force",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"cs-static-udemy",name:"Udemy",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"cs-static-uisce",name:"Uisce Eireann (Irish Water)",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"cs-static-vista",name:"Vista Equity Partners",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"cs-static-vulcan",name:"Vulcan Special Ops",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"cs-static-ww-grainger",name:"W.W. Grainger",type:"New",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-wealth-partners",name:"Wealth Partners Capital Group",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"cs-static-wellspring",name:"Wellspring Philanthropic Fund",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"cs-static-western-digital",name:"Western Digital",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"cs-static-world-wide-tech",name:"World Wide Technology",type:"Existing",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Julie Stefanich"}],Ie={US:["asad.hussain@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com","rajeev.patel@eudia.com"],EMEA:["greg.machale@eudia.com","tom.clancy@eudia.com","nicola.fratini@eudia.com","nathan.shine@eudia.com","stephen.mulholland@eudia.com"],IRE_UK:["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com","riona.mchale@eudia.com"]},Z={"mitchell.loquaci@eudia.com":["asad.hussain@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com","rajeev.patel@eudia.com"],"stephen.mulholland@eudia.com":["greg.machale@eudia.com","tom.clancy@eudia.com","conor.molloy@eudia.com","nathan.shine@eudia.com","nicola.fratini@eudia.com"],"riona.mchale@eudia.com":["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com"]},$e={"sean.boyd@eudia.com":"US","riley.stack@eudia.com":"US","rajeev.patel@eudia.com":"US"};function Pe(f){let s=f.toLowerCase().trim();return oe.includes(s)?"admin":ce.includes(s)?"exec":s in le?"sales_leader":de.includes(s)?"cs":"bl"}function Fe(f){let s=f.toLowerCase().trim();return le[s]?.region||null}function ue(f){return Ie[f]||[]}function De(f){let s=f.toLowerCase().trim();if(Z[s])return Z[s];let e=Fe(s);return e?ue(e):[]}function D(f){let s=f.toLowerCase().trim();return oe.includes(s)||ce.includes(s)}function B(f){let s=f.toLowerCase().trim();return de.includes(s)}function _(f){let s=f.toLowerCase().trim();return Ne.includes(s)}function pe(f){let s=f.toLowerCase().trim();return Te[s]||[]}var N={version:"2026-02-09",lastUpdated:"2026-02-09",businessLeads:{"alex.fox@eudia.com":{email:"alex.fox@eudia.com",name:"Alex Fox",accounts:[{id:"001Wj00000mCFsT",name:"Arabic Computer Systems",hadOpportunity:!0},{id:"001Wj00000mCFsO",name:"Brown Thomas",hadOpportunity:!0},{id:"001Wj00000mCFt2",name:"Byrne Wallace Shields",hadOpportunity:!0},{id:"001Wj00000mCFsu",name:"Corrigan & Corrigan Solicitors LLP",hadOpportunity:!0},{id:"001Wj00000pzTPY",name:"Defence Forces Tribunal",hadOpportunity:!1},{id:"001Wj00000mCFsc",name:"Department of Children, Disability and Equality",hadOpportunity:!0},{id:"001Wj00000mCFsN",name:"Department of Climate, Energy and the Environment",hadOpportunity:!0},{id:"001Wj00000mCFrZ",name:"Department of Housing",hadOpportunity:!0},{id:"001Wj00000mCFsU",name:"ESB NI/Electric Ireland",hadOpportunity:!0},{id:"001Wj00000pzTPV",name:"MW Keller",hadOpportunity:!1},{id:"001Wj00000pzTPX",name:"Murphy's Ice Cream",hadOpportunity:!1},{id:"001Wj00000mCFrM",name:"Sisk Group",hadOpportunity:!0}]},"ananth.cherukupally@eudia.com":{email:"ananth.cherukupally@eudia.com",name:"Ananth Cherukupally",accounts:[{id:"001Wj00000PfssX",name:"AGC Partners",hadOpportunity:!1},{id:"001Wj00000ahBZt",name:"AMETEK",hadOpportunity:!1},{id:"001Wj00000ahBZr",name:"Accel-KKR",hadOpportunity:!1},{id:"001Wj00000bwVu4",name:"Addtech",hadOpportunity:!1},{id:"001Wj00000YNV7Z",name:"Advent",hadOpportunity:!0},{id:"001Wj00000VZScK",name:"Affinity Consulting Group",hadOpportunity:!1},{id:"001Wj00000lyFyt",name:"Albacore Capital Group",hadOpportunity:!0},{id:"001Wj00000nlL88",name:"Alder",hadOpportunity:!0},{id:"001Wj00000XumF6",name:"Alpine Investors",hadOpportunity:!0},{id:"001Wj00000QTbLP",name:"Alvarez AI Advisors",hadOpportunity:!1},{id:"001Wj00000ahFCJ",name:"American Pacific Group",hadOpportunity:!1},{id:"001Wj00000ah6dg",name:"Angeles Equity Partners",hadOpportunity:!1},{id:"001Hp00003kIrEu",name:"Apollo Global Management",hadOpportunity:!0},{id:"001Wj00000cl5pq",name:"Arizona MBDA Business Center",hadOpportunity:!1},{id:"001Wj00000nlRev",name:"Attack Capital",hadOpportunity:!0},{id:"001Wj00000ahFBx",name:"Audax Group",hadOpportunity:!1},{id:"001Wj00000YhZAE",name:"Beacon Software",hadOpportunity:!0},{id:"001Wj00000cfg0c",name:"Beekers Capital",hadOpportunity:!1},{id:"001Wj00000bwVsk",name:"Bertram Capital",hadOpportunity:!1},{id:"001Wj00000ahBa0",name:"Bessemer Venture Partners",hadOpportunity:!1},{id:"001Wj00000lzDWj",name:"BlueEarth Capital",hadOpportunity:!0},{id:"001Wj00000ah6dZ",name:"Brentwood Associates",hadOpportunity:!1},{id:"001Wj00000ah6dL",name:"Brown & Brown",hadOpportunity:!1},{id:"001Hp00003kIrCh",name:"CBRE Group",hadOpportunity:!0},{id:"001Wj00000cejJz",name:"CVC",hadOpportunity:!0},{id:"001Wj00000ahFCV",name:"Caltius Equity Partners",hadOpportunity:!1},{id:"001Wj00000ahFBz",name:"Capstone Partners",hadOpportunity:!1},{id:"001Wj00000nlB0g",name:"Capvest",hadOpportunity:!0},{id:"001Hp00003kIrFy",name:"Cardinal Health",hadOpportunity:!0},{id:"001Hp00003kIrDg",name:"Carlyle",hadOpportunity:!0},{id:"001Wj00000PbIZ8",name:"Cascadia Capital",hadOpportunity:!1},{id:"001Wj00000ah6dW",name:"Catterton",hadOpportunity:!1},{id:"001Wj00000ahFC7",name:"Century Park Capital Partners",hadOpportunity:!1},{id:"001Wj00000Rjuhj",name:"Citadel",hadOpportunity:!0},{id:"001Wj00000ah6dn",name:"Clearlake Capital Group",hadOpportunity:!1},{id:"001Wj00000ah6dY",name:"Cognex Corporation",hadOpportunity:!1},{id:"001Wj00000ah6do",name:"Comvest Partners",hadOpportunity:!1},{id:"001Wj00000ah6dv",name:"Constellation Software",hadOpportunity:!0},{id:"001Wj00000ahFCI",name:"Cortec Group",hadOpportunity:!1},{id:"001Wj00000ahBa4",name:"Crosslink Capital",hadOpportunity:!1},{id:"001Wj00000ahFCR",name:"DCA Partners",hadOpportunity:!1},{id:"001Wj00000ah6dc",name:"DFO Management",hadOpportunity:!1},{id:"001Wj00000W8fEu",name:"Davis Polk",hadOpportunity:!1},{id:"001Wj00000crdDR",name:"Delcor",hadOpportunity:!0},{id:"001Wj00000ahFCM",name:"Diploma",hadOpportunity:!1},{id:"001Wj00000kcANH",name:"Discord",hadOpportunity:!0},{id:"001Wj00000ahFCU",name:"Doughty Hanson & Co",hadOpportunity:!1},{id:"001Wj00000ah6dd",name:"Edgewater Capital Partners",hadOpportunity:!1},{id:"001Wj00000Y64qh",name:"Emigrant Bank",hadOpportunity:!0},{id:"001Wj00000ah6dM",name:"Encore Consumer Capital",hadOpportunity:!1},{id:"001Wj00000ahFCL",name:"Endeavour Capital",hadOpportunity:!1},{id:"001Wj00000ah6di",name:"FFL Partners",hadOpportunity:!1},{id:"001Wj00000ah6dV",name:"Falfurrias Capital Partners",hadOpportunity:!1},{id:"001Wj00000ah6dU",name:"FirstService Corporation",hadOpportunity:!1},{id:"001Wj00000nlLZU",name:"Five Capital",hadOpportunity:!0},{id:"001Wj00000ahFCK",name:"Flexpoint Ford",hadOpportunity:!1},{id:"001Wj00000QkjJL",name:"Floodgate",hadOpportunity:!1},{id:"001Wj00000bwVu6",name:"Fortive Corporation",hadOpportunity:!1},{id:"001Wj00000ahFCa",name:"Foundry Group",hadOpportunity:!1},{id:"001Hp00003kIrID",name:"Freeport-McMoRan",hadOpportunity:!0},{id:"001Wj00000bwVuN",name:"Fremont Partners",hadOpportunity:!1},{id:"001Wj00000ahFCO",name:"Frontenac Company",hadOpportunity:!1},{id:"001Hp00003kIrII",name:"GE Healthcare",hadOpportunity:!0},{id:"001Hp00003kIrIJ",name:"GE Vernova",hadOpportunity:!0},{id:"001Wj00000lz2Jb",name:"GTIS Partners",hadOpportunity:!0},{id:"001Wj00000ah6dh",name:"Gallant Capital Partners",hadOpportunity:!1},{id:"001Hp00003kJ9oP",name:"General Catalyst",hadOpportunity:!0},{id:"001Wj00000ah6dr",name:"Genstar Capital",hadOpportunity:!1},{id:"001Hp00003kIrIT",name:"GlaxoSmithKline",hadOpportunity:!0},{id:"001Wj00000ahFCb",name:"Goldner Hawn Johnson & Morrison",hadOpportunity:!1},{id:"001Wj00000ah6du",name:"Great Point Partners",hadOpportunity:!1},{id:"001Wj00000ahBZx",name:"Greenoaks Capital",hadOpportunity:!0},{id:"001Wj00000ahFCB",name:"Greenspring Associates",hadOpportunity:!1},{id:"001Wj00000ahFCX",name:"Group 206",hadOpportunity:!1},{id:"001Wj00000ahBZz",name:"Gryphon Investors",hadOpportunity:!1},{id:"001Wj00000ah6dT",name:"HEICO Corporation",hadOpportunity:!1},{id:"001Wj00000cy4m1",name:"HG",hadOpportunity:!0},{id:"001Wj00000ahBZn",name:"HGGC",hadOpportunity:!1},{id:"001Wj00000ah6df",name:"Halma",hadOpportunity:!1},{id:"001Wj00000ah48X",name:"Harvest Partners",hadOpportunity:!1},{id:"001Wj00000ahFCS",name:"HealthpointCapital",hadOpportunity:!1},{id:"001Wj00000lzDtJ",name:"Heidrick & Struggles",hadOpportunity:!0},{id:"001Hp00003kIrIl",name:"Hellman & Friedman",hadOpportunity:!0},{id:"001Wj00000ahFCW",name:"Highview Capital",hadOpportunity:!1},{id:"001Wj00000Pg7rW",name:"Houlihan Lokey",hadOpportunity:!1},{id:"001Wj00000ahFCH",name:"Housatonic Partners",hadOpportunity:!1},{id:"001Wj00000ahFC9",name:"Huron Capital",hadOpportunity:!1},{id:"001Wj00000ahFC6",name:"Indutrade",hadOpportunity:!1},{id:"001Wj00000ahBa5",name:"Insight Partners",hadOpportunity:!1},{id:"001Wj00000nlbr9",name:"Intercorp",hadOpportunity:!0},{id:"001Wj00000ahFCA",name:"Irving Place Capital",hadOpportunity:!1},{id:"001Wj00000bwVtt",name:"Jack Henry & Associates",hadOpportunity:!1},{id:"001Wj00000Pg9oT",name:"Jackim Woods & Co.",hadOpportunity:!1},{id:"001Wj00000ah6de",name:"Jonas Software",hadOpportunity:!1},{id:"001Hp00003kIrJU",name:"KKR",hadOpportunity:!1},{id:"001Wj00000ahBa1",name:"Kayne Anderson Capital Advisors",hadOpportunity:!1},{id:"001Wj00000m5kud",name:"Kelly Services",hadOpportunity:!0},{id:"001Wj00000ahBZp",name:"Keysight Technologies",hadOpportunity:!1},{id:"001Wj00000ahFC8",name:"L Squared Capital Partners",hadOpportunity:!1},{id:"001Wj00000QGTNV",name:"LCS Forensic Accounting & Advisory",hadOpportunity:!1},{id:"001Wj00000ahFCD",name:"Lagercrantz Group",hadOpportunity:!1},{id:"001Wj00000ahBZs",name:"Levine Leichtman Capital Partners",hadOpportunity:!1},{id:"001Wj00000Z6zhP",name:"Liberty Mutual Insurance",hadOpportunity:!0},{id:"001Wj00000ahFCC",name:"Lifco",hadOpportunity:!1},{id:"001Wj00000ahFCP",name:"LightBay Capital",hadOpportunity:!1},{id:"001Wj00000iYEVS",name:"Lightstone Group",hadOpportunity:!0},{id:"001Wj00000ahFCT",name:"Lincolnshire Management",hadOpportunity:!1},{id:"001Wj00000c8ynV",name:"Littelfuse",hadOpportunity:!0},{id:"001Wj00000W95CX",name:"Long Lake",hadOpportunity:!0},{id:"001Wj00000ahBa3",name:"Luminate Capital",hadOpportunity:!1},{id:"001Wj00000ahFC1",name:"Lumine Group",hadOpportunity:!1},{id:"001Wj00000bwVuH",name:"Markel Corporation",hadOpportunity:!1},{id:"001Wj00000Pfppo",name:"Marks Baughan",hadOpportunity:!1},{id:"001Wj00000ah6dm",name:"Martis Capital",hadOpportunity:!1},{id:"001Hp00003kKrRR",name:"Marvell Technology",hadOpportunity:!0},{id:"001Wj00000PbJ2B",name:"Meridian Capital",hadOpportunity:!1},{id:"001Wj00000ahFC3",name:"Nexa Equity",hadOpportunity:!1},{id:"001Wj00000ahBZv",name:"Norwest Venture Partners",hadOpportunity:!1},{id:"001Wj00000ah6dp",name:"Novanta",hadOpportunity:!1},{id:"001Wj00000ah6dQ",name:"Pacific Avenue Capital Partners",hadOpportunity:!1},{id:"001Wj00000ah6dt",name:"Palladium Equity Partners",hadOpportunity:!1},{id:"001Wj00000iXNFs",name:"Palomar Holdings",hadOpportunity:!0},{id:"001Wj00000ahFCG",name:"Pamlico Capital",hadOpportunity:!1},{id:"001Wj00000W3R2u",name:"Paradigm",hadOpportunity:!1},{id:"001Wj00000bWBlQ",name:"Pegasystems",hadOpportunity:!0},{id:"001Wj00000YcPTM",name:"Percheron Capital",hadOpportunity:!0},{id:"001Wj00000bzz9M",name:"Peregrine Hospitality",hadOpportunity:!0},{id:"001Wj00000VZkJ3",name:"PerformLaw",hadOpportunity:!1},{id:"001Hp00003ljCJ8",name:"Petco",hadOpportunity:!0},{id:"001Wj00000ahFBy",name:"Pharos Capital Group",hadOpportunity:!1},{id:"001Wj00000bwVuF",name:"Pool Corporation",hadOpportunity:!1},{id:"001Wj00000ah48Y",name:"Pritzker Private Capital",hadOpportunity:!1},{id:"001Wj00000mRFNX",name:"Publicis Group",hadOpportunity:!0},{id:"001Hp00003kKXSI",name:"Pure Storage",hadOpportunity:!0},{id:"001Wj00000ah6dS",name:"Quad-C Management",hadOpportunity:!1},{id:"001Hp00003kIrLo",name:"Raymond James Financial",hadOpportunity:!1},{id:"001Wj00000ah6ds",name:"Resilience Capital Partners",hadOpportunity:!1},{id:"001Wj00000m0jBC",name:"RingCentral",hadOpportunity:!0},{id:"001Wj00000ahFC4",name:"Riverside Acceleration Capital",hadOpportunity:!1},{id:"001Wj00000ah48a",name:"Riverside Partners",hadOpportunity:!1},{id:"001Wj00000ahFCE",name:"Rustic Canyon Partners",hadOpportunity:!1},{id:"001Wj00000ah6dR",name:"Sageview Capital",hadOpportunity:!1},{id:"001Wj00000ahFCN",name:"Salt Creek Capital",hadOpportunity:!1},{id:"001Wj00000lzlLX",name:"Sandbox",hadOpportunity:!0},{id:"001Wj00000nldrK",name:"Scout Motors",hadOpportunity:!0},{id:"001Wj00000ah48Z",name:"Searchlight Capital",hadOpportunity:!1},{id:"001Wj00000ahBZq",name:"Serent Capital",hadOpportunity:!1},{id:"001Hp00003kIrEB",name:"Silver Lake",hadOpportunity:!0},{id:"001Wj00000ahBZo",name:"Siris Capital Group",hadOpportunity:!1},{id:"001Wj00000ah6db",name:"Solace Capital Partners",hadOpportunity:!1},{id:"001Wj00000ahFCF",name:"Solis Capital Partners",hadOpportunity:!1},{id:"001Wj00000VkQyY",name:"Sonja Cotton & Associates",hadOpportunity:!1},{id:"001Wj00000ah6dO",name:"Sorenson Capital",hadOpportunity:!1},{id:"001Wj00000lygkU",name:"SoundPoint Capital",hadOpportunity:!0},{id:"001Wj00000lxbYR",name:"Spark Brighter Thinking",hadOpportunity:!0},{id:"001Wj00000ah6dj",name:"Spectrum Equity",hadOpportunity:!0},{id:"001Wj00000lusqi",name:"Symphony Technology Partners",hadOpportunity:!0},{id:"001Wj00000tOAoE",name:"TA Associates",hadOpportunity:!0},{id:"001Hp00003kKrU1",name:"TPG",hadOpportunity:!0},{id:"001Wj00000dNhDy",name:"TSS Europe",hadOpportunity:!0},{id:"001Wj00000QTbzh",name:"Taytrom",hadOpportunity:!1},{id:"001Wj00000ahFCY",name:"The Courtney Group",hadOpportunity:!1},{id:"001Wj00000ahFCZ",name:"The Riverside Company",hadOpportunity:!1},{id:"001Wj00000cgCF8",name:"Titan AI",hadOpportunity:!1},{id:"001Wj00000nlOIv",name:"Together Fund",hadOpportunity:!0},{id:"001Wj00000ah6dX",name:"Topicus.com",hadOpportunity:!1},{id:"001Hp00003kIrNO",name:"TransDigm Group",hadOpportunity:!1},{id:"001Wj00000ah6dN",name:"Transom Capital Group",hadOpportunity:!1},{id:"001Wj00000ahBZu",name:"Trimble Inc.",hadOpportunity:!1},{id:"001Wj00000ah6dl",name:"Trivest Partners",hadOpportunity:!1},{id:"001Wj00000dXDo3",name:"Tucker's Farm",hadOpportunity:!0},{id:"001Wj00000ah6da",name:"Tyler Technologies",hadOpportunity:!1},{id:"001Wj00000Y6VMa",name:"UBS",hadOpportunity:!0},{id:"001Wj00000ahFCQ",name:"Vance Street Capital",hadOpportunity:!1},{id:"001Wj00000bn8VS",name:"Vista Equity Partners",hadOpportunity:!0},{id:"001Wj00000ahFC0",name:"Vitec Software",hadOpportunity:!1},{id:"001Wj00000ah6dP",name:"Volaris Group",hadOpportunity:!1},{id:"001Hp00003kIrO2",name:"Watsco",hadOpportunity:!1},{id:"001Wj00000ahBZw",name:"West Lane Capital Partners",hadOpportunity:!1},{id:"001Wj00000ahBZy",name:"Zebra Technologies",hadOpportunity:!1}]},"asad.hussain@eudia.com":{email:"asad.hussain@eudia.com",name:"Asad Hussain",accounts:[{id:"001Hp00003kIrFC",name:"AT&T",hadOpportunity:!0},{id:"001Hp00003kIrCy",name:"Airbnb",hadOpportunity:!0},{id:"001Hp00003kIrEe",name:"Amazon",hadOpportunity:!0},{id:"001Wj00000WElj9",name:"American Arbitration Association",hadOpportunity:!0},{id:"001Hp00003kIrCz",name:"American Express",hadOpportunity:!0},{id:"001Wj00000hewsX",name:"Amkor",hadOpportunity:!0},{id:"001Wj00000WZ05x",name:"Applied Intuition",hadOpportunity:!0},{id:"001Hp00003kIrEx",name:"Applied Materials",hadOpportunity:!1},{id:"001Hp00003kIrEz",name:"Archer Daniels Midland",hadOpportunity:!0},{id:"001Wj00000Y0g8Z",name:"Asana",hadOpportunity:!0},{id:"001Wj00000gGYAQ",name:"Autodesk",hadOpportunity:!0},{id:"001Wj00000c0wRA",name:"Away",hadOpportunity:!0},{id:"001Wj00000WTMCR",name:"BNY Mellon",hadOpportunity:!0},{id:"001Wj00000c6DHy",name:"BetterUp",hadOpportunity:!0},{id:"001Hp00003kIrFY",name:"BlackRock",hadOpportunity:!1},{id:"001Hp00003kIrFe",name:"Booz Allen Hamilton",hadOpportunity:!1},{id:"001Wj00000XhcVG",name:"Box.com",hadOpportunity:!0},{id:"001Wj00000bWBla",name:"CNA Insurance",hadOpportunity:!0},{id:"001Wj00000XiYqz",name:"Canva",hadOpportunity:!0},{id:"001Hp00003kIrG0",name:"Carrier Global",hadOpportunity:!1},{id:"001Wj00000mosEX",name:"Carta",hadOpportunity:!0},{id:"001Wj00000ah6dk",name:"Charlesbank Capital Partners",hadOpportunity:!0},{id:"001Wj00000XiXjd",name:"Circle",hadOpportunity:!0},{id:"001Hp00003kIrE5",name:"Coherent",hadOpportunity:!0},{id:"001Hp00003kIrGf",name:"Corning",hadOpportunity:!0},{id:"001Wj00000fgfGu",name:"Cyware",hadOpportunity:!0},{id:"001Hp00003kIrE6",name:"DHL",hadOpportunity:!0},{id:"001Wj00000duIWr",name:"Deepmind",hadOpportunity:!0},{id:"001Hp00003kIrGy",name:"Dell Technologies",hadOpportunity:!1},{id:"001Hp00003kIrGz",name:"Deloitte",hadOpportunity:!0},{id:"001Wj00000W8ZKl",name:"Docusign",hadOpportunity:!0},{id:"001Hp00003kIrHN",name:"Ecolab",hadOpportunity:!0},{id:"001Wj00000dheQN",name:"Emory",hadOpportunity:!0},{id:"001Wj00000bWIxP",name:"Ericsson",hadOpportunity:!0},{id:"001Hp00003kIrHs",name:"FedEx",hadOpportunity:!1},{id:"001Wj00000lMcwT",name:"Flo Health",hadOpportunity:!0},{id:"001Hp00003kIrI3",name:"Fluor",hadOpportunity:!0},{id:"001Hp00003kIrIA",name:"Fox",hadOpportunity:!0},{id:"001Hp00003kJ9oe",name:"Fresh Del Monte",hadOpportunity:!0},{id:"001Wj00000Y6HEY",name:"G-III Apparel Group",hadOpportunity:!0},{id:"001Wj00000kNTF0",name:"GLG",hadOpportunity:!0},{id:"001Hp00003kIrIK",name:"Geico",hadOpportunity:!0},{id:"001Hp00003lhVuD",name:"General Atlantic",hadOpportunity:!0},{id:"001Wj00000dw1gb",name:"Glean",hadOpportunity:!0},{id:"001Hp00003kJ9l1",name:"Google",hadOpportunity:!0},{id:"001Wj00000oqVXg",name:"Goosehead Insurance",hadOpportunity:!0},{id:"001Wj00000tuXZb",name:"Gopuff",hadOpportunity:!0},{id:"001Hp00003kIrDP",name:"HP",hadOpportunity:!0},{id:"001Hp00003kIrIt",name:"HSBC",hadOpportunity:!0},{id:"001Hp00003kL3Mo",name:"Honeywell",hadOpportunity:!0},{id:"001Hp00003kIrIy",name:"Huntsman",hadOpportunity:!0},{id:"001Wj00000d7IL8",name:"IAC",hadOpportunity:!0},{id:"001Hp00003kIrJ0",name:"IBM",hadOpportunity:!0},{id:"001Wj00000hdoLx",name:"Insight Enterprises Inc.",hadOpportunity:!0},{id:"001Wj00000gH7ua",name:"JFrog",hadOpportunity:!0},{id:"001Wj00000tNwur",name:"Janus Henderson",hadOpportunity:!1},{id:"001Wj00000iC14X",name:"Klarna",hadOpportunity:!0},{id:"001Wj00000wSLUl",name:"LexisNexis",hadOpportunity:!1},{id:"001Wj00000mCFtJ",name:"LinkedIn",hadOpportunity:!0},{id:"001Hp00003kIrJu",name:"Lockheed Martin",hadOpportunity:!0},{id:"001Hp00003kIrKC",name:"Mass Mutual Life Insurance",hadOpportunity:!0},{id:"001Hp00003kIrKO",name:"Microsoft",hadOpportunity:!0},{id:"001Wj00000lyDQk",name:"MidOcean Partners",hadOpportunity:!0},{id:"001Hp00003kIrKT",name:"Morgan Stanley",hadOpportunity:!0},{id:"001Wj00000bWIxq",name:"Motiva",hadOpportunity:!0},{id:"001Hp00003kIrKr",name:"NVIDIA",hadOpportunity:!1},{id:"001Hp00003kIrCx",name:"Novartis",hadOpportunity:!0},{id:"001Wj00000hVTTB",name:"One Oncology",hadOpportunity:!0},{id:"001Wj00000Y6VVW",name:"Oscar Health",hadOpportunity:!0},{id:"001Wj00000eLHLO",name:"Palo Alto Networks",hadOpportunity:!1},{id:"001Wj00000kNp2X",name:"Plusgrade",hadOpportunity:!0},{id:"001Wj00000YoLqW",name:"Procore Technologies",hadOpportunity:!0},{id:"001Wj00000lXD0F",name:"RBI (Burger King)",hadOpportunity:!1},{id:"001Hp00003kIrLx",name:"Republic Services",hadOpportunity:!1},{id:"001Wj00000bWJ0J",name:"SAP",hadOpportunity:!1},{id:"001Hp00003kIrD9",name:"Salesforce",hadOpportunity:!0},{id:"001Wj00000fPr6N",name:"Santander",hadOpportunity:!0},{id:"001Hp00003kIrMK",name:"ServiceNow",hadOpportunity:!0},{id:"001Wj00000eL760",name:"Shell",hadOpportunity:!1},{id:"001Wj00000kNmsg",name:"Skims",hadOpportunity:!0},{id:"001Wj00000aCGR3",name:"Solventum",hadOpportunity:!0},{id:"001Hp00003kIrEC",name:"Southwest Airlines",hadOpportunity:!0},{id:"001Hp00003kIrMc",name:"SpaceX",hadOpportunity:!1},{id:"001Wj00000SdYHq",name:"Spotify",hadOpportunity:!0},{id:"001Hp00003kIrDl",name:"StoneX Group",hadOpportunity:!0},{id:"001Wj00000WYtsU",name:"Tenable",hadOpportunity:!0},{id:"001Hp00003kIrN5",name:"Tesla",hadOpportunity:!1},{id:"001Wj00000c0wRK",name:"The Initial Group",hadOpportunity:!0},{id:"001Wj00000bWBlX",name:"Thomson Reuters Ventures",hadOpportunity:!1},{id:"001Hp00003kIrCs",name:"UPS",hadOpportunity:!0},{id:"001Wj00000tuRNo",name:"Virtusa",hadOpportunity:!0},{id:"001Hp00003kIrNw",name:"W.W. Grainger",hadOpportunity:!0},{id:"001Hp00003kIrNy",name:"Walmart",hadOpportunity:!0},{id:"001Wj00000Y64qk",name:"Warburg Pincus LLC",hadOpportunity:!1},{id:"001Wj00000bzz9N",name:"Wealth Partners Capital Group",hadOpportunity:!0},{id:"001Wj00000tuolf",name:"Wynn Las Vegas",hadOpportunity:!0},{id:"001Wj00000bzz9Q",name:"Youtube",hadOpportunity:!0},{id:"001Wj00000uzs1f",name:"Zero RFI",hadOpportunity:!0}]},"conor.molloy@eudia.com":{email:"conor.molloy@eudia.com",name:"Conor Molloy",accounts:[{id:"001Wj00000mCFrf",name:"APEX Group",hadOpportunity:!1},{id:"001Wj00000xxtg6",name:"ASR Nederland",hadOpportunity:!1},{id:"001Hp00003kIrQD",name:"Accenture",hadOpportunity:!0},{id:"001Wj00000qLixn",name:"Al Dahra Group Llc",hadOpportunity:!0},{id:"001Wj00000syNyn",name:"Alliance Healthcare",hadOpportunity:!1},{id:"001Hp00003kIrEy",name:"Aramark Ireland",hadOpportunity:!0},{id:"001Wj00000tWwXk",name:"Aramex",hadOpportunity:!1},{id:"001Wj00000xyXlY",name:"Arkema",hadOpportunity:!1},{id:"001Wj00000mCFrg",name:"Aryza",hadOpportunity:!0},{id:"001Wj00000xz3F7",name:"Aurubis",hadOpportunity:!1},{id:"001Wj00000bWIzJ",name:"BAE Systems, Inc.",hadOpportunity:!1},{id:"001Wj00000fFhea",name:"BBC News",hadOpportunity:!1},{id:"001Wj00000Y6Vk4",name:"BBC Studios",hadOpportunity:!1},{id:"001Wj00000xypIc",name:"BMW Group",hadOpportunity:!1},{id:"001Wj00000eLPna",name:"BP",hadOpportunity:!1},{id:"001Wj00000tsfWO",name:"Baker Tilly",hadOpportunity:!0},{id:"001Wj00000tWwXr",name:"Bestseller",hadOpportunity:!1},{id:"001Wj00000xz3LZ",name:"Bouygues",hadOpportunity:!1},{id:"001Wj00000xz3Td",name:"British Broadcasting Corporation",hadOpportunity:!1},{id:"001Wj00000xyc3f",name:"Carrefour",hadOpportunity:!1},{id:"001Wj00000tWwXy",name:"Citco",hadOpportunity:!1},{id:"001Wj00000mCFrk",name:"Coillte",hadOpportunity:!0},{id:"001Wj00000mCFsH",name:"Consensys",hadOpportunity:!0},{id:"001Wj00000xxS3B",name:"Currys",hadOpportunity:!1},{id:"001Wj00000Y6Vgo",name:"Cushman & Wakefield",hadOpportunity:!1},{id:"001Wj00000tWwY2",name:"DB Schenker",hadOpportunity:!1},{id:"001Wj00000xxpXf",name:"DZ Bank",hadOpportunity:!1},{id:"001Wj00000bWIzG",name:"DZB BANK GmbH",hadOpportunity:!1},{id:"001Wj00000Y6VMZ",name:"Danone",hadOpportunity:!1},{id:"001Wj00000xyCKX",name:"Deutsche Bahn",hadOpportunity:!1},{id:"001Wj00000tWwY3",name:"Dyson",hadOpportunity:!1},{id:"001Wj00000xy3Iu",name:"E.ON",hadOpportunity:!1},{id:"001Wj00000xz3Jx",name:"Electricite de France",hadOpportunity:!1},{id:"001Hp00003kIrHR",name:"Electronic Arts",hadOpportunity:!1},{id:"001Wj00000xz373",name:"Energie Baden-Wurttemberg",hadOpportunity:!1},{id:"001Wj00000xwnL0",name:"Evonik Industries",hadOpportunity:!1},{id:"001Wj00000xyr5v",name:"FMS Wertmanagement",hadOpportunity:!1},{id:"001Wj00000Y6DDb",name:"Federal Reserve Bank of New York",hadOpportunity:!1},{id:"001Wj00000tWwYf",name:"Fenergo",hadOpportunity:!1},{id:"001Wj00000xxuFZ",name:"Finatis",hadOpportunity:!1},{id:"001Wj00000xz3QP",name:"Groupe SEB",hadOpportunity:!1},{id:"001Wj00000syXLZ",name:"Guerbet",hadOpportunity:!1},{id:"001Wj00000xyP83",name:"Heraeus Holding",hadOpportunity:!1},{id:"001Wj00000xxuVh",name:"Hermes International",hadOpportunity:!1},{id:"001Wj00000xz32D",name:"Hornbach Group",hadOpportunity:!1},{id:"001Wj00000hkk0u",name:"ICON",hadOpportunity:!1},{id:"001Wj00000mCFr2",name:"ICON Clinical Research",hadOpportunity:!0},{id:"001Wj00000Y64qd",name:"ION",hadOpportunity:!0},{id:"001Wj00000xz3AH",name:"Ingka Group",hadOpportunity:!1},{id:"001Wj00000tWwXa",name:"Jacobs Engineering Group",hadOpportunity:!1},{id:"001Wj00000xz30c",name:"Johnson Matthey",hadOpportunity:!1},{id:"001Wj00000mCFtM",name:"Kellanova",hadOpportunity:!0},{id:"001Wj00000xz3S1",name:"Klockner",hadOpportunity:!1},{id:"001Wj00000tWwYC",name:"Kuehne & Nagel",hadOpportunity:!1},{id:"001Wj00000bWIym",name:"LSEG",hadOpportunity:!1},{id:"001Wj00000Y6VZE",name:"Linde",hadOpportunity:!1},{id:"001Wj00000xy1Lu",name:"M&G",hadOpportunity:!1},{id:"001Wj00000xz0h4",name:"Metinvest",hadOpportunity:!1},{id:"001Wj00000xyNse",name:"NN Group",hadOpportunity:!1},{id:"001Wj00000xyECc",name:"Network Rail",hadOpportunity:!1},{id:"001Wj00000xyudG",name:"Nordex",hadOpportunity:!1},{id:"001Wj00000tWwXc",name:"Ocorian",hadOpportunity:!1},{id:"001Wj00000fFW1m",name:"Okta",hadOpportunity:!1},{id:"001Wj00000mCFrI",name:"Orsted",hadOpportunity:!0},{id:"001Wj00000tWwYK",name:"PGIM",hadOpportunity:!1},{id:"001Wj00000xz38f",name:"PPF Group",hadOpportunity:!1},{id:"001Wj00000tWwYi",name:"Penneys",hadOpportunity:!1},{id:"001Wj00000tWwYL",name:"Philips Electronics",hadOpportunity:!1},{id:"001Wj00000tWwYP",name:"Reddit",hadOpportunity:!1},{id:"001Wj00000mCFrU",name:"Riot Games",hadOpportunity:!0},{id:"001Wj00000xyD0Q",name:"Rolls-Royce",hadOpportunity:!1},{id:"001Wj00000xxIqC",name:"Royal Ahold Delhaize",hadOpportunity:!1},{id:"001Wj00000xz3Gj",name:"Rubis",hadOpportunity:!1},{id:"001Wj00000xyrh0",name:"Salzgitter",hadOpportunity:!1},{id:"001Wj00000bWBm6",name:"Schneider Electric",hadOpportunity:!1},{id:"001Wj00000mI9Nm",name:"Sequoia Climate Fund",hadOpportunity:!1},{id:"001Wj00000fCp7J",name:"Siemens",hadOpportunity:!1},{id:"001Wj00000tWwYR",name:"Smurfit Kappa",hadOpportunity:!1},{id:"001Wj00000tWwYS",name:"Stewart",hadOpportunity:!1},{id:"001Wj00000syavy",name:"Symrise AG",hadOpportunity:!1},{id:"001Wj00000mCFs0",name:"Taoglas Limited",hadOpportunity:!0},{id:"001Wj00000mCFtP",name:"Teamwork.com",hadOpportunity:!0},{id:"001Wj00000sxsOq",name:"TechnipFMC",hadOpportunity:!1},{id:"001Wj00000tWwXe",name:"Teneo",hadOpportunity:!1},{id:"001Wj00000Y64qc",name:"Thales",hadOpportunity:!1},{id:"001Hp00003kIrNJ",name:"Toyota",hadOpportunity:!0},{id:"001Wj00000mCFqw",name:"Ulster Bank",hadOpportunity:!1},{id:"001Wj00000xxDSI",name:"Unedic",hadOpportunity:!1},{id:"001Wj00000mCFs2",name:"Vantage Towers",hadOpportunity:!0},{id:"001Hp00003kIrNs",name:"Vistra",hadOpportunity:!0},{id:"001Wj00000Y6VZD",name:"WPP",hadOpportunity:!0},{id:"001Wj00000ZLVpT",name:"Wellspring Philanthropic Fund",hadOpportunity:!0},{id:"001Wj00000mCFsY",name:"World Rugby",hadOpportunity:!1},{id:"001Wj00000xyygs",name:"Wurth",hadOpportunity:!1},{id:"001Wj00000aLlzL",name:"Xerox",hadOpportunity:!1},{id:"001Wj00000j3QNL",name:"adidas",hadOpportunity:!1}]},"david.vanreyk@eudia.com":{email:"david.vanreyk@eudia.com",name:"David Van Reyk",accounts:[{id:"001Wj00000cIA4i",name:"Amerivet",hadOpportunity:!0},{id:"001Wj00000dw9pN",name:"Ardian",hadOpportunity:!0}]},"emer.flynn@eudia.com":{email:"emer.flynn@eudia.com",name:"Emer Flynn",accounts:[{id:"001Wj00000syUts",name:"Bakkavor",hadOpportunity:!1},{id:"001Wj00000syAdO",name:"Bonduelle",hadOpportunity:!1},{id:"001Wj00000syAoe",name:"Gerresheimer",hadOpportunity:!1},{id:"001Wj00000syBb5",name:"Harbour Energy",hadOpportunity:!1},{id:"001Wj00000soqIv",name:"Lundbeck",hadOpportunity:!1},{id:"001Wj00000mCFr6",name:"NTMA",hadOpportunity:!0},{id:"001Wj00000sxy9J",name:"Orion Pharma",hadOpportunity:!1},{id:"001Wj00000soqNk",name:"Sobi",hadOpportunity:!1},{id:"001Wj00000sy54F",name:"SubSea7",hadOpportunity:!1},{id:"001Wj00000sxvzJ",name:"Virbac",hadOpportunity:!1}]},"greg.machale@eudia.com":{email:"greg.machale@eudia.com",name:"Greg MacHale",accounts:[{id:"001Wj00000Y64ql",name:"ABN AMRO Bank N.V.",hadOpportunity:!1},{id:"001Wj00000tWwYd",name:"AXA",hadOpportunity:!1},{id:"001Hp00003kIrEF",name:"Abbott Laboratories",hadOpportunity:!0},{id:"001Wj00000tWwXg",name:"Abtran",hadOpportunity:!1},{id:"001Wj00000umCEl",name:"Aerogen",hadOpportunity:!1},{id:"001Wj00000xyMyB",name:"Air Liquide",hadOpportunity:!1},{id:"001Wj00000tWwYa",name:"Allergan",hadOpportunity:!1},{id:"001Wj00000sgXdB",name:"Allianz Insurance",hadOpportunity:!0},{id:"001Wj00000tWwYb",name:"Almac Group",hadOpportunity:!1},{id:"001Hp00003kIrEm",name:"Amgen",hadOpportunity:!1},{id:"001Wj00000pzTPu",name:"Arrow Global Group PLC/Mars Capital",hadOpportunity:!1},{id:"001Wj00000tWwXm",name:"Arvato Digital Services",hadOpportunity:!1},{id:"001Wj00000tWwXn",name:"Arvato Supply Chain Solutions",hadOpportunity:!1},{id:"001Wj00000tWwYc",name:"Arvato Systems",hadOpportunity:!1},{id:"001Wj00000xz3VF",name:"Asklepios",hadOpportunity:!1},{id:"001Wj00000vWwfx",name:"Associated British Foods",hadOpportunity:!1},{id:"001Hp00003kIrFB",name:"AstraZeneca",hadOpportunity:!1},{id:"001Wj00000bWJ0A",name:"Atos",hadOpportunity:!1},{id:"001Wj00000hfWMu",name:"Aya Healthcare",hadOpportunity:!1},{id:"001Wj00000tWwXV",name:"BCM Group",hadOpportunity:!1},{id:"001Wj00000tWwXU",name:"BCMGlobal ASI Ltd",hadOpportunity:!1},{id:"001Wj00000Y6VMd",name:"BNP Paribas",hadOpportunity:!0},{id:"001Wj00000X4OqN",name:"BT Group",hadOpportunity:!0},{id:"001Wj00000vRJ13",name:"BWG Group",hadOpportunity:!1},{id:"001Wj00000bWBsw",name:"Bausch + Lomb",hadOpportunity:!1},{id:"001Hp00003kIrFO",name:"Baxter International",hadOpportunity:!1},{id:"001Wj00000wLIjh",name:"Baywa",hadOpportunity:!1},{id:"001Wj00000tWwXs",name:"Bidvest Noonan",hadOpportunity:!1},{id:"001Wj00000mCFqr",name:"Biomarin International Limited",hadOpportunity:!0},{id:"001Hp00003kIrFd",name:"Booking Holdings",hadOpportunity:!0},{id:"001Wj00000T5gdt",name:"Bosch",hadOpportunity:!1},{id:"001Hp00003kIrFg",name:"Boston Scientific",hadOpportunity:!1},{id:"001Wj00000xyNsd",name:"Brenntag",hadOpportunity:!1},{id:"001Wj00000tgYgj",name:"British American Tobacco ( BAT )",hadOpportunity:!1},{id:"001Wj00000ulXoK",name:"British Petroleum ( BP )",hadOpportunity:!1},{id:"001Hp00003kIrDK",name:"Bupa",hadOpportunity:!1},{id:"001Wj00000bWBkr",name:"CRH",hadOpportunity:!1},{id:"001Wj00000uZ5J7",name:"Canada Life",hadOpportunity:!0},{id:"001Hp00003kIrFu",name:"Capgemini",hadOpportunity:!1},{id:"001Wj00000tWwYe",name:"Capita",hadOpportunity:!1},{id:"001Wj00000mCFt9",name:"Cerberus European Servicing",hadOpportunity:!0},{id:"001Wj00000tWwXz",name:"CluneTech",hadOpportunity:!1},{id:"001Wj00000wKnrE",name:"Co-operative Group ( Co-op )",hadOpportunity:!1},{id:"001Wj00000Y6HEM",name:"Commerzbank AG",hadOpportunity:!1},{id:"001Wj00000aLp9L",name:"Compass",hadOpportunity:!1},{id:"001Wj00000cSBr6",name:"Compass Group Equity Partners",hadOpportunity:!1},{id:"001Wj00000Y6VMk",name:"Computershare",hadOpportunity:!0},{id:"001Wj00000uP5x8",name:"Cornmarket Financial Services",hadOpportunity:!0},{id:"001Wj00000tWwY0",name:"Cornmarket Hill Trading Limited",hadOpportunity:!1},{id:"001Hp00003kIrGk",name:"Covestro",hadOpportunity:!1},{id:"001Wj00000tWwXY",name:"DCC Vital",hadOpportunity:!1},{id:"001Wj00000mCFrV",name:"Danske Bank",hadOpportunity:!1},{id:"001Hp00003kJ9fx",name:"Deutsche Bank AG",hadOpportunity:!1},{id:"001Wj00000Y6VMM",name:"Diageo",hadOpportunity:!0},{id:"001Wj00000prFOX",name:"Doosan Bobcat",hadOpportunity:!0},{id:"001Wj00000wKzZ1",name:"Drax Group",hadOpportunity:!1},{id:"001Hp00003kIrHQ",name:"EG Group",hadOpportunity:!1},{id:"001Wj00000hUcQZ",name:"EY",hadOpportunity:!0},{id:"001Wj00000wK30S",name:"EY ( Ernst & Young )",hadOpportunity:!1},{id:"001Hp00003kIrHL",name:"Eaton Corporation",hadOpportunity:!1},{id:"001Wj00000mCFtR",name:"Ekco Cloud Limited",hadOpportunity:!0},{id:"001Hp00003kIrHS",name:"Elevance Health",hadOpportunity:!1},{id:"001Hp00003kIrHT",name:"Eli Lilly",hadOpportunity:!1},{id:"001Wj00000Y6HEn",name:"Ferring Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000tWwYn",name:"Fibrus",hadOpportunity:!1},{id:"001Hp00003kIrHu",name:"Fidelity Investments",hadOpportunity:!1},{id:"001Hp00003kIrI0",name:"Fiserv",hadOpportunity:!1},{id:"001Wj00000xxg4V",name:"Fnac Darty",hadOpportunity:!1},{id:"001Wj00000wL79x",name:"Frasers Group",hadOpportunity:!1},{id:"001Wj00000aLlyX",name:"Gartner",hadOpportunity:!1},{id:"001Wj00000fFuFY",name:"Grant Thornton",hadOpportunity:!0},{id:"001Wj00000uZ4A9",name:"Great West Lifec co",hadOpportunity:!0},{id:"001Wj00000pzTPt",name:"Gym Plus Coffee",hadOpportunity:!1},{id:"001Wj00000xW3SE",name:"Hayfin",hadOpportunity:!0},{id:"001Wj00000pzTPm",name:"Hedgserv",hadOpportunity:!1},{id:"001Wj00000xxsbv",name:"Heidelberg Materials",hadOpportunity:!1},{id:"001Wj00000wvtPl",name:"ICEYE",hadOpportunity:!0},{id:"001Wj00000mCFrH",name:"Indra",hadOpportunity:!1},{id:"001Wj00000uZtcT",name:"Ineos",hadOpportunity:!0},{id:"001Wj00000vXdt1",name:"International Airline Group ( IAG )",hadOpportunity:!1},{id:"001Wj00000wKnZU",name:"International Distribution Services",hadOpportunity:!1},{id:"001Wj00000wKTao",name:"John Swire & Sons",hadOpportunity:!1},{id:"001Wj00000vaqot",name:"Johnson Controls",hadOpportunity:!1},{id:"001Wj00000xwwRX",name:"Jumbo Groep Holding",hadOpportunity:!1},{id:"001Hp00003kIrJb",name:"KPMG",hadOpportunity:!1},{id:"001Wj00000Y6VZM",name:"Kering",hadOpportunity:!1},{id:"001Wj00000mCFrr",name:"Kerry Group",hadOpportunity:!1},{id:"001Wj00000xyyk7",name:"La Poste",hadOpportunity:!1},{id:"001Wj00000tWwYr",name:"Laya Healthcare",hadOpportunity:!1},{id:"001Wj00000tWwYE",name:"Leaseplan",hadOpportunity:!1},{id:"001Wj00000tWwYF",name:"Linked Finance",hadOpportunity:!1},{id:"001Wj00000Y6HEA",name:"Lloyds Banking Group",hadOpportunity:!1},{id:"001Wj00000xyDV4",name:"LyondellBasell Industries",hadOpportunity:!1},{id:"001Wj00000tWwYG",name:"MSC - Mediterranean Shipping Company",hadOpportunity:!1},{id:"001Wj00000wvGLB",name:"MTU Maintenance Lease Services",hadOpportunity:!1},{id:"001Wj00000iC14L",name:"MUFG Investor Services",hadOpportunity:!1},{id:"001Wj00000xyp2U",name:"MVV Energie",hadOpportunity:!1},{id:"001Wj00000tWwYp",name:"Mail Metrics",hadOpportunity:!0},{id:"001Wj00000qFtCk",name:"Mars Capital",hadOpportunity:!1},{id:"001Wj00000pAeWg",name:"Meetingsbooker",hadOpportunity:!0},{id:"001Hp00003kIrKJ",name:"Mercedes-Benz Group",hadOpportunity:!0},{id:"001Wj00000YEMaI",name:"Mercer",hadOpportunity:!1},{id:"001Wj00000vwSUX",name:"Mercor",hadOpportunity:!0},{id:"001Wj00000mCFtU",name:"Mercury Engineering",hadOpportunity:!0},{id:"001Wj00000yGZth",name:"Monzo",hadOpportunity:!1},{id:"001Wj00000tWwYg",name:"Musgrave",hadOpportunity:!1},{id:"001Wj00000lPFP3",name:"Nomura",hadOpportunity:!0},{id:"001Wj00000tWwYH",name:"Norbrook Laboratories",hadOpportunity:!1},{id:"001Hp00003kIrKn",name:"Northrop Grumman",hadOpportunity:!1},{id:"001Wj00000xxcH4",name:"Orange",hadOpportunity:!1},{id:"001Wj00000tWwYI",name:"P.J. Carroll (BAT Ireland)",hadOpportunity:!1},{id:"001Wj00000mCFsf",name:"Pepper Finance Corporation",hadOpportunity:!0},{id:"001Wj00000mCFrO",name:"Peptalk",hadOpportunity:!0},{id:"001Wj00000mCFr1",name:"Permanent TSB plc",hadOpportunity:!0},{id:"001Wj00000Y6QfR",name:"Pernod Ricard",hadOpportunity:!0},{id:"001Wj00000vVxFy",name:"Phoenix Group",hadOpportunity:!1},{id:"001Wj00000tWwYM",name:"Pinewood Laboratories",hadOpportunity:!1},{id:"001Wj00000tWwYN",name:"Pinsent Masons",hadOpportunity:!1},{id:"001Wj00000tWwYO",name:"Pramerica",hadOpportunity:!1},{id:"001Hp00003kIrLf",name:"PwC",hadOpportunity:!1},{id:"001Hp00003kIrLi",name:"Quest Diagnostics",hadOpportunity:!0},{id:"001Wj00000xy735",name:"RATP Group",hadOpportunity:!1},{id:"001Wj00000xyKjS",name:"Randstad",hadOpportunity:!1},{id:"001Wj00000mCFsF",name:"Regeneron",hadOpportunity:!0},{id:"001Wj00000xwh4H",name:"Renault",hadOpportunity:!1},{id:"001Wj00000xy1P5",name:"Rheinmetall",hadOpportunity:!1},{id:"001Wj00000tWwYQ",name:"Roche",hadOpportunity:!1},{id:"001Wj00000wKi8O",name:"Royal London",hadOpportunity:!1},{id:"001Wj00000mCFsR",name:"Ryanair",hadOpportunity:!0},{id:"001Wj00000xyJqd",name:"SCOR",hadOpportunity:!1},{id:"001Wj00000pAxKo",name:"SSP Group",hadOpportunity:!0},{id:"001Wj00000bWIzx",name:"Saint-Gobain",hadOpportunity:!1},{id:"001Wj00000pzTPv",name:"Scottish Friendly",hadOpportunity:!1},{id:"001Wj00000bzz9U",name:"Signify Group",hadOpportunity:!0},{id:"001Wj00000fFuG4",name:"Sky",hadOpportunity:!1},{id:"001Hp00003kIrDR",name:"Smith & Nephew",hadOpportunity:!1},{id:"001Hp00003kIrE1",name:"Societe Generale",hadOpportunity:!1},{id:"001Hp00003kIrMj",name:"State Street",hadOpportunity:!0},{id:"001Wj00000xyy4A",name:"Sudzucker",hadOpportunity:!1},{id:"001Wj00000mCFtB",name:"SurveyMonkey",hadOpportunity:!1},{id:"001Wj00000xypQh",name:"TUI",hadOpportunity:!1},{id:"001Wj00000tWwYT",name:"Takeda",hadOpportunity:!1},{id:"001Wj00000wKD4c",name:"Talanx",hadOpportunity:!1},{id:"001Wj00000mCFr9",name:"Tesco",hadOpportunity:!0},{id:"001Wj00000tWwYX",name:"Tullow Oil",hadOpportunity:!1},{id:"001Wj00000mCFsS",name:"Uniphar PLC",hadOpportunity:!0},{id:"001Hp00003kIrNg",name:"UnitedHealth Group",hadOpportunity:!1},{id:"001Wj00000mCFsx",name:"Vodafone Ireland",hadOpportunity:!1},{id:"001Wj00000xybh4",name:"Wendel",hadOpportunity:!1},{id:"001Wj00000sCb3D",name:"Willis Towers Watson",hadOpportunity:!1},{id:"001Wj00000tWwYY",name:"Winthrop",hadOpportunity:!1},{id:"001Wj00000pzTPW",name:"WizzAir",hadOpportunity:!1},{id:"001Wj00000mCFrm",name:"eShopWorld",hadOpportunity:!0},{id:"001Hp00003kJ9Ck",name:"wnco.com",hadOpportunity:!1}]},"himanshu.agarwal@eudia.com":{email:"himanshu.agarwal@eudia.com",name:"Himanshu Agarwal",accounts:[{id:"001Hp00003kIrEs",name:"AON",hadOpportunity:!0},{id:"001Wj00000RwUpO",name:"Acrisure",hadOpportunity:!0},{id:"001Hp00003kIrCd",name:"Adobe",hadOpportunity:!1},{id:"001Hp00003kIrEU",name:"Albertsons",hadOpportunity:!0},{id:"001Wj00000T6Hrw",name:"Atlassian",hadOpportunity:!0},{id:"001Wj00000ZRrYl",name:"Avis Budget Group",hadOpportunity:!0},{id:"001Wj00000kIYAD",name:"Axis Bank",hadOpportunity:!0},{id:"001Hp00003kIrD0",name:"Broadcom",hadOpportunity:!0},{id:"001Hp00003kIrGh",name:"Costco Wholesale",hadOpportunity:!1},{id:"001Hp00003kIrCu",name:"Disney",hadOpportunity:!1},{id:"001Hp00003kIrIF",name:"Gap",hadOpportunity:!0},{id:"001Hp00003kIrDN",name:"Genpact",hadOpportunity:!0},{id:"001Wj00000Zcmad",name:"Geodis",hadOpportunity:!0},{id:"001Wj00000Q2yaX",name:"Innovative Driven",hadOpportunity:!1},{id:"001Hp00003lhshd",name:"Instacart",hadOpportunity:!0},{id:"001Hp00003kIrJx",name:"Lowe's",hadOpportunity:!1},{id:"001Hp00003kIrDk",name:"Moderna",hadOpportunity:!0},{id:"001Wj00000hDvCc",name:"Nykaa",hadOpportunity:!0},{id:"001Wj00000h9r1F",name:"Piramal Finance",hadOpportunity:!0},{id:"001Hp00003kIrDc",name:"Progressive",hadOpportunity:!0},{id:"001Wj00000cyDxS",name:"Pyxus",hadOpportunity:!0},{id:"001Wj00000XXvnk",name:"Relativity",hadOpportunity:!0},{id:"001Wj00000kIFDh",name:"Reliance",hadOpportunity:!0},{id:"001Wj00000eKsGZ",name:"Snowflake",hadOpportunity:!1},{id:"001Hp00003kIrNr",name:"Visa",hadOpportunity:!0},{id:"001Hp00003kIrO0",name:"Warner Bros Discovery",hadOpportunity:!1},{id:"001Hp00003kIrDT",name:"xAI",hadOpportunity:!0}]},"jon.cobb@eudia.com":{email:"jon.cobb@eudia.com",name:"Jon Cobb",accounts:[{id:"001Wj00000XTOQZ",name:"Armstrong World Industries",hadOpportunity:!0},{id:"001Wj00000c0Cxn",name:"U.S. Aircraft Insurance Group",hadOpportunity:!0}]},"julie.stefanich@eudia.com":{email:"julie.stefanich@eudia.com",name:"Julie Stefanich",accounts:[{id:"001Wj00000asSHB",name:"Airbus",hadOpportunity:!0},{id:"001Hp00003kIrEl",name:"Ameriprise Financial",hadOpportunity:!0},{id:"001Wj00000X6IDs",name:"Andersen",hadOpportunity:!0},{id:"001Hp00003kIrEv",name:"Apple",hadOpportunity:!0},{id:"001Wj00000soLVH",name:"Base Power",hadOpportunity:!0},{id:"001Hp00003kJ9pX",name:"Bayer",hadOpportunity:!0},{id:"001Hp00003kIrFP",name:"Bechtel",hadOpportunity:!0},{id:"001Hp00003kIrFZ",name:"Block",hadOpportunity:!0},{id:"001Hp00003kIrE3",name:"Cargill",hadOpportunity:!0},{id:"001Hp00003kIrGD",name:"Charles Schwab",hadOpportunity:!0},{id:"001Hp00003kIrE4",name:"Chevron",hadOpportunity:!0},{id:"001Hp00003kIrDh",name:"Comcast",hadOpportunity:!0},{id:"001Hp00003kIrGe",name:"Corebridge Financial",hadOpportunity:!0},{id:"001Wj00000eLJAK",name:"CrowdStrike",hadOpportunity:!1},{id:"001Hp00003liBe9",name:"DoorDash",hadOpportunity:!1},{id:"001Hp00003kIrE7",name:"ECMS",hadOpportunity:!0},{id:"001Hp00003kIrHP",name:"Edward Jones",hadOpportunity:!0},{id:"001Wj00000iRzqv",name:"Florida Crystals Corporation",hadOpportunity:!0},{id:"001Wj00000XS3MX",name:"Flutter",hadOpportunity:!0},{id:"001Hp00003kIrIP",name:"Genworth Financial",hadOpportunity:!0},{id:"001Hp00003kIrIX",name:"Goldman Sachs",hadOpportunity:!0},{id:"001Wj00000rceVp",name:"Hikma",hadOpportunity:!0},{id:"001Hp00003kIrJV",name:"KLA",hadOpportunity:!0},{id:"001Wj00000XkT43",name:"Kaiser Permanente",hadOpportunity:!0},{id:"001Wj00000aLmhe",name:"Macmillan",hadOpportunity:!0},{id:"001Wj00000X6G8q",name:"Mainsail Partners",hadOpportunity:!0},{id:"001Hp00003kIrDb",name:"McKinsey & Company",hadOpportunity:!0},{id:"001Hp00003kIrKL",name:"MetLife",hadOpportunity:!0},{id:"001Hp00003kIrCp",name:"Mosaic",hadOpportunity:!0},{id:"001Hp00003kIrDe",name:"National Grid",hadOpportunity:!0},{id:"001Hp00003kIrKY",name:"Netflix",hadOpportunity:!0},{id:"001Hp00003kIrKj",name:"Nordstrom",hadOpportunity:!0},{id:"001Hp00003kIrL2",name:"O'Reilly Automotive",hadOpportunity:!0},{id:"001Hp00003kIrDv",name:"Oracle",hadOpportunity:!0},{id:"001Hp00003kIrLP",name:"PG&E",hadOpportunity:!1},{id:"001Hp00003kIrLH",name:"PayPal inc.",hadOpportunity:!1},{id:"001Hp00003kIrLN",name:"Petsmart",hadOpportunity:!0},{id:"001Hp00003kIrLZ",name:"Procter & Gamble",hadOpportunity:!0},{id:"001Wj00000XcHEb",name:"Resmed",hadOpportunity:!0},{id:"001Hp00003lhsUY",name:"Rio Tinto Group",hadOpportunity:!0},{id:"001Wj00000svQI3",name:"Safelite",hadOpportunity:!0},{id:"001Wj00000Yfysf",name:"Samsara",hadOpportunity:!0},{id:"001Wj00000fRtLm",name:"State Farm",hadOpportunity:!0},{id:"001Hp00003kIrNH",name:"T-Mobile",hadOpportunity:!0},{id:"001Hp00003kIrCr",name:"TIAA",hadOpportunity:!0},{id:"001Wj00000bIVo1",name:"TSMC",hadOpportunity:!0},{id:"001Wj00000bzz9T",name:"Tailored Brands",hadOpportunity:!0},{id:"001Hp00003kIrNB",name:"The Wonderful Company",hadOpportunity:!0},{id:"001Hp00003kIrNV",name:"Uber",hadOpportunity:!0},{id:"001Wj00000Y6VYk",name:"Verifone",hadOpportunity:!0},{id:"001Hp00003kIrOL",name:"World Wide Technology",hadOpportunity:!0},{id:"001Wj00000bWIza",name:"eBay",hadOpportunity:!1}]},"justin.hills@eudia.com":{email:"justin.hills@eudia.com",name:"Justin Hills",accounts:[{id:"001Wj00000vCx6j",name:"1800 Flowers",hadOpportunity:!1},{id:"001Wj00000Y6VM4",name:"Ares Management Corporation",hadOpportunity:!0},{id:"001Hp00003kIrG8",name:"Centene",hadOpportunity:!0},{id:"001Wj00000c9oCv",name:"Cox Media Group",hadOpportunity:!0},{id:"001Wj00000vCPMs",name:"Crusoe",hadOpportunity:!1},{id:"001Wj00000vCiAw",name:"Deel",hadOpportunity:!1},{id:"001Wj00000Y0jPm",name:"Delinea",hadOpportunity:!0},{id:"001Wj00000iwKGQ",name:"Dominos",hadOpportunity:!0},{id:"001Hp00003kIrDa",name:"Duracell",hadOpportunity:!0},{id:"001Wj00000Y6Vde",name:"EPIC Insurance Brokers & Consultants",hadOpportunity:!1},{id:"001Hp00003kIrIC",name:"Freddie Mac",hadOpportunity:!1},{id:"001Hp00003kJ9gW",name:"Genentech",hadOpportunity:!0},{id:"001Hp00003kIrDV",name:"Intel",hadOpportunity:!0},{id:"001Hp00003kIrJJ",name:"Johnson & Johnson",hadOpportunity:!0},{id:"001Wj00000gnrug",name:"Kraken",hadOpportunity:!0},{id:"001Wj00000op4EW",name:"McCormick & Co Inc",hadOpportunity:!0},{id:"001Wj00000RCeqA",name:"Nielsen",hadOpportunity:!0},{id:"001Wj00000YEMZp",name:"Notion",hadOpportunity:!1},{id:"001Wj00000ix7c2",name:"Nouryon",hadOpportunity:!0},{id:"001Wj00000WYyKI",name:"Ramp",hadOpportunity:!0},{id:"001Wj00000hzxnD",name:"Ro Healthcare",hadOpportunity:!1},{id:"001Hp00003kIrMi",name:"Starbucks",hadOpportunity:!0},{id:"001Wj00000o5G0v",name:"StockX",hadOpportunity:!0},{id:"001Wj00000f3bWU",name:"TransUnion",hadOpportunity:!0},{id:"001Wj00000oqRyc",name:"Walgreens Boots Alliance",hadOpportunity:!0}]},"mike.ayres@eudia.com":{email:"mike.ayres@eudia.com",name:"Mike Ayres",accounts:[{id:"001Wj00000synYD",name:"Barry Callebaut Group",hadOpportunity:!1}]},"mike@eudia.com":{email:"mike@eudia.com",name:"Mike Masiello",accounts:[{id:"001Wj00000celOy",name:"Arizona Gov Office",hadOpportunity:!1},{id:"001Wj00000p1lCP",name:"Army Applications Lab",hadOpportunity:!0},{id:"001Wj00000p1hYb",name:"Army Corps of Engineers",hadOpportunity:!0},{id:"001Wj00000ZxEpD",name:"Army Futures Command",hadOpportunity:!0},{id:"001Hp00003lhZrR",name:"DARPA",hadOpportunity:!0},{id:"001Wj00000bWBlA",name:"Defense Innovation Unit (DIU)",hadOpportunity:!0},{id:"001Hp00003kJzoR",name:"Gov - Civ",hadOpportunity:!1},{id:"001Hp00003kJuJ5",name:"Gov - DOD",hadOpportunity:!0},{id:"001Wj00000p1PVH",name:"IFC",hadOpportunity:!0},{id:"001Wj00000UkYiC",name:"MITRE",hadOpportunity:!1},{id:"001Wj00000VVJ31",name:"NATO",hadOpportunity:!0},{id:"001Wj00000Ukxzt",name:"SIIA",hadOpportunity:!1},{id:"001Wj00000p1Ybm",name:"SOCOM",hadOpportunity:!0},{id:"001Wj00000Zwarp",name:"Second Front",hadOpportunity:!1},{id:"001Hp00003lhcL9",name:"Social Security Administration",hadOpportunity:!0},{id:"001Wj00000p1jH3",name:"State of Alaska",hadOpportunity:!0},{id:"001Wj00000hVa6V",name:"State of Arizona",hadOpportunity:!0},{id:"001Wj00000p0PcE",name:"State of California",hadOpportunity:!0},{id:"001Wj00000bWBke",name:"U.S. Air Force",hadOpportunity:!0},{id:"001Wj00000bWIzN",name:"U.S. Army",hadOpportunity:!0},{id:"001Hp00003kIrDU",name:"U.S. Government",hadOpportunity:!1},{id:"001Wj00000p1SRX",name:"U.S. Marine Corps",hadOpportunity:!0},{id:"001Wj00000hfaDc",name:"U.S. Navy",hadOpportunity:!0},{id:"001Wj00000Rrm5O",name:"UK Government",hadOpportunity:!0},{id:"001Hp00003lieJP",name:"USDA",hadOpportunity:!0},{id:"001Wj00000p1SuZ",name:"Vulcan Special Ops",hadOpportunity:!0}]},"mitch.loquaci@eudia.com":{email:"mitch.loquaci@eudia.com",name:"Mitch Loquaci",accounts:[{id:"001Hp00003kIrCn",name:"Home Depot",hadOpportunity:!0},{id:"001Wj00000wlTbU",name:"Mimecast",hadOpportunity:!1},{id:"001Wj00000cpxt0",name:"Novelis",hadOpportunity:!0}]},"nathan.shine@eudia.com":{email:"nathan.shine@eudia.com",name:"Nathan Shine",accounts:[{id:"001Wj00000xy4hv",name:"ASDA Group",hadOpportunity:!1},{id:"001Wj00000xz26A",name:"Achmea",hadOpportunity:!1},{id:"001Wj00000xyb9C",name:"Adient",hadOpportunity:!1},{id:"001Hp00003kIrEn",name:"Amphenol",hadOpportunity:!0},{id:"001Wj00000mCFr3",name:"Ancestry",hadOpportunity:!0},{id:"001Wj00000xxHhF",name:"Ashtead Group",hadOpportunity:!1},{id:"001Wj00000mCFr5",name:"Boomi",hadOpportunity:!1},{id:"001Wj00000mCFrQ",name:"CaliberAI",hadOpportunity:!1},{id:"001Wj00000WiFP8",name:"Cantor Fitzgerald",hadOpportunity:!0},{id:"001Wj00000mCFrj",name:"CarTrawler",hadOpportunity:!0},{id:"001Wj00000xz2UM",name:"Carnival",hadOpportunity:!1},{id:"001Wj00000pzTPd",name:"Circle K",hadOpportunity:!1},{id:"001Wj00000xyP82",name:"Claas Group",hadOpportunity:!1},{id:"001Wj00000bW3KA",name:"Cloud Software Group",hadOpportunity:!1},{id:"001Wj00000mHDBo",name:"Coimisiun na Mean",hadOpportunity:!0},{id:"001Wj00000mCFqt",name:"CommScope Technologies",hadOpportunity:!0},{id:"001Wj00000xz2ZC",name:"Continental",hadOpportunity:!1},{id:"001Wj00000Y6wFZ",name:"Coursera",hadOpportunity:!1},{id:"001Wj00000xz3DV",name:"Credit Mutuel Group",hadOpportunity:!1},{id:"001Wj00000Y6DDY",name:"Credit Suisse",hadOpportunity:!1},{id:"001Wj00000pzTPZ",name:"CubeMatch",hadOpportunity:!1},{id:"001Wj00000pzTPb",name:"Dawn Meats",hadOpportunity:!1},{id:"001Wj00000xxtwB",name:"Deutsche Telekom",hadOpportunity:!1},{id:"001Hp00003kIrDM",name:"Dropbox",hadOpportunity:!0},{id:"001Wj00000mCFra",name:"Dunnes Stores",hadOpportunity:!0},{id:"001Wj00000xxq75",name:"ELO Group",hadOpportunity:!1},{id:"001Wj00000xyEnj",name:"Engie",hadOpportunity:!1},{id:"001Wj00000mCFqu",name:"Fexco",hadOpportunity:!0},{id:"001Wj00000mCFsA",name:"First Derivatives",hadOpportunity:!1},{id:"001Wj00000mCFtD",name:"Flynn O'Driscoll, Business Lawyers",hadOpportunity:!1},{id:"001Wj00000xyMmu",name:"Forvia",hadOpportunity:!1},{id:"001Wj00000xz3Bt",name:"Freudenberg Group",hadOpportunity:!1},{id:"001Wj00000mCFro",name:"GemCap",hadOpportunity:!0},{id:"001Wj00000xxqjp",name:"Groupama",hadOpportunity:!1},{id:"001Wj00000xyFdR",name:"Groupe Eiffage",hadOpportunity:!1},{id:"001Wj00000xxtuZ",name:"Hays",hadOpportunity:!1},{id:"001Wj00000xy4A2",name:"HelloFresh",hadOpportunity:!1},{id:"001Wj00000mCFrq",name:"ID-Pal",hadOpportunity:!1},{id:"001Wj00000xz3IL",name:"ING Group",hadOpportunity:!1},{id:"001Wj00000xz2xN",name:"Inchcape",hadOpportunity:!1},{id:"001Wj00000mCFs5",name:"Indeed",hadOpportunity:!0},{id:"001Wj00000sooaT",name:"Ipsen",hadOpportunity:!1},{id:"001Wj00000mCFss",name:"Irish League of Credit Unions",hadOpportunity:!0},{id:"001Wj00000mCFrS",name:"Irish Life",hadOpportunity:!0},{id:"001Wj00000mCFsV",name:"Irish Residential Properties REIT Plc",hadOpportunity:!1},{id:"001Hp00003kIrJO",name:"Keurig Dr Pepper",hadOpportunity:!0},{id:"001Wj00000hkk0z",name:"Kingspan",hadOpportunity:!0},{id:"001Wj00000mCFrs",name:"Kitman Labs",hadOpportunity:!0},{id:"001Wj00000xy1VZ",name:"LDC Group",hadOpportunity:!1},{id:"001Wj00000mCFtF",name:"Let's Get Checked",hadOpportunity:!1},{id:"001Hp00003kIrJo",name:"Liberty Insurance",hadOpportunity:!1},{id:"001Wj00000xz2yz",name:"Marks and Spencer Group",hadOpportunity:!1},{id:"001Wj00000mCFsM",name:"McDermott Creed & Martyn",hadOpportunity:!0},{id:"001Hp00003kIrKF",name:"McKesson",hadOpportunity:!1},{id:"001Wj00000mCFso",name:"Mediolanum",hadOpportunity:!0},{id:"001Wj00000xyP9g",name:"Munich Re Group",hadOpportunity:!1},{id:"001Wj00000xxIyF",name:"Nationwide Building Society",hadOpportunity:!1},{id:"001Wj00000xxgZB",name:"Nebius Group",hadOpportunity:!1},{id:"001Wj00000symlp",name:"Nestl\xE9 Health Science",hadOpportunity:!1},{id:"001Wj00000xyYPq",name:"Nexans",hadOpportunity:!1},{id:"001Wj00000xybvb",name:"Next",hadOpportunity:!1},{id:"001Wj00000syczN",name:"Nomad Foods",hadOpportunity:!1},{id:"001Wj00000mCFrF",name:"OKG Payments Services Limited",hadOpportunity:!0},{id:"001Wj00000mCFqy",name:"Oneview Healthcare",hadOpportunity:!1},{id:"001Wj00000aCGRB",name:"Optum",hadOpportunity:!1},{id:"001Wj00000sylmX",name:"Orlen",hadOpportunity:!1},{id:"001Wj00000mCFrL",name:"PROS",hadOpportunity:!1},{id:"001Wj00000ZDPUI",name:"Perrigo Pharma",hadOpportunity:!0},{id:"001Wj00000xz33p",name:"Phoenix Pharma",hadOpportunity:!1},{id:"001Wj00000mCFqz",name:"Phoenix Tower International",hadOpportunity:!0},{id:"001Wj00000pzTPf",name:"Pipedrive",hadOpportunity:!1},{id:"001Wj00000mCFtS",name:"Poe Kiely Hogan Lanigan",hadOpportunity:!0},{id:"001Wj00000xxwys",name:"REWE Group",hadOpportunity:!1},{id:"001Wj00000xz3On",name:"Rexel",hadOpportunity:!1},{id:"001Wj00000xyJLy",name:"Royal BAM Group",hadOpportunity:!1},{id:"001Wj00000xysZq",name:"SPIE",hadOpportunity:!1},{id:"001Wj00000xxuVg",name:"SSE",hadOpportunity:!1},{id:"001Wj00000xxk1y",name:"Schaeffler",hadOpportunity:!1},{id:"001Wj00000syeJe",name:"Schott Pharma",hadOpportunity:!1},{id:"001Wj00000mCFrX",name:"South East Financial Services Cluster",hadOpportunity:!1},{id:"001Wj00000mCFry",name:"Spectrum Wellness Holdings Limited",hadOpportunity:!0},{id:"001Wj00000mCFsq",name:"Speed Fibre Group(enet)",hadOpportunity:!0},{id:"001Wj00000mCFtH",name:"StepStone Group",hadOpportunity:!0},{id:"001Hp00003kIrMp",name:"Stryker",hadOpportunity:!1},{id:"001Wj00000pzTPa",name:"SuperNode Ltd",hadOpportunity:!1},{id:"001Wj00000mCFtI",name:"Swish Fibre",hadOpportunity:!1},{id:"001Wj00000SFiOv",name:"TikTok",hadOpportunity:!0},{id:"001Wj00000ZDXTR",name:"Tinder LLC",hadOpportunity:!0},{id:"001Wj00000mCFrC",name:"Tines Security Services Limited",hadOpportunity:!0},{id:"001Wj00000xxQsc",name:"UDG Healthcare",hadOpportunity:!1},{id:"001Wj00000pzTPe",name:"Udaras na Gaeltachta",hadOpportunity:!1},{id:"001Wj00000bWBlE",name:"Udemy",hadOpportunity:!0},{id:"001Wj00000Y6VMX",name:"Unilever",hadOpportunity:!1},{id:"001Wj00000pzTPc",name:"Urban Volt",hadOpportunity:!1},{id:"001Wj00000xwB2o",name:"Vitesco Technologies Group",hadOpportunity:!1},{id:"001Hp00003liCZY",name:"Workday",hadOpportunity:!1},{id:"001Wj00000xyOlT",name:"X5 Retail Group",hadOpportunity:!1},{id:"001Wj00000xyXQZ",name:"Zalando",hadOpportunity:!1},{id:"001Wj00000Y6VZ3",name:"Ziff Davis",hadOpportunity:!1},{id:"001Wj00000mCFsZ",name:"Zurich Irish Life plc",hadOpportunity:!0}]},"nicola.fratini@eudia.com":{email:"nicola.fratini@eudia.com",name:"Nicola Fratini",accounts:[{id:"001Wj00000mCFqs",name:"AIB",hadOpportunity:!0},{id:"001Wj00000tWwXp",name:"AXIS Capital",hadOpportunity:!1},{id:"001Wj00000tWwXh",name:"Actavo Group Ltd",hadOpportunity:!1},{id:"001Wj00000thuKE",name:"Aer Lingus",hadOpportunity:!0},{id:"001Wj00000tWwXi",name:"Aer Rianta",hadOpportunity:!1},{id:"001Wj00000mCFrG",name:"AerCap",hadOpportunity:!0},{id:"001Wj00000YEMaB",name:"Aligned Incentives, a Bureau Veritas company",hadOpportunity:!1},{id:"001Wj00000mCFs7",name:"Allied Irish Banks plc",hadOpportunity:!0},{id:"001Wj00000mCFsb",name:"Amundi Ireland Limited",hadOpportunity:!0},{id:"001Wj00000uZ7w2",name:"Anna Charles",hadOpportunity:!1},{id:"001Wj00000TUdXw",name:"Anthropic",hadOpportunity:!0},{id:"001Wj00000mCFrD",name:"Applegreen",hadOpportunity:!1},{id:"001Wj00000wvc5a",name:"AppliedAI",hadOpportunity:!0},{id:"001Wj00000socke",name:"Archer The Well Company",hadOpportunity:!1},{id:"001Wj00000tWwXl",name:"Ardagh Glass Sales",hadOpportunity:!1},{id:"001Wj00000sgB1h",name:"Autorek",hadOpportunity:!1},{id:"001Wj00000mCFrh",name:"Avant Money",hadOpportunity:!0},{id:"001Wj00000tWwXT",name:"Avantcard",hadOpportunity:!1},{id:"001Wj00000mI7Na",name:"Aviva Insurance",hadOpportunity:!0},{id:"001Wj00000tWwXo",name:"Avolon",hadOpportunity:!1},{id:"001Wj00000uNUIB",name:"Bank of China",hadOpportunity:!0},{id:"001Hp00003kJ9kN",name:"Barclays",hadOpportunity:!0},{id:"001Wj00000ttPZB",name:"Barings",hadOpportunity:!0},{id:"001Wj00000tWwXW",name:"Beauparc Group",hadOpportunity:!0},{id:"001Wj00000xxRyK",name:"Bertelsmann",hadOpportunity:!1},{id:"001Wj00000tWwXX",name:"Bidx1",hadOpportunity:!1},{id:"001Wj00000soanc",name:"Borr Drilling",hadOpportunity:!1},{id:"001Wj00000tWwXu",name:"Boylesports",hadOpportunity:!1},{id:"001Wj00000uYz0o",name:"Bud Financial",hadOpportunity:!1},{id:"001Wj00000tWwXv",name:"Bunzl",hadOpportunity:!1},{id:"001Wj00000xxtGE",name:"Burelle",hadOpportunity:!1},{id:"001Wj00000mCFr0",name:"CNP Santander Insurance Services Limited",hadOpportunity:!0},{id:"001Wj00000tWwXw",name:"Cairn Homes",hadOpportunity:!0},{id:"001Wj00000uZ2hp",name:"Centrica",hadOpportunity:!1},{id:"001Wj00000uYYWv",name:"Checkout.com",hadOpportunity:!1},{id:"001Wj00000Y64qg",name:"Christian Dior Couture",hadOpportunity:!1},{id:"001Wj00000Y6VLh",name:"Citi",hadOpportunity:!0},{id:"001Wj00000mCFrE",name:"Clanwilliam Group",hadOpportunity:!0},{id:"001Wj00000tWwYl",name:"Clevercards",hadOpportunity:!1},{id:"001Wj00000mCFsm",name:"Coca-Cola HBC Ireland Limited",hadOpportunity:!0},{id:"001Wj00000xz30b",name:"Compagnie de l'Odet",hadOpportunity:!1},{id:"001Wj00000xxtOM",name:"Credit Industriel & Commercial",hadOpportunity:!1},{id:"001Wj00000uZ7RN",name:"Cuvva",hadOpportunity:!1},{id:"001Wj00000tx2MQ",name:"CyberArk",hadOpportunity:!0},{id:"001Wj00000tWwY1",name:"DAA",hadOpportunity:!1},{id:"001Wj00000xyNnm",name:"DS Smith",hadOpportunity:!1},{id:"001Wj00000hkk0s",name:"DSM",hadOpportunity:!1},{id:"001Wj00000hfWMt",name:"Dassault Syst?mes",hadOpportunity:!1},{id:"001Wj00000mCFsB",name:"Datalex",hadOpportunity:!0},{id:"001Wj00000mCFrl",name:"Davy",hadOpportunity:!0},{id:"001Wj00000tWwYm",name:"Deliveroo",hadOpportunity:!1},{id:"001Wj00000w0uVV",name:"Doceree",hadOpportunity:!0},{id:"001Wj00000vbvuX",name:"Dole plc",hadOpportunity:!1},{id:"001Wj00000tWwXZ",name:"EVO Payments",hadOpportunity:!1},{id:"001Wj00000xxsvH",name:"EXOR Group",hadOpportunity:!1},{id:"001Wj00000tWwY4",name:"Easons",hadOpportunity:!1},{id:"001Wj00000xz35R",name:"EasyJet",hadOpportunity:!1},{id:"001Wj00000xx4SK",name:"Edeka Zentrale",hadOpportunity:!1},{id:"001Wj00000uJwxo",name:"Eir",hadOpportunity:!0},{id:"001Wj00000tWwY5",name:"Elavon",hadOpportunity:!1},{id:"001Wj00000pzTPn",name:"Euronext Dublin",hadOpportunity:!1},{id:"001Wj00000sg8Gc",name:"FARFETCH",hadOpportunity:!0},{id:"001Wj00000mIEAX",name:"FNZ Group",hadOpportunity:!0},{id:"001Wj00000tWwY7",name:"First Data",hadOpportunity:!1},{id:"001Wj00000soigL",name:"Fresenius Kabi",hadOpportunity:!1},{id:"001Wj00000xyXyQ",name:"FrieslandCampina",hadOpportunity:!1},{id:"001Wj00000xyAP9",name:"GasTerra",hadOpportunity:!1},{id:"001Wj00000mCFt1",name:"Goodbody Stockbrokers",hadOpportunity:!0},{id:"001Wj00000soN5f",name:"Greencore",hadOpportunity:!1},{id:"001Wj00000xyyli",name:"Groupe BPCE",hadOpportunity:!1},{id:"001Wj00000xz9xF",name:"Haleon",hadOpportunity:!1},{id:"001Wj00000xz3S2",name:"Hapag-Lloyd",hadOpportunity:!1},{id:"001Wj00000tWwY9",name:"Henderson Group",hadOpportunity:!1},{id:"001Wj00000Y6VMb",name:"Henkel",hadOpportunity:!1},{id:"001Hp00003liHvf",name:"Hubspot",hadOpportunity:!0},{id:"001Wj00000sg9MN",name:"INNIO Group",hadOpportunity:!1},{id:"001Wj00000bzz9O",name:"IPG Mediabrands",hadOpportunity:!0},{id:"001Wj00000tWwYA",name:"IPL Plastics",hadOpportunity:!1},{id:"001Wj00000ZDXrd",name:"Intercom",hadOpportunity:!0},{id:"001Wj00000tWwYB",name:"Ires Reit",hadOpportunity:!1},{id:"001Wj00000xy2WS",name:"J. Sainsbury",hadOpportunity:!1},{id:"001Wj00000xyG3B",name:"JD Sports Fashion",hadOpportunity:!1},{id:"001Wj00000ullPp",name:"Jet2 Plc",hadOpportunity:!0},{id:"001Wj00000xyIeR",name:"KION Group",hadOpportunity:!1},{id:"001Wj00000tWwXb",name:"Keywords Studios",hadOpportunity:!1},{id:"001Wj00000xxdOO",name:"Kingfisher",hadOpportunity:!1},{id:"001Wj00000xy0o1",name:"Knorr-Bremse",hadOpportunity:!1},{id:"001Wj00000xxuVi",name:"L'Oreal",hadOpportunity:!1},{id:"001Wj00000xwh4I",name:"Landesbank Baden-Wurttemberg",hadOpportunity:!1},{id:"001Wj00000au3sw",name:"Lenovo",hadOpportunity:!0},{id:"001Wj00000sobq8",name:"MOL Magyarorsz\xE1g",hadOpportunity:!1},{id:"001Wj00000xwrq3",name:"Michelin",hadOpportunity:!1},{id:"001Wj00000xz3i9",name:"Mondi Group",hadOpportunity:!1},{id:"001Wj00000xxaf3",name:"NatWest Group",hadOpportunity:!1},{id:"001Wj00000xzFJV",name:"Norddeutsche Landesbank",hadOpportunity:!1},{id:"001Hp00003kIrKm",name:"Northern Trust Management Services",hadOpportunity:!0},{id:"001Wj00000bWIxi",name:"Novo Nordisk",hadOpportunity:!1},{id:"001Wj00000TV1Wz",name:"OpenAi",hadOpportunity:!0},{id:"001Wj00000tWwYh",name:"Origin Enterprises",hadOpportunity:!1},{id:"001Wj00000xz3dJ",name:"Otto",hadOpportunity:!1},{id:"001Wj00000tWwYs",name:"Panda Waste",hadOpportunity:!1},{id:"001Wj00000tWwYJ",name:"Paysafe",hadOpportunity:!1},{id:"001Wj00000souuM",name:"Premier Foods",hadOpportunity:!1},{id:"001Wj00000xyzrT",name:"RWE",hadOpportunity:!1},{id:"001Wj00000u0eJp",name:"Re-Turn",hadOpportunity:!0},{id:"001Wj00000xyAdg",name:"SGAM La Mondiale",hadOpportunity:!1},{id:"001Wj00000sg2T0",name:"SHEIN",hadOpportunity:!0},{id:"001Wj00000hfaEC",name:"Safran",hadOpportunity:!1},{id:"001Wj00000sonmQ",name:"Sandoz",hadOpportunity:!1},{id:"001Wj00000xz9ik",name:"Savencia",hadOpportunity:!1},{id:"001Wj00000xyGKs",name:"Sodexo",hadOpportunity:!1},{id:"001Wj00000c9oD6",name:"Stripe",hadOpportunity:!0},{id:"001Hp00003kKrS0",name:"Sword Health",hadOpportunity:!0},{id:"001Wj00000soZus",name:"Tate & Lyle",hadOpportunity:!1},{id:"001Wj00000mEEkG",name:"Team Car Care dba Jiffy Lube",hadOpportunity:!0},{id:"001Hp00003kIrN0",name:"Teleperformance",hadOpportunity:!1},{id:"001Wj00000vzG8f",name:"Temu",hadOpportunity:!1},{id:"001Wj00000xy9fz",name:"Tennet Holding",hadOpportunity:!1},{id:"001Wj00000tWwXf",name:"The Est\xE9e Lauder Companies Inc.",hadOpportunity:!1},{id:"001Wj00000Y6DDc",name:"The HEINEKEN Company",hadOpportunity:!1},{id:"001Wj00000tWwYV",name:"The Irish Stock Exchange",hadOpportunity:!1},{id:"001Wj00000xxp7o",name:"Thuga Holding",hadOpportunity:!1},{id:"001Wj00000xyBgC",name:"ThyssenKrupp",hadOpportunity:!1},{id:"001Wj00000tWwYW",name:"Total Produce plc",hadOpportunity:!1},{id:"001Wj00000xxxLU",name:"TotalEnergies",hadOpportunity:!1},{id:"001Wj00000mIBpN",name:"Transworld Business Advisors",hadOpportunity:!0},{id:"001Wj00000mCFs1",name:"Twitter",hadOpportunity:!0},{id:"001Wj00000xV8Vg",name:"UNHCR, the UN Refugee Agency",hadOpportunity:!0},{id:"001Wj00000xxo5I",name:"United Internet",hadOpportunity:!1},{id:"001Wj00000bWIzw",name:"Veolia | Water Tech",hadOpportunity:!1},{id:"001Hp00003kIrDA",name:"Verizon",hadOpportunity:!0},{id:"001Wj00000tWwXd",name:"Virgin Media Ireland Limited",hadOpportunity:!1},{id:"001Wj00000sgaj9",name:"Volkswagon",hadOpportunity:!0},{id:"001Wj00000ZDTG9",name:"Waystone",hadOpportunity:!0},{id:"001Wj00000pB5DX",name:"White Swan Data",hadOpportunity:!0},{id:"001Wj00000xwL2A",name:"Wm. Morrison Supermarkets",hadOpportunity:!1},{id:"001Wj00000mIB6E",name:"Zendesk",hadOpportunity:!0},{id:"001Wj00000S4r49",name:"Zoom",hadOpportunity:!0}]},"olivia.jung@eudia.com":{email:"olivia.jung@eudia.com",name:"Olivia Jung",accounts:[{id:"001Hp00003kIrED",name:"3M",hadOpportunity:!1},{id:"001Hp00003kIrEK",name:"ADP",hadOpportunity:!1},{id:"001Hp00003kIrEO",name:"AES",hadOpportunity:!0},{id:"001Hp00003kIrEG",name:"AbbVie",hadOpportunity:!1},{id:"001Wj00000mCFrd",name:"Airship Group Inc",hadOpportunity:!0},{id:"001Hp00003kIrET",name:"Albemarle",hadOpportunity:!1},{id:"001Hp00003kIrEZ",name:"Ally Financial",hadOpportunity:!1},{id:"001Hp00003kIrEc",name:"Altria Group",hadOpportunity:!1},{id:"001Hp00003kIrEf",name:"Ameren",hadOpportunity:!1},{id:"001Hp00003kIrEi",name:"American Family Insurance Group",hadOpportunity:!1},{id:"001Wj00000YIOI1",name:"Aptiv",hadOpportunity:!0},{id:"001Hp00003kIrFA",name:"Astellas",hadOpportunity:!0},{id:"001Hp00003kIrFD",name:"Autoliv",hadOpportunity:!1},{id:"001Hp00003kIrDJ",name:"Avery Dennison",hadOpportunity:!1},{id:"001Hp00003kIrDG",name:"Bain",hadOpportunity:!0},{id:"001Hp00003kIrFL",name:"Bank of America",hadOpportunity:!0},{id:"001Hp00003kIrFN",name:"Bath & Body Works",hadOpportunity:!1},{id:"001Hp00003kIrFQ",name:"Becton Dickinson",hadOpportunity:!1},{id:"001Hp00003kIrFV",name:"Best Buy",hadOpportunity:!0},{id:"001Hp00003kIrDY",name:"Blackstone",hadOpportunity:!0},{id:"001Hp00003kIrFb",name:"Boeing",hadOpportunity:!0},{id:"001Hp00003kIrFf",name:"BorgWarner",hadOpportunity:!1},{id:"001Hp00003kIrFk",name:"Bristol-Myers Squibb",hadOpportunity:!0},{id:"001Hp00003kIrFo",name:"Burlington Stores",hadOpportunity:!1},{id:"001Wj00000Y6VLn",name:"CHANEL",hadOpportunity:!1},{id:"001Hp00003kIrGK",name:"CHS",hadOpportunity:!0},{id:"001Hp00003kJ9kw",name:"CSL",hadOpportunity:!0},{id:"001Hp00003kIrGq",name:"CVS Health",hadOpportunity:!1},{id:"001Hp00003kIrG7",name:"Cencora (formerly AmerisourceBergen)",hadOpportunity:!1},{id:"001Hp00003kIrGE",name:"Charter Communications",hadOpportunity:!0},{id:"001Hp00003kIrDZ",name:"Ciena",hadOpportunity:!0},{id:"001Hp00003kIrGL",name:"Cintas",hadOpportunity:!1},{id:"001Wj00000c6df9",name:"Clear",hadOpportunity:!0},{id:"001Wj00000eLOI4",name:"Cleveland Clinic",hadOpportunity:!1},{id:"001Hp00003kIrGO",name:"Cleveland-Cliffs",hadOpportunity:!1},{id:"001Hp00003kIrGQ",name:"Coca-Cola",hadOpportunity:!1},{id:"001Hp00003kIrGX",name:"Conagra Brands",hadOpportunity:!1},{id:"001Hp00003kIrGZ",name:"Consolidated Edison",hadOpportunity:!0},{id:"001Wj00000jK5Hl",name:"Crate & Barrel",hadOpportunity:!0},{id:"001Hp00003kIrGo",name:"Cummins",hadOpportunity:!0},{id:"001Hp00003kIrGu",name:"Danaher",hadOpportunity:!1},{id:"001Wj00000bzz9R",name:"Datadog",hadOpportunity:!0},{id:"001Wj00000aZvt9",name:"Dolby",hadOpportunity:!0},{id:"001Hp00003kIrHB",name:"Dominion Energy",hadOpportunity:!1},{id:"001Hp00003kIrHE",name:"Dow",hadOpportunity:!1},{id:"001Hp00003kIrHH",name:"Duke Energy",hadOpportunity:!1},{id:"001Wj00000hkk0j",name:"Etsy",hadOpportunity:!0},{id:"001Hp00003kIrI7",name:"Ford",hadOpportunity:!1},{id:"001Hp00003kIrIL",name:"General Dynamics",hadOpportunity:!1},{id:"001Wj00000ScUQ3",name:"General Electric",hadOpportunity:!1},{id:"001Hp00003kIrIN",name:"General Motors",hadOpportunity:!1},{id:"001Hp00003kIrIS",name:"Gilead Sciences",hadOpportunity:!0},{id:"001Hp00003kIrE8",name:"Graybar Electric",hadOpportunity:!0},{id:"001Hp00003kIrDO",name:"Guardian Life Ins",hadOpportunity:!0},{id:"001Wj00000dvgdb",name:"HealthEquity",hadOpportunity:!0},{id:"001Hp00003kIrJ9",name:"Intuit",hadOpportunity:!0},{id:"001Wj00000aLlyV",name:"J.Crew",hadOpportunity:!0},{id:"001Hp00003kKKMc",name:"JPmorganchase",hadOpportunity:!0},{id:"001Hp00003kIrJI",name:"John Deere",hadOpportunity:!1},{id:"001Hp00003kIrDQ",name:"Jones Lang LaSalle",hadOpportunity:!0},{id:"001Wj00000hfaE1",name:"Lowe",hadOpportunity:!1},{id:"001Hp00003kIrDj",name:"Marsh McLennan",hadOpportunity:!0},{id:"001Hp00003kIrEA",name:"Mastercard",hadOpportunity:!0},{id:"001Wj00000QBapC",name:"Mayo Clinic",hadOpportunity:!1},{id:"001Hp00003kIrD7",name:"McDonald's",hadOpportunity:!1},{id:"001Hp00003kIrD8",name:"Medtronic",hadOpportunity:!0},{id:"001Hp00003kIrKK",name:"Merck",hadOpportunity:!0},{id:"001Hp00003kJ9lG",name:"Meta",hadOpportunity:!0},{id:"001Hp00003kIrKS",name:"Mondelez International",hadOpportunity:!0},{id:"001Hp00003kIrKU",name:"Motorola Solutions",hadOpportunity:!0},{id:"001Wj00000Y6VYj",name:"NBCUniversal",hadOpportunity:!1},{id:"001Wj00000j3QN2",name:"Nasdaq Private Market",hadOpportunity:!1},{id:"001Hp00003kIrCq",name:"Nationwide Insurance",hadOpportunity:!1},{id:"001Wj00000Y6VML",name:"Nestle",hadOpportunity:!1},{id:"001Hp00003kIrLF",name:"Paramount",hadOpportunity:!1},{id:"001Hp00003kIrLO",name:"Pfizer",hadOpportunity:!0},{id:"001Wj00000wzgaP",name:"Philip Morris International",hadOpportunity:!1},{id:"001Hp00003kIrLa",name:"Prudential",hadOpportunity:!1},{id:"001Hp00003kIrLp",name:"Raytheon Technologies",hadOpportunity:!1},{id:"001Hp00003kIrDz",name:"Shopify",hadOpportunity:!0},{id:"001Wj00000eLWPF",name:"Stellantis",hadOpportunity:!1},{id:"001Wj00000iS9AJ",name:"TE Connectivity",hadOpportunity:!0},{id:"001Hp00003kIrMx",name:"Target",hadOpportunity:!1},{id:"001Wj00000PjGDa",name:"The Weir Group PLC",hadOpportunity:!0},{id:"001Hp00003kIrDF",name:"Thermo Fisher Scientific",hadOpportunity:!0},{id:"001Hp00003kIrCw",name:"Toshiba US",hadOpportunity:!0},{id:"001Hp00003kIrNb",name:"Unisys",hadOpportunity:!0},{id:"001Hp00003kIrO7",name:"Wells Fargo",hadOpportunity:!0},{id:"001Wj00000kD7MA",name:"Wellspan Health",hadOpportunity:!0},{id:"001Hp00003kIrOA",name:"Western Digital",hadOpportunity:!0},{id:"001Wj00000kD3s1",name:"White Cap",hadOpportunity:!0}]},"rajeev.patel@eudia.com":{email:"rajeev.patel@eudia.com",name:"Rajeev Patel",accounts:[{id:"001Wj00000fFW35",name:"Alnylam Pharmaceuticals",hadOpportunity:!0},{id:"001Wj00000woNmQ",name:"Beiersdorf",hadOpportunity:!1},{id:"001Wj00000vCOx2",name:"Cambridge Associates",hadOpportunity:!1},{id:"001Wj00000wE56T",name:"Care Vet Health",hadOpportunity:!1},{id:"001Wj00000dIjyB",name:"CareVet, LLC",hadOpportunity:!1},{id:"001Wj00000xZEkY",name:"Modern Treasury",hadOpportunity:!1},{id:"001Wj00000vv2vX",name:"Nextdoor",hadOpportunity:!1}]},"riley.stack@eudia.com":{email:"riley.stack@eudia.com",name:"Riley Stack",accounts:[{id:"001Wj00000XiEDy",name:"Coinbase",hadOpportunity:!0},{id:"001Wj00000YEMa8",name:"Turing",hadOpportunity:!0}]},"sean.boyd@eudia.com":{email:"sean.boyd@eudia.com",name:"Sean Boyd",accounts:[{id:"001Hp00003kIrE9",name:"IQVIA",hadOpportunity:!0}]},"tom.clancy@eudia.com":{email:"tom.clancy@eudia.com",name:"Tom Clancy",accounts:[{id:"001Wj00000pB30V",name:"AIR (Advanced Inhalation Rituals)",hadOpportunity:!0},{id:"001Wj00000qLRqW",name:"ASML",hadOpportunity:!0},{id:"001Wj00000xyA0y",name:"Aegon",hadOpportunity:!1},{id:"001Wj00000xxpcR",name:"Air France-KLM Group",hadOpportunity:!1},{id:"001Wj00000xyIg2",name:"Akzo Nobel",hadOpportunity:!1},{id:"001Wj00000qFynV",name:"Alexion Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000xwuUW",name:"Alstom",hadOpportunity:!1},{id:"001Wj00000xxtL6",name:"Anglo American",hadOpportunity:!1},{id:"001Wj00000syHJt",name:"Aryzta",hadOpportunity:!1},{id:"001Wj00000tWwXq",name:"BAM Ireland",hadOpportunity:!1},{id:"001Wj00000c9oCe",name:"BLDG Management Co., Inc.",hadOpportunity:!0},{id:"001Wj00000hfWN1",name:"Balfour Beatty US",hadOpportunity:!1},{id:"001Wj00000fFuFM",name:"Bank of Ireland",hadOpportunity:!0},{id:"001Wj00000xy23Q",name:"Bayerische Landesbank",hadOpportunity:!1},{id:"001Wj00000tWwXt",name:"Boots",hadOpportunity:!1},{id:"001Wj00000xyIOL",name:"Ceconomy",hadOpportunity:!1},{id:"001Wj00000tWwXx",name:"Chanelle Pharma",hadOpportunity:!1},{id:"001Hp00003kIrD3",name:"Cisco Systems",hadOpportunity:!0},{id:"001Wj00000xyqxq",name:"Computacenter",hadOpportunity:!1},{id:"001Wj00000xy0ss",name:"Constellium",hadOpportunity:!1},{id:"001Wj00000Y6Vk0",name:"Credit Agricole CIB",hadOpportunity:!1},{id:"001Wj00000xwf7G",name:"Daimler Truck Holding",hadOpportunity:!1},{id:"001Wj00000xyaWU",name:"Delivery Hero",hadOpportunity:!1},{id:"001Wj00000mCFsz",name:"Electricity Supply Board",hadOpportunity:!0},{id:"001Wj00000sp0Bl",name:"Ensco PLC",hadOpportunity:!1},{id:"001Wj00000xz374",name:"EssilorLuxottica",hadOpportunity:!1},{id:"001Wj00000hfaDT",name:"Experian",hadOpportunity:!1},{id:"001Wj00000tWwY6",name:"Fineos",hadOpportunity:!1},{id:"001Wj00000mCFsd",name:"Fujitsu",hadOpportunity:!1},{id:"001Wj00000mCFrc",name:"Glanbia",hadOpportunity:!0},{id:"001Wj00000mHuzr",name:"IHRB",hadOpportunity:!1},{id:"001Wj00000xy9Ho",name:"Imperial Brands",hadOpportunity:!1},{id:"001Wj00000sp1nl",name:"Ina Groupa",hadOpportunity:!1},{id:"001Wj00000xz3ev",name:"Infineon",hadOpportunity:!1},{id:"001Wj00000xyMzn",name:"JDE Peet's",hadOpportunity:!1},{id:"001Wj00000hfWN2",name:"Jazz Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000soxsD",name:"Jazz Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000xxtcq",name:"John Lewis Partnership",hadOpportunity:!1},{id:"001Wj00000tWwYo",name:"Just Eat",hadOpportunity:!1},{id:"001Wj00000xz3jl",name:"KfW Group",hadOpportunity:!1},{id:"001Wj00000tWwYD",name:"Ladbrokes",hadOpportunity:!1},{id:"001Wj00000xystC",name:"Lanxess Group",hadOpportunity:!1},{id:"001Wj00000vRNFu",name:"Legal & General",hadOpportunity:!1},{id:"001Wj00000xxgZC",name:"Legrand",hadOpportunity:!1},{id:"001Wj00000Y64qm",name:"Louis Dreyfus Company",hadOpportunity:!1},{id:"001Wj00000xyGRQ",name:"Lufthansa Group",hadOpportunity:!1},{id:"001Wj00000pA6d7",name:"Masdar Future Energy Company",hadOpportunity:!0},{id:"001Wj00000xz0xC",name:"Metro",hadOpportunity:!1},{id:"001Wj00000xzAen",name:"Motability Operations Group",hadOpportunity:!1},{id:"001Wj00000mCFrv",name:"Ornua",hadOpportunity:!1},{id:"001Hp00003kIrLK",name:"Pepsi",hadOpportunity:!1},{id:"001Wj00000qFudS",name:"Pluralsight",hadOpportunity:!1},{id:"001Wj00000xyODc",name:"Puma",hadOpportunity:!1},{id:"001Wj00000iC14Z",name:"RELX",hadOpportunity:!1},{id:"001Wj00000tWwYj",name:"Rabobank",hadOpportunity:!1},{id:"001Wj00000xyU9M",name:"Reckitt Benckiser",hadOpportunity:!1},{id:"001Wj00000xz3bh",name:"Rentokil Initial",hadOpportunity:!1},{id:"001Wj00000sp1hL",name:"SBM Offshore",hadOpportunity:!1},{id:"001Wj00000xybkK",name:"SHV Holdings",hadOpportunity:!1},{id:"001Wj00000xz3gX",name:"SNCF Group",hadOpportunity:!1},{id:"001Wj00000tWwYt",name:"Sage",hadOpportunity:!1},{id:"001Wj00000sGEuO",name:"Sanofi",hadOpportunity:!1},{id:"001Wj00000qL7AG",name:"Seismic",hadOpportunity:!0},{id:"001Wj00000soyhp",name:"Stada Group",hadOpportunity:!1},{id:"001Wj00000xytSg",name:"Standard Chartered",hadOpportunity:!1},{id:"001Wj00000tWwYq",name:"Symantec",hadOpportunity:!1},{id:"001Wj00000pAPW2",name:"Tarmac",hadOpportunity:!0},{id:"001Wj00000xxvA1",name:"Technip Energies",hadOpportunity:!1},{id:"001Wj00000tWwYU",name:"Tegral Building Products",hadOpportunity:!1},{id:"001Wj00000fFuFq",name:"The Boots Group",hadOpportunity:!1},{id:"001Wj00000tWwYk",name:"Three",hadOpportunity:!1},{id:"001Wj00000xy5HP",name:"Trane Technologies",hadOpportunity:!1},{id:"001Wj00000sohCP",name:"Trans Ocean",hadOpportunity:!1},{id:"001Wj00000mCFtO",name:"Uisce Eireann (Irish Water)",hadOpportunity:!0},{id:"001Wj00000xyQ5k",name:"Uniper",hadOpportunity:!1},{id:"001Wj00000xz1GY",name:"Valeo",hadOpportunity:!1},{id:"001Wj00000pBibT",name:"Version1",hadOpportunity:!0},{id:"001Wj00000xy2BT",name:"Vivendi",hadOpportunity:!1},{id:"001Wj00000xyulK",name:"Wacker Chemie",hadOpportunity:!1},{id:"001Wj00000tWwYZ",name:"Wyeth Nutritionals Ireland",hadOpportunity:!1},{id:"001Wj00000mI9qo",name:"XACT Data Discovery",hadOpportunity:!0},{id:"001Wj00000xyq3P",name:"ZF Friedrichshafen",hadOpportunity:!1}]}}},R=class{constructor(s){this.cachedData=null;this.serverUrl=s}async getAccountsForUser(s){return(await this.getAccountsWithProspects(s)).accounts}async getAccountsWithProspects(s){let e=s.toLowerCase().trim(),t=await this.fetchFromServerWithProspects(e);if(t&&(t.accounts.length>0||t.prospects.length>0))return console.log(`[AccountOwnership] Got ${t.accounts.length} active + ${t.prospects.length} prospects from server for ${e}`),t;console.log(`[AccountOwnership] Using static data fallback for ${e}`);let n=this.getAccountsFromStatic(e),r=n.filter(a=>a.hadOpportunity!==!1),i=n.filter(a=>a.hadOpportunity===!1);return{accounts:r,prospects:i}}getAccountsFromStatic(s){if(Pe(s)==="sales_leader"){let i=De(s);if(i.length===0)return console.log(`[AccountOwnership] No direct reports found for sales leader: ${s}`),[];let a=new Map;for(let c of i){let l=N.businessLeads[c];if(l)for(let d of l.accounts)a.has(d.id)||a.set(d.id,{...d,isOwned:!1})}let o=Array.from(a.values()).sort((c,l)=>c.name.localeCompare(l.name));return console.log(`[AccountOwnership] Found ${o.length} static accounts for sales leader ${s} (from ${i.length} direct reports)`),o}let t=N.businessLeads[s],n=t?t.accounts.map(i=>({...i,isOwned:!0})):[],r=$e[s];if(r){let i=ue(r),a=new Set(n.map(c=>c.id));for(let c of i){let l=N.businessLeads[c];if(l)for(let d of l.accounts)a.has(d.id)||(n.push({...d,isOwned:!1}),a.add(d.id))}let o=n.sort((c,l)=>c.name.localeCompare(l.name));return console.log(`[AccountOwnership] Pod-view user ${s} (${r}): ${o.length} static accounts (${t?.accounts.length||0} owned + region)`),o}return t?(console.log(`[AccountOwnership] Found ${t.accounts.length} static accounts for ${s} (own accounts only)`),t.accounts):(console.log(`[AccountOwnership] No static mapping found for: ${s}`),[])}async fetchFromServer(s){let e=await this.fetchFromServerWithProspects(s);return e?e.accounts:null}async fetchFromServerWithProspects(s){try{let{requestUrl:e}=await import("obsidian"),t=await e({url:`${this.serverUrl}/api/accounts/ownership/${encodeURIComponent(s)}`,method:"GET",headers:{Accept:"application/json"}});if(t.json?.success){let n=a=>({id:a.id,name:a.name,type:a.type||"Prospect",hadOpportunity:a.hadOpportunity??!0,website:a.website||void 0,industry:a.industry||void 0}),r=(t.json.accounts||[]).map(n),i=(t.json.prospectAccounts||[]).map(n);return{accounts:r,prospects:i}}return null}catch(e){return console.log("[AccountOwnership] Server fetch failed, will use static data:",e),null}}async getNewAccounts(s,e){let t=await this.getAccountsForUser(s),n=e.map(r=>r.toLowerCase().trim());return t.filter(r=>{let i=r.name.toLowerCase().trim();return!n.some(a=>a===i||a.startsWith(i)||i.startsWith(a))})}findTeamLeader(s){let e=s.toLowerCase().trim();for(let[t,n]of Object.entries(Z))if(n.includes(e))return t;return null}hasUser(s){return s.toLowerCase().trim()in N.businessLeads}getAllBusinessLeads(){return Object.keys(N.businessLeads)}getBusinessLead(s){let e=s.toLowerCase().trim();return N.businessLeads[e]||null}getDataVersion(){return N.version}async getAllAccountsForAdmin(s){let e=s.toLowerCase().trim();if(!D(e))return console.log(`[AccountOwnership] ${e} is not an admin, returning owned accounts only`),this.getAccountsForUser(e);let t=await this.fetchAllAccountsFromServer();if(t&&t.length>0){let n=await this.getAccountsForUser(e),r=new Set(n.map(i=>i.id));return t.map(i=>({...i,isOwned:r.has(i.id)}))}return console.log("[AccountOwnership] Using static data fallback for admin all-accounts"),this.getAllAccountsFromStatic(e)}getAllAccountsFromStatic(s){let e=new Map,t=new Set,n=N.businessLeads[s];if(n)for(let r of n.accounts)t.add(r.id),e.set(r.id,{...r,isOwned:!0});for(let r of Object.values(N.businessLeads))for(let i of r.accounts)e.has(i.id)||e.set(i.id,{...i,isOwned:!1});return Array.from(e.values()).sort((r,i)=>r.name.localeCompare(i.name))}async getCSAccounts(s){let e=s.toLowerCase().trim();console.log(`[AccountOwnership] Fetching CS accounts for: ${e}`);let t=3,n=3e3;for(let i=1;i<=t;i++)try{let{requestUrl:a,Notice:o}=await import("obsidian");console.log(`[AccountOwnership] CS fetch attempt ${i}/${t} for ${e}`);let c=await a({url:`${this.serverUrl}/api/bl-accounts/${encodeURIComponent(e)}`,method:"GET",headers:{Accept:"application/json"},throw:!1});if(console.log(`[AccountOwnership] CS fetch response status: ${c.status}`),c.status===200&&c.json?.success){let l=(c.json.accounts||[]).map(m=>({id:m.id,name:m.name,type:m.customerType||m.type||"Customer",isOwned:!1,hadOpportunity:!0,website:m.website||null,industry:m.industry||null,ownerName:m.ownerName||null,csmName:m.csmName||null})),d=(c.json.prospectAccounts||[]).map(m=>({id:m.id,name:m.name,type:m.customerType||m.type||"Prospect",isOwned:!1,hadOpportunity:!1,website:m.website||null,industry:m.industry||null,ownerName:m.ownerName||null,csmName:m.csmName||null}));if(l.length>0)return console.log(`[AccountOwnership] CS accounts for ${e}: ${l.length} active + ${d.length} prospects`),new o(`Found ${l.length} CS accounts`),{accounts:l,prospects:d};if(console.warn(`[AccountOwnership] CS fetch attempt ${i}: server returned success but 0 accounts (Salesforce not ready)`),i<t){console.log(`[AccountOwnership] Retrying in ${n}ms...`),await new Promise(m=>setTimeout(m,n));continue}}else console.warn(`[AccountOwnership] CS fetch attempt ${i} returned status ${c.status} for ${e}`),i<t&&(console.log(`[AccountOwnership] Retrying in ${n}ms...`),await new Promise(l=>setTimeout(l,n)))}catch(a){console.error(`[AccountOwnership] CS account fetch attempt ${i} failed for ${e}:`,a),i<t&&(console.log(`[AccountOwnership] Retrying in ${n}ms after error...`),await new Promise(o=>setTimeout(o,n)))}console.warn(`[AccountOwnership] Server returned no CS accounts after ${t} attempts. Using static fallback (${I.length} accounts).`);let{Notice:r}=await import("obsidian");return new r(`Loading ${I.length} CS accounts (server warming up)`),{accounts:[...I],prospects:[]}}async fetchAllAccountsFromServer(){try{let{requestUrl:s}=await import("obsidian"),e=await s({url:`${this.serverUrl}/api/accounts/all`,method:"GET",headers:{Accept:"application/json"}});return e.json?.success&&e.json?.accounts?e.json.accounts.map(t=>({id:t.id,name:t.name,type:t.type||"Prospect"})):null}catch(s){return console.log("[AccountOwnership] Server fetch all accounts failed:",s),null}}};var me=[{value:"America/New_York",label:"Eastern Time (ET)"},{value:"America/Chicago",label:"Central Time (CT)"},{value:"America/Denver",label:"Mountain Time (MT)"},{value:"America/Los_Angeles",label:"Pacific Time (PT)"},{value:"Europe/London",label:"London (GMT/BST)"},{value:"Europe/Dublin",label:"Dublin (GMT/IST)"},{value:"Europe/Paris",label:"Central Europe (CET)"},{value:"Europe/Berlin",label:"Berlin (CET)"},{value:"UTC",label:"UTC"}],Me={serverUrl:"https://gtm-wizard.onrender.com",accountsFolder:"Accounts",recordingsFolder:"Recordings",syncOnStartup:!0,autoSyncAfterTranscription:!0,saveAudioFiles:!0,appendTranscript:!0,lastSyncTime:null,cachedAccounts:[],enableSmartTags:!0,showCalendarView:!0,userEmail:"",setupCompleted:!1,calendarConfigured:!1,salesforceConnected:!1,accountsImported:!1,importedAccountCount:0,timezone:"America/New_York",lastAccountRefreshDate:null,archiveRemovedAccounts:!0,syncAccountsOnStartup:!0,sfAutoSyncEnabled:!0,sfAutoSyncIntervalMinutes:15};var G="eudia-calendar-view",H="eudia-setup-view",Q=class extends u.EditorSuggest{constructor(s,e){super(s),this.plugin=e}onTrigger(s,e,t){let n=e.getLine(s.line),r=e.getValue(),i=e.posToOffset(s),a=r.indexOf("---"),o=r.indexOf("---",a+3);if(a===-1||i<a||i>o)return null;let c=n.match(/^account:\s*(.*)$/);if(!c)return null;let l=c[1].trim(),d=n.indexOf(":")+1,m=n.substring(d).match(/^\s*/)?.[0].length||0;return{start:{line:s.line,ch:d+m},end:s,query:l}}getSuggestions(s){let e=s.query.toLowerCase(),t=this.plugin.settings.cachedAccounts;return e?t.filter(n=>n.name.toLowerCase().includes(e)).sort((n,r)=>{let i=n.name.toLowerCase().startsWith(e),a=r.name.toLowerCase().startsWith(e);return i&&!a?-1:a&&!i?1:n.name.localeCompare(r.name)}).slice(0,10):t.slice(0,10)}renderSuggestion(s,e){e.createEl("div",{text:s.name,cls:"suggestion-title"})}selectSuggestion(s,e){this.context&&this.context.editor.replaceRange(s.name,this.context.start,this.context.end)}},ee=class{constructor(s,e,t,n){this.containerEl=null;this.waveformBars=[];this.durationEl=null;this.waveformData=new Array(16).fill(0);this.onPause=s,this.onResume=e,this.onStop=t,this.onCancel=n}show(){if(this.containerEl)return;this.containerEl=document.createElement("div"),this.containerEl.className="eudia-transcription-bar active";let s=document.createElement("div");s.className="eudia-recording-dot",this.containerEl.appendChild(s);let e=document.createElement("div");e.className="eudia-waveform",this.waveformBars=[];for(let i=0;i<16;i++){let a=document.createElement("div");a.className="eudia-waveform-bar",a.style.height="2px",e.appendChild(a),this.waveformBars.push(a)}this.containerEl.appendChild(e),this.durationEl=document.createElement("div"),this.durationEl.className="eudia-duration",this.durationEl.textContent="0:00",this.containerEl.appendChild(this.durationEl);let t=document.createElement("div");t.className="eudia-controls-minimal";let n=document.createElement("button");n.className="eudia-control-btn stop",n.innerHTML='<span class="eudia-stop-icon"></span>',n.title="Stop and summarize",n.onclick=()=>this.onStop(),t.appendChild(n);let r=document.createElement("button");r.className="eudia-control-btn cancel",r.textContent="Cancel",r.onclick=()=>this.onCancel(),t.appendChild(r),this.containerEl.appendChild(t),document.body.appendChild(this.containerEl)}hide(){this.containerEl&&(this.containerEl.remove(),this.containerEl=null,this.waveformBars=[],this.durationEl=null)}updateState(s){if(this.containerEl){if(this.waveformData.shift(),this.waveformData.push(s.audioLevel),this.waveformBars.forEach((e,t)=>{let n=this.waveformData[t]||0,r=Math.max(2,Math.min(24,n*.24));e.style.height=`${r}px`}),this.durationEl){let e=Math.floor(s.duration/60),t=Math.floor(s.duration%60);this.durationEl.textContent=`${e}:${t.toString().padStart(2,"0")}`}this.containerEl.className=s.isPaused?"eudia-transcription-bar paused":"eudia-transcription-bar active"}}showProcessing(){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar processing";let s=document.createElement("div");s.className="eudia-processing-spinner",this.containerEl.appendChild(s);let e=document.createElement("div");e.className="eudia-processing-text",e.textContent="Processing...",this.containerEl.appendChild(e)}showComplete(s){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar complete";let e=document.createElement("div");e.className="eudia-complete-checkmark",this.containerEl.appendChild(e);let t=document.createElement("div");if(t.className="eudia-complete-content",s.summaryPreview){let o=document.createElement("div");o.className="eudia-summary-preview",o.textContent=s.summaryPreview.length>80?s.summaryPreview.substring(0,80)+"...":s.summaryPreview,t.appendChild(o)}let n=document.createElement("div");n.className="eudia-complete-stats-row";let r=Math.floor(s.duration/60),i=Math.floor(s.duration%60);n.textContent=`${r}:${i.toString().padStart(2,"0")} recorded`,s.nextStepsCount>0&&(n.textContent+=` | ${s.nextStepsCount} action${s.nextStepsCount>1?"s":""}`),s.meddiccCount>0&&(n.textContent+=` | ${s.meddiccCount} signals`),t.appendChild(n),this.containerEl.appendChild(t);let a=document.createElement("button");a.className="eudia-control-btn close",a.textContent="Dismiss",a.onclick=()=>this.hide(),this.containerEl.appendChild(a),setTimeout(()=>this.hide(),8e3)}};var te=class extends u.Modal{constructor(s,e,t){super(s),this.plugin=e,this.onSelect=t}onOpen(){let{contentEl:s}=this;s.empty(),s.addClass("eudia-account-selector"),s.createEl("h3",{text:"Select Account for Meeting Note"}),this.searchInput=s.createEl("input",{type:"text",placeholder:"Search accounts..."}),this.searchInput.style.cssText="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);",this.resultsContainer=s.createDiv({cls:"eudia-account-results"}),this.resultsContainer.style.cssText="max-height: 300px; overflow-y: auto;",this.updateResults(""),this.searchInput.addEventListener("input",()=>this.updateResults(this.searchInput.value)),this.searchInput.focus()}updateResults(s){this.resultsContainer.empty();let e=this.plugin.settings.cachedAccounts,t=s?e.filter(n=>n.name.toLowerCase().includes(s.toLowerCase())).slice(0,15):e.slice(0,15);if(t.length===0){this.resultsContainer.createDiv({cls:"eudia-no-results",text:"No accounts found"});return}t.forEach(n=>{let r=this.resultsContainer.createDiv({cls:"eudia-account-item",text:n.name});r.onclick=()=>{this.onSelect(n),this.close()}})}onClose(){this.contentEl.empty()}},J=class extends u.Modal{constructor(e,t,n){super(e);this.accountContext=null;this.plugin=t,this.accountContext=n||null}onOpen(){let{contentEl:e}=this;e.empty(),e.addClass("eudia-intelligence-modal");let t=e.createDiv({cls:"eudia-intelligence-header"});t.createEl("h2",{text:this.accountContext?`Ask about ${this.accountContext.name}`:"Ask gtm-brain"}),this.accountContext?t.createEl("p",{text:"Get insights, prep for meetings, or ask about this account.",cls:"eudia-intelligence-subtitle"}):t.createEl("p",{text:"Ask questions about your accounts, deals, or pipeline.",cls:"eudia-intelligence-subtitle"});let n=e.createDiv({cls:"eudia-intelligence-input-container"});this.queryInput=n.createEl("textarea",{placeholder:this.accountContext?`e.g., "What should I know before my next meeting?" or "What's the deal status?"`:`e.g., "Who owns Dolby?" or "What's my late stage pipeline?"`}),this.queryInput.addClass("eudia-intelligence-input"),this.queryInput.rows=3;let i=e.createDiv({cls:"eudia-intelligence-actions"}).createEl("button",{text:"Ask",cls:"eudia-btn-primary"});i.onclick=()=>this.submitQuery(),this.queryInput.onkeydown=c=>{c.key==="Enter"&&!c.shiftKey&&(c.preventDefault(),this.submitQuery())},this.responseContainer=e.createDiv({cls:"eudia-intelligence-response"}),this.responseContainer.style.display="none";let a=e.createDiv({cls:"eudia-intelligence-suggestions"});a.createEl("p",{text:"Suggested:",cls:"eudia-suggestions-label"});let o;if(this.accountContext)o=["What should I know before my next meeting?","Summarize our relationship and deal status","What are the key pain points?"];else{let l=(this.plugin.settings.cachedAccounts||[]).slice(0,3).map(d=>d.name);l.length>=2?o=[`What should I know about ${l[0]} before my next meeting?`,`What's the account history with ${l[1]}?`,"What's my late-stage pipeline?"]:o=["What should I know before my next meeting?","What accounts need attention this week?","What is my late-stage pipeline?"]}o.forEach(c=>{let l=a.createEl("button",{text:c,cls:"eudia-suggestion-btn"});l.onclick=()=>{this.queryInput.value=c,this.submitQuery()}}),setTimeout(()=>this.queryInput.focus(),100)}async submitQuery(){let e=this.queryInput.value.trim();if(!e)return;this.responseContainer.style.display="block";let t=this.accountContext?.name?` about ${this.accountContext.name}`:"";this.responseContainer.innerHTML=`<div class="eudia-intelligence-loading">Gathering intelligence${t}...</div>`;try{let n=await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/intelligence/query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:e,accountId:this.accountContext?.id,accountName:this.accountContext?.name,userEmail:this.plugin.settings.userEmail}),throw:!1,contentType:"application/json"});if(n.status>=400){let r=n.json?.error||`Server error (${n.status}). Please try again.`;this.responseContainer.innerHTML=`<div class="eudia-intelligence-error">${r}</div>`;return}if(n.json?.success){this.responseContainer.innerHTML="";let r=this.responseContainer.createDiv({cls:"eudia-intelligence-answer"});if(r.innerHTML=this.formatResponse(n.json.answer),n.json.context){let i=n.json.context,a=this.responseContainer.createDiv({cls:"eudia-intelligence-context-info"}),o=[];i.accountName&&o.push(i.accountName),i.opportunityCount>0&&o.push(`${i.opportunityCount} opps`),i.hasNotes&&o.push("notes"),i.hasCustomerBrain&&o.push("history");let c=i.dataFreshness==="cached"?" (cached)":"";a.setText(`Based on: ${o.join(" \u2022 ")}${c}`)}n.json.performance}else{let r=n.json?.error||"Could not get an answer. Try rephrasing your question.";this.responseContainer.innerHTML=`<div class="eudia-intelligence-error">${r}</div>`}}catch(n){console.error("[GTM Brain] Intelligence query error:",n);let r="Unable to connect. Please check your internet connection and try again.";n?.message?.includes("timeout")?r="Request timed out. The server may be busy - please try again.":(n?.message?.includes("network")||n?.message?.includes("fetch"))&&(r="Network error. Please check your connection and try again."),this.responseContainer.innerHTML=`<div class="eudia-intelligence-error">${r}</div>`}}formatResponse(e){return e.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu,"").replace(/^#{2,3}\s+(.+)$/gm,'<h3 class="eudia-intel-header">$1</h3>').replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/^[•\-]\s+(.+)$/gm,"<li>$1</li>").replace(/^-\s+\[\s*\]\s+(.+)$/gm,'<li class="eudia-intel-todo">$1</li>').replace(/^-\s+\[x\]\s+(.+)$/gm,'<li class="eudia-intel-done">$1</li>').replace(/(<li[^>]*>.*?<\/li>\s*)+/g,'<ul class="eudia-intel-list">$&</ul>').replace(/\n{2,}/g,`
`).replace(/\n/g,"<br>")}onClose(){this.contentEl.empty()}};var ne=class extends u.ItemView{constructor(e,t){super(e);this.emailInput=null;this.pollInterval=null;this.plugin=t,this.accountOwnershipService=new R(t.settings.serverUrl),this.steps=[{id:"calendar",title:"Connect Your Calendar",description:"View your meetings and create notes with one click",status:"pending"},{id:"salesforce",title:"Connect to Salesforce",description:"Sync notes and access your accounts",status:"pending"},{id:"transcribe",title:"Ready to Transcribe",description:"Record and summarize meetings automatically",status:"pending"}]}getViewType(){return H}getDisplayText(){return"Setup"}getIcon(){return"settings"}async onOpen(){await this.checkExistingStatus(),await this.render()}async onClose(){this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null)}async checkExistingStatus(){if(this.plugin.settings.userEmail){this.steps[0].status="complete";try{(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0&&(this.steps[1].status="complete",this.plugin.settings.salesforceConnected=!0)}catch{}if(this.plugin.settings.accountsImported){this.steps[2].status="complete";try{let e=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");e&&await this.plugin.app.vault.delete(e)}catch{}}else{console.log("[Eudia Setup] Email set but accounts not imported \u2014 auto-retrying import...");let e=this.plugin.app.workspace.leftSplit,t=e?.collapsed;try{let n=this.plugin.settings.userEmail,r=D(n)?"admin":B(n)?"cs":"bl",i=[],a=[];if(console.log(`[Eudia Setup] Auto-retry for ${n} (group: ${r})`),r==="cs")i=[...I],console.log(`[Eudia Setup] Auto-retry CS: using ${i.length} static accounts`);else if(r==="admin")i=await this.accountOwnershipService.getAllAccountsForAdmin(n);else{let o=await this.accountOwnershipService.getAccountsWithProspects(n);i=o.accounts,a=o.prospects}if(i.length>0||a.length>0){if(e&&!t&&e.collapse(),r==="admin"?await this.plugin.createAdminAccountFolders(i):(await this.plugin.createTailoredAccountFolders(i,{}),a.length>0&&await this.plugin.createProspectAccountFiles(a)),_(n))try{await this.plugin.createCSManagerDashboard(n,i)}catch{}this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=i.length+a.length,await this.plugin.saveSettings(),this.steps[2].status="complete";try{let o=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");o&&await this.plugin.app.vault.delete(o)}catch{}if(e&&!t&&e.expand(),new u.Notice(`Imported ${i.length} accounts!`),console.log(`[Eudia Setup] Auto-retry imported ${i.length} accounts for ${n}`),r==="cs"){let o=n,c=[3e3,15e3,45e3,9e4],l=this.plugin.settings.accountsFolder||"Accounts",d=async m=>{let y=c[m];if(y===void 0){console.log("[Eudia] Auto-retry enrichment: all retries exhausted");return}await new Promise(p=>setTimeout(p,y));try{console.log(`[Eudia] Auto-retry enrichment attempt ${m+1}/${c.length}...`);let h=(await this.accountOwnershipService.getCSAccounts(o)).accounts.filter(g=>g.id&&g.id.startsWith("001"));if(h.length===0)return d(m+1);for(let g of h){let v=g.name.replace(/[<>:"/\\|?*]/g,"_").trim(),w=`${l}/${v}`;if(this.plugin.app.vault.getAbstractFileByPath(w))for(let C of["Contacts.md","Intelligence.md","Meeting Notes.md","Next Steps.md"]){let O=this.plugin.app.vault.getAbstractFileByPath(`${w}/${C}`);if(O&&O instanceof u.TFile)try{let b=await this.plugin.app.vault.read(O);if(b.includes("cs-static-")){let W=b.replace(/account_id:\s*cs-static-[^\n]+/,`account_id: ${g.id}`);W!==b&&await this.plugin.app.vault.modify(O,W)}}catch{}}}await this.plugin.enrichAccountFolders(h),console.log(`[Eudia] Auto-retry enrichment complete: ${h.length} accounts enriched`)}catch(p){return console.log(`[Eudia] Auto-retry enrichment attempt ${m+1} failed:`,p),d(m+1)}};d(0)}else{let o=[...i,...a];setTimeout(async()=>{try{await this.plugin.enrichAccountFolders(o)}catch{}},500)}}else console.warn(`[Eudia Setup] Auto-retry returned 0 accounts for ${n}. Server may still be starting.`),e&&!t&&e.expand()}catch(n){console.error("[Eudia Setup] Auto-retry account import failed:",n),e&&!t&&e.expand()}}}}getCompletionPercentage(){let e=this.steps.filter(t=>t.status==="complete").length;return Math.round(e/this.steps.length*100)}async render(){let e=this.containerEl.children[1];e.empty(),e.addClass("eudia-setup-view"),this.renderHeader(e),this.renderSteps(e),this.renderFooter(e)}renderHeader(e){let t=e.createDiv({cls:"eudia-setup-header"}),n=t.createDiv({cls:"eudia-setup-title-section"});n.createEl("h1",{text:"Welcome to Eudia Sales Vault",cls:"eudia-setup-main-title"}),n.createEl("p",{text:"Complete these steps to transcribe and summarize meetings -- capturing objections, next steps, and pain points to drive better client outcomes and smarter selling.",cls:"eudia-setup-subtitle"});let r=t.createDiv({cls:"eudia-setup-progress-section"}),i=this.getCompletionPercentage(),a=r.createDiv({cls:"eudia-setup-progress-label"});a.createSpan({text:"Setup Progress"}),a.createSpan({text:`${i}%`,cls:"eudia-setup-progress-value"});let c=r.createDiv({cls:"eudia-setup-progress-bar"}).createDiv({cls:"eudia-setup-progress-fill"});c.style.width=`${i}%`}renderSteps(e){let t=e.createDiv({cls:"eudia-setup-steps-container"});this.renderCalendarStep(t),this.renderSalesforceStep(t),this.renderTranscribeStep(t)}renderCalendarStep(e){let t=this.steps[0],n=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),r=n.createDiv({cls:"eudia-setup-step-header"}),i=r.createDiv({cls:"eudia-setup-step-number"});i.setText(t.status==="complete"?"":"1"),t.status==="complete"&&i.addClass("eudia-step-complete");let a=r.createDiv({cls:"eudia-setup-step-info"});a.createEl("h3",{text:t.title}),a.createEl("p",{text:t.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(t.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:`Connected as ${this.plugin.settings.userEmail}`});else{let c=o.createDiv({cls:"eudia-setup-input-group"});this.emailInput=c.createEl("input",{type:"email",placeholder:"yourname@eudia.com",cls:"eudia-setup-input"}),this.plugin.settings.userEmail&&(this.emailInput.value=this.plugin.settings.userEmail);let l=c.createEl("button",{text:"Connect",cls:"eudia-setup-btn primary"});l.onclick=async()=>{await this.handleCalendarConnect()},this.emailInput.onkeydown=async d=>{d.key==="Enter"&&await this.handleCalendarConnect()},o.createDiv({cls:"eudia-setup-validation-message"}),o.createEl("p",{cls:"eudia-setup-help-text",text:"Your calendar syncs automatically via Microsoft 365. We use your email to identify your meetings."})}}async handleCalendarConnect(){if(!this.emailInput)return;let e=this.emailInput.value.trim().toLowerCase(),t=this.containerEl.querySelector(".eudia-setup-validation-message");if(!e){t&&(t.textContent="Please enter your email",t.className="eudia-setup-validation-message error");return}if(!e.endsWith("@eudia.com")){t&&(t.textContent="Please use your @eudia.com email address",t.className="eudia-setup-validation-message error");return}t&&(t.textContent="Validating...",t.className="eudia-setup-validation-message loading");try{let n=await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${encodeURIComponent(e)}`,method:"GET",throw:!1});if(n.status===200&&n.json?.authorized){this.plugin.settings.userEmail=e,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),this.steps[0].status="complete",new u.Notice("Calendar connected successfully!"),t&&(t.textContent="Importing your accounts...",t.className="eudia-setup-validation-message loading");let r=this.plugin.app.workspace.leftSplit,i=r?.collapsed;r&&!i&&r.collapse();try{let a,o=[],c=D(e)?"admin":B(e)?"cs":"bl";if(console.log(`[Eudia] User group detected: ${c} for ${e}`),c==="cs"){if(console.log(`[Eudia] CS user detected \u2014 loading ${I.length} accounts from static data (instant, no server needed)`),a=[...I],o=[],t&&(t.textContent=`Loading ${a.length} Customer Success accounts...`),await this.plugin.createTailoredAccountFolders(a,{}),_(e))try{await this.plugin.createCSManagerDashboard(e,a)}catch(p){console.error("[Eudia] CS Manager dashboard creation failed (non-blocking):",p)}this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=a.length,await this.plugin.saveSettings();try{let p=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");p&&await this.plugin.app.vault.delete(p)}catch{}new u.Notice(`Loaded ${a.length} CS accounts successfully!`),console.log(`[Eudia] CS accounts created: ${a.length} folders from static data`);let l=e,d=[3e3,15e3,45e3,9e4],m=this.plugin.settings.accountsFolder||"Accounts",y=async p=>{let h=d[p];if(h===void 0){console.log("[Eudia] Background enrichment: all retries exhausted");return}await new Promise(g=>setTimeout(g,h));try{console.log(`[Eudia] Background enrichment attempt ${p+1}/${d.length}...`);let v=(await this.accountOwnershipService.getCSAccounts(l)).accounts.filter(w=>w.id&&w.id.startsWith("001"));if(v.length===0)return console.log("[Eudia] Background: server returned 0 accounts with real SF IDs, retrying..."),y(p+1);console.log(`[Eudia] Background: ${v.length} accounts with real SF IDs \u2014 updating folder metadata & enriching...`);for(let w of v){let C=w.name.replace(/[<>:"/\\|?*]/g,"_").trim(),O=`${m}/${C}`;if(this.plugin.app.vault.getAbstractFileByPath(O))for(let W of["Contacts.md","Intelligence.md","Meeting Notes.md","Next Steps.md"]){let j=`${O}/${W}`,E=this.plugin.app.vault.getAbstractFileByPath(j);if(E&&E instanceof u.TFile)try{let T=await this.plugin.app.vault.read(E);if(T.includes("cs-static-")){let M=T.replace(/account_id:\s*cs-static-[^\n]+/,`account_id: ${w.id}`);M!==T&&await this.plugin.app.vault.modify(E,M)}}catch{}}}await this.plugin.enrichAccountFolders(v),console.log(`[Eudia] Background enrichment complete: ${v.length} accounts enriched`)}catch(g){return console.log(`[Eudia] Background enrichment attempt ${p+1} failed:`,g),y(p+1)}};y(0)}else if(c==="admin"){if(console.log("[Eudia] Admin user detected - importing all accounts"),a=await this.accountOwnershipService.getAllAccountsForAdmin(e),a.length>0){t&&(t.textContent=`Creating ${a.length} account folders...`),await this.plugin.createAdminAccountFolders(a),this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=a.length,await this.plugin.saveSettings();try{let l=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");l&&await this.plugin.app.vault.delete(l)}catch{}new u.Notice(`Imported ${a.length} accounts!`)}}else{let l=await this.accountOwnershipService.getAccountsWithProspects(e);if(a=l.accounts,o=l.prospects,a.length>0||o.length>0){t&&(t.textContent=`Creating ${a.length} account folders...`),await this.plugin.createTailoredAccountFolders(a,{}),o.length>0&&await this.plugin.createProspectAccountFiles(o),this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=a.length+o.length,await this.plugin.saveSettings();try{let m=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");m&&await this.plugin.app.vault.delete(m)}catch{}new u.Notice(`Imported ${a.length} active accounts + ${o.length} prospects!`);let d=[...a,...o];setTimeout(async()=>{try{await this.plugin.enrichAccountFolders(d)}catch(m){console.log("[Eudia] Background enrichment skipped:",m)}},500)}else console.warn(`[Eudia] No accounts returned for ${e} (userGroup: ${c})`),t&&(t.textContent=`No accounts found for ${e}. The server may still be starting \u2014 try again in 30 seconds.`,t.className="eudia-setup-validation-message warning"),new u.Notice("No accounts found. Server may be cold-starting \u2014 please try again shortly.")}}catch(a){console.error("[Eudia] Account import failed:",a),t&&(t.textContent="Account import failed. Please try again.",t.className="eudia-setup-validation-message error"),new u.Notice("Account import failed \u2014 please try again.")}finally{r&&!i&&r.expand()}await this.render()}else t&&(t.innerHTML=`<strong>${e}</strong> is not authorized for calendar access. Contact your admin.`,t.className="eudia-setup-validation-message error")}catch{t&&(t.textContent="Connection failed. Please try again.",t.className="eudia-setup-validation-message error")}}renderSalesforceStep(e){let t=this.steps[1],n=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),r=n.createDiv({cls:"eudia-setup-step-header"}),i=r.createDiv({cls:"eudia-setup-step-number"});i.setText(t.status==="complete"?"":"2"),t.status==="complete"&&i.addClass("eudia-step-complete");let a=r.createDiv({cls:"eudia-setup-step-info"});a.createEl("h3",{text:t.title}),a.createEl("p",{text:t.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(!this.plugin.settings.userEmail){o.createDiv({cls:"eudia-setup-disabled-message",text:"Complete the calendar step first"});return}if(t.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:"Salesforce connected successfully"}),this.plugin.settings.accountsImported&&o.createDiv({cls:"eudia-setup-account-status",text:`${this.plugin.settings.importedAccountCount} accounts imported`});else{let l=o.createDiv({cls:"eudia-setup-button-group"}).createEl("button",{text:"Connect to Salesforce",cls:"eudia-setup-btn primary"}),d=o.createDiv({cls:"eudia-setup-sf-status"});l.onclick=async()=>{let m=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(m,"_blank"),d.textContent="Complete the login in the popup window...",d.className="eudia-setup-sf-status loading",new u.Notice("Complete the Salesforce login in the popup window",5e3),this.startSalesforcePolling(d)},o.createEl("p",{cls:"eudia-setup-help-text",text:"This links your Obsidian notes to your Salesforce account for automatic sync."})}}startSalesforcePolling(e){this.pollInterval&&window.clearInterval(this.pollInterval);let t=0,n=60;this.pollInterval=window.setInterval(async()=>{t++;try{(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),this.steps[1].status="complete",new u.Notice("Salesforce connected successfully!"),await this.importTailoredAccounts(e),await this.render()):t>=n&&(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),e.textContent="Connection timed out. Please try again.",e.className="eudia-setup-sf-status error")}catch{}},5e3)}async importTailoredAccounts(e){e.textContent="Importing your accounts...",e.className="eudia-setup-sf-status loading";try{let t=this.plugin.settings.userEmail,n=D(t)?"admin":B(t)?"cs":"bl";console.log(`[Eudia SF Import] Importing for ${t} (group: ${n})`);let r,i=[];if(n==="cs"){console.log("[Eudia SF Import] CS user SF Connect \u2014 fetching live data from Salesforce..."),e.textContent="Syncing with Salesforce for latest account data...";try{let p=await this.accountOwnershipService.getCSAccounts(t);r=p.accounts,i=p.prospects,console.log(`[Eudia SF Import] CS server sync: ${r.length} accounts (with real SF IDs + CSM data)`)}catch{if(this.plugin.settings.accountsImported){e.textContent="Salesforce connected! Account folders already loaded. Enrichment will retry later.",e.className="eudia-setup-sf-status success",this.steps[1].status="complete";return}r=[...I],console.log(`[Eudia SF Import] CS server unavailable \u2014 using ${r.length} static accounts`)}}else if(n==="admin")console.log("[Eudia] Admin user detected - importing all accounts"),e.textContent="Admin detected - importing all accounts...",r=await this.accountOwnershipService.getAllAccountsForAdmin(t);else{let p=await this.accountOwnershipService.getAccountsWithProspects(t);r=p.accounts,i=p.prospects}if(r.length===0&&i.length===0){e.textContent="No accounts found for your email. Contact your admin.",e.className="eudia-setup-sf-status warning";return}e.textContent=`Creating ${r.length} account folders...`;let a=this.plugin.app.workspace.leftSplit,o=a?.collapsed;if(a&&!o&&a.collapse(),D(t)?await this.plugin.createAdminAccountFolders(r):(await this.plugin.createTailoredAccountFolders(r,{}),i.length>0&&await this.plugin.createProspectAccountFiles(i)),_(t))try{await this.plugin.createCSManagerDashboard(t,r)}catch{}this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=r.length+i.length,await this.plugin.saveSettings();try{let p=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");p&&await this.plugin.app.vault.delete(p)}catch{}a&&!o&&a.expand(),this.steps[2].status="complete";let c=r.filter(p=>p.isOwned!==!1).length,l=r.filter(p=>p.isOwned===!1).length;n==="admin"&&l>0?e.textContent=`${c} owned + ${l} view-only accounts imported! Enriching...`:e.textContent=`${r.length} active + ${i.length} prospect accounts imported! Enriching...`,e.className="eudia-setup-sf-status success";let d=[...r,...i],m=t,y=n;setTimeout(async()=>{try{let p=d.filter(h=>h.id&&h.id.startsWith("001"));if(p.length>0?(e.textContent=`Enriching ${p.length} accounts with Salesforce data...`,await this.plugin.enrichAccountFolders(p),e.textContent=`${r.length} accounts imported, ${p.length} enriched with Salesforce data`):e.textContent=`${r.length} accounts imported (enrichment requires Salesforce IDs)`,y==="cs"&&_(m))try{console.log("[Eudia SF Import] Regenerating CS Manager dashboard with live CSM data..."),await this.plugin.createCSManagerDashboard(m,r),console.log("[Eudia SF Import] CS Manager dashboard updated with CSM assignments")}catch(h){console.error("[Eudia SF Import] Dashboard regeneration failed (non-blocking):",h)}}catch(p){console.log("[Eudia] Background enrichment skipped:",p),e.textContent=`${r.length+i.length} accounts imported (enrichment will retry on next launch)`}},500)}catch{e.textContent="Failed to import accounts. Please try again.",e.className="eudia-setup-sf-status error";let n=this.plugin.app.workspace.leftSplit;if(n?.collapsed===!1)try{n.expand()}catch{}}}renderTranscribeStep(e){let t=this.steps[2],n=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),r=n.createDiv({cls:"eudia-setup-step-header"}),i=r.createDiv({cls:"eudia-setup-step-number"});i.setText(t.status==="complete"?"":"3"),t.status==="complete"&&i.addClass("eudia-step-complete");let a=r.createDiv({cls:"eudia-setup-step-info"});a.createEl("h3",{text:t.title}),a.createEl("p",{text:t.description});let o=n.createDiv({cls:"eudia-setup-step-content"}),c=o.createDiv({cls:"eudia-setup-instructions"}),l=c.createDiv({cls:"eudia-setup-instruction"});l.createSpan({cls:"eudia-setup-instruction-icon",text:"\u{1F399}"}),l.createSpan({text:"Click the microphone icon in the left sidebar during a call"});let d=c.createDiv({cls:"eudia-setup-instruction"});d.createSpan({cls:"eudia-setup-instruction-icon",text:"\u2328"}),d.createSpan({text:'Or press Cmd/Ctrl+P and search for "Transcribe Meeting"'});let m=c.createDiv({cls:"eudia-setup-instruction"});m.createSpan({cls:"eudia-setup-instruction-icon",text:"\u{1F4DD}"}),m.createSpan({text:"AI will summarize and extract key insights automatically"}),t.status!=="complete"&&o.createEl("p",{cls:"eudia-setup-help-text muted",text:"This step completes automatically after connecting to Salesforce and importing accounts."})}renderFooter(e){let t=e.createDiv({cls:"eudia-setup-footer"});if(this.steps.every(i=>i.status==="complete")){let i=t.createDiv({cls:"eudia-setup-completion"});i.createEl("h2",{text:"\u{1F389} You're all set!"}),i.createEl("p",{text:"Your sales vault is ready. Click below to start using Eudia."});let a=t.createEl("button",{text:"Open Calendar \u2192",cls:"eudia-setup-btn primary large"});a.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(H),await this.plugin.activateCalendarView()}}else{let i=t.createEl("button",{text:"Skip Setup (I'll do this later)",cls:"eudia-setup-btn secondary"});i.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(H),new u.Notice("You can complete setup anytime from Settings \u2192 Eudia Sync")}}let r=t.createEl("a",{text:"Advanced Settings",cls:"eudia-setup-settings-link"});r.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")}}},ae=class extends u.ItemView{constructor(e,t){super(e);this.refreshInterval=null;this.lastError=null;this.plugin=t}getViewType(){return G}getDisplayText(){return"Calendar"}getIcon(){return"calendar"}async onOpen(){await this.render(),this.refreshInterval=window.setInterval(()=>this.render(),5*60*1e3)}async onClose(){this.refreshInterval&&window.clearInterval(this.refreshInterval)}async render(){let e=this.containerEl.children[1];if(e.empty(),e.addClass("eudia-calendar-view"),!this.plugin.settings.userEmail){this.renderSetupPanel(e);return}this.renderHeader(e),await this.renderCalendarContent(e)}renderHeader(e){let t=e.createDiv({cls:"eudia-calendar-header"}),n=t.createDiv({cls:"eudia-calendar-title-row"});n.createEl("h4",{text:"Your Meetings"});let r=n.createDiv({cls:"eudia-calendar-actions"}),i=r.createEl("button",{cls:"eudia-btn-icon",text:"\u21BB"});i.title="Refresh (fetches latest from calendar)",i.onclick=async()=>{i.addClass("spinning"),this._forceRefresh=!0,await this.render(),i.removeClass("spinning")};let a=r.createEl("button",{cls:"eudia-btn-icon",text:"\u2699"});a.title="Settings",a.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")};let o=t.createDiv({cls:"eudia-status-bar"});this.renderConnectionStatus(o)}async renderConnectionStatus(e){let t={server:"connecting",calendar:"not_configured",salesforce:"not_configured"},n=this.plugin.settings.serverUrl,r=this.plugin.settings.userEmail;try{(await(0,u.requestUrl)({url:`${n}/api/health`,method:"GET",throw:!1})).status===200?(t.server="connected",t.serverMessage="Server online"):(t.server="error",t.serverMessage="Server unavailable")}catch{t.server="error",t.serverMessage="Cannot reach server"}if(r&&t.server==="connected")try{let d=await(0,u.requestUrl)({url:`${n}/api/calendar/validate/${encodeURIComponent(r)}`,method:"GET",throw:!1});d.status===200&&d.json?.authorized?(t.calendar="connected",t.calendarMessage="Calendar synced"):(t.calendar="not_authorized",t.calendarMessage="Not authorized")}catch{t.calendar="error",t.calendarMessage="Error checking access"}if(r&&t.server==="connected")try{let d=await(0,u.requestUrl)({url:`${n}/api/sf/auth/status?email=${encodeURIComponent(r)}`,method:"GET",throw:!1});d.status===200&&d.json?.connected?(t.salesforce="connected",t.salesforceMessage="Salesforce connected"):(t.salesforce="not_configured",t.salesforceMessage="Not connected")}catch{t.salesforce="not_configured"}let i=e.createDiv({cls:"eudia-status-indicators"}),a=i.createSpan({cls:`eudia-status-dot ${t.server}`});a.title=t.serverMessage||"Server";let o=i.createSpan({cls:`eudia-status-dot ${t.calendar}`});o.title=t.calendarMessage||"Calendar";let c=i.createSpan({cls:`eudia-status-dot ${t.salesforce}`});if(c.title=t.salesforceMessage||"Salesforce",e.createDiv({cls:"eudia-status-labels"}).createSpan({cls:"eudia-status-label",text:this.plugin.settings.userEmail}),t.calendar==="not_authorized"){let d=e.createDiv({cls:"eudia-status-warning"});d.innerHTML=`<strong>${r}</strong> is not authorized for calendar access. Contact your admin.`}}async renderCalendarContent(e){let t=e.createDiv({cls:"eudia-calendar-content"}),n=t.createDiv({cls:"eudia-calendar-loading"});n.innerHTML='<div class="eudia-spinner"></div><span>Loading meetings...</span>';try{let r=new F(this.plugin.settings.serverUrl,this.plugin.settings.userEmail,this.plugin.settings.timezone||"America/New_York"),i=this._forceRefresh||!1;this._forceRefresh=!1;let a=await r.getWeekMeetings(i);if(n.remove(),!a.success){this.renderError(t,a.error||"Failed to load calendar");return}let o=Object.keys(a.byDay||{}).sort();if(o.length===0){this.renderEmptyState(t);return}await this.renderCurrentMeeting(t,r);for(let c of o){let l=a.byDay[c];!l||l.length===0||this.renderDaySection(t,c,l)}}catch(r){n.remove(),this.renderError(t,r.message||"Failed to load calendar")}}async renderCurrentMeeting(e,t){try{let n=await t.getCurrentMeeting();if(n.meeting){let r=e.createDiv({cls:"eudia-now-card"});n.isNow?r.createDiv({cls:"eudia-now-badge",text:"\u25CF NOW"}):r.createDiv({cls:"eudia-now-badge soon",text:`In ${n.minutesUntilStart}m`});let i=r.createDiv({cls:"eudia-now-content"});i.createEl("div",{cls:"eudia-now-subject",text:n.meeting.subject}),n.meeting.accountName&&i.createEl("div",{cls:"eudia-now-account",text:n.meeting.accountName});let a=r.createEl("button",{cls:"eudia-now-action",text:"Create Note"});a.onclick=()=>this.createNoteForMeeting(n.meeting)}}catch{}}renderDaySection(e,t,n){let r=e.createDiv({cls:"eudia-calendar-day"});r.createEl("div",{cls:"eudia-calendar-day-header",text:F.getDayName(t)});for(let i of n){let a=r.createDiv({cls:`eudia-calendar-meeting ${i.isCustomerMeeting?"customer":"internal"}`});a.createEl("div",{cls:"eudia-calendar-time",text:F.formatTime(i.start,this.plugin.settings.timezone)});let o=a.createDiv({cls:"eudia-calendar-details"});if(o.createEl("div",{cls:"eudia-calendar-subject",text:i.subject}),i.accountName)o.createEl("div",{cls:"eudia-calendar-account",text:i.accountName});else if(i.attendees&&i.attendees.length>0){let c=i.attendees.slice(0,2).map(l=>l.name||l.email?.split("@")[0]||"Unknown").join(", ");o.createEl("div",{cls:"eudia-calendar-attendees",text:c})}a.onclick=()=>this.createNoteForMeeting(i),a.title="Click to create meeting note"}}renderEmptyState(e){let t=e.createDiv({cls:"eudia-calendar-empty"});t.innerHTML=`
      <div class="eudia-empty-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <p class="eudia-empty-title">No meetings this week</p>
      <p class="eudia-empty-subtitle">Enjoy your focus time!</p>
    `}renderError(e,t){let n=e.createDiv({cls:"eudia-calendar-error"}),r="",i="Unable to load calendar",a="";t.includes("not authorized")||t.includes("403")?(r="\u{1F512}",i="Calendar Access Required",a="Contact your admin to be added to the authorized users list."):t.includes("network")||t.includes("fetch")?(r="\u{1F4E1}",i="Connection Issue",a="Check your internet connection and try again."):(t.includes("server")||t.includes("500"))&&(r="\u{1F527}",i="Server Unavailable",a="The server may be waking up. Try again in 30 seconds."),n.innerHTML=`
      <div class="eudia-error-icon">${r}</div>
      <p class="eudia-error-title">${i}</p>
      <p class="eudia-error-message">${t}</p>
      ${a?`<p class="eudia-error-action">${a}</p>`:""}
    `;let o=n.createEl("button",{cls:"eudia-btn-retry",text:"Try Again"});o.onclick=()=>this.render()}renderSetupPanel(e){let t=e.createDiv({cls:"eudia-calendar-setup-panel"});t.innerHTML=`
      <div class="eudia-setup-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <h3 class="eudia-setup-title">Connect Your Calendar</h3>
      <p class="eudia-setup-desc">Enter your Eudia email to see your meetings and create notes with one click.</p>
    `;let n=t.createDiv({cls:"eudia-setup-input-group"}),r=n.createEl("input",{type:"email",placeholder:"yourname@eudia.com"});r.addClass("eudia-setup-email");let i=n.createEl("button",{cls:"eudia-setup-connect",text:"Connect"}),a=t.createDiv({cls:"eudia-setup-status"});i.onclick=async()=>{let o=r.value.trim().toLowerCase();if(!o||!o.endsWith("@eudia.com")){a.textContent="Please use your @eudia.com email",a.className="eudia-setup-status error";return}i.disabled=!0,i.textContent="Connecting...",a.textContent="";try{if(!(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${o}`,method:"GET"})).json?.authorized){a.innerHTML=`<strong>${o}</strong> is not authorized. Contact your admin to be added.`,a.className="eudia-setup-status error",i.disabled=!1,i.textContent="Connect";return}this.plugin.settings.userEmail=o,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),a.textContent="Connected",a.className="eudia-setup-status success",this.plugin.scanLocalAccountFolders().catch(()=>{}),setTimeout(()=>this.render(),500)}catch(c){let l=c.message||"Connection failed";l.includes("403")?a.innerHTML=`<strong>${o}</strong> is not authorized for calendar access.`:a.textContent=l,a.className="eudia-setup-status error",i.disabled=!1,i.textContent="Connect"}},r.onkeydown=o=>{o.key==="Enter"&&i.click()},t.createEl("p",{cls:"eudia-setup-help",text:"Your calendar syncs automatically via Microsoft 365."})}extractCompanyFromDomain(e){let t=e.toLowerCase().split("."),n=["mail","email","app","portal","crm","www","smtp","sales","support","login","sso","auth","api","my"],r=["com","org","net","io","co","ai","gov","edu","uk","us","de","fr","jp","au","ca"],i=t.filter(o=>!r.includes(o)&&o.length>1);if(i.length===0)return t[0]||"";if(i.length>1&&n.includes(i[0]))return i[1].charAt(0).toUpperCase()+i[1].slice(1);let a=i[i.length-1];return a.charAt(0).toUpperCase()+a.slice(1)}getExternalDomainsFromAttendees(e){if(!e||e.length===0)return[];let t=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com","live.com","msn.com","aol.com","protonmail.com","googlemail.com","mail.com","zoho.com","ymail.com"],n=new Set,r=[];for(let i of e){if(!i.email)continue;let o=i.email.toLowerCase().match(/@([a-z0-9.-]+)/);if(o){let c=o[1];if(c.includes("eudia.com")||t.includes(c)||n.has(c))continue;n.add(c);let l=this.extractCompanyFromDomain(c);l.length>=2&&r.push({domain:c,company:l})}}return r}findBestAccountMatch(e,t,n){let r=this.plugin.settings.accountsFolder||"Accounts",i=this.app.vault.getAbstractFileByPath(r);if(!(i instanceof u.TFolder))return null;let a=[];for(let c of i.children)c instanceof u.TFolder&&a.push(c.name);if(a.length===0)return null;let o=[];for(let{domain:c,company:l}of e){let d=this.findAccountFolder(l),m=d?1:0;o.push({domain:c,company:l,folder:d,score:m})}if(o.sort((c,l)=>l.score-c.score),o.length>0&&o[0].folder){let c=o[0],l=c.folder.split("/").pop()||c.company;return console.log(`[Eudia Calendar] Best domain match: "${c.company}" from ${c.domain} -> ${c.folder}`),{folder:c.folder,accountName:l,source:"domain"}}if(t){let c=this.findAccountFolder(t);if(c){let l=c.split("/").pop()||t;return console.log(`[Eudia Calendar] Server account match: "${t}" -> ${c}`),{folder:c,accountName:l,source:"server"}}}if(n){let c=this.findAccountFolder(n);if(c){let l=c.split("/").pop()||n;return console.log(`[Eudia Calendar] Subject match: "${n}" -> ${c}`),{folder:c,accountName:l,source:"subject"}}}for(let{company:c}of e){let l=a.find(d=>{let m=d.toLowerCase(),y=c.toLowerCase();return m.includes(y)||y.includes(m)});if(l){let d=`${r}/${l}`;return console.log(`[Eudia Calendar] Partial domain match: "${c}" -> ${d}`),{folder:d,accountName:l,source:"domain-partial"}}}return null}extractAccountFromAttendees(e){let t=this.getExternalDomainsFromAttendees(e);if(t.length===0)return null;let n=t[0];return console.log(`[Eudia Calendar] Extracted company "${n.company}" from attendee domain ${n.domain}`),n.company}extractAccountFromSubject(e){if(!e)return null;let t=e.match(/^([^\/]+)\s*\/\s*Eudia|Eudia\s*\/\s*([^\/\-|]+)/i);if(t){let r=(t[1]||t[2]||"").trim();if(r.toLowerCase()!=="eudia")return r}let n=e.match(/^Eudia\s*[-–]\s*([^|]+)|^([^-–]+)\s*[-–]\s*Eudia/i);if(n){let i=(n[1]||n[2]||"").trim().replace(/\s+(Connect|Weekly|Call|Meeting|Intro|Demo|Check\s*in|Sync).*$/i,"").trim();if(i.toLowerCase()!=="eudia"&&i.length>0)return i}if(!e.toLowerCase().includes("eudia")){let r=e.match(/^([^-–|]+)/);if(r){let i=r[1].trim();if(i.length>2&&i.length<50)return i}}return null}findAccountFolder(e){if(!e)return null;let t=this.plugin.settings.accountsFolder||"Accounts",n=this.app.vault.getAbstractFileByPath(t);if(!(n instanceof u.TFolder))return console.log(`[Eudia Calendar] Accounts folder "${t}" not found`),null;let r=e.toLowerCase().trim(),i=[];for(let m of n.children)m instanceof u.TFolder&&i.push(m.name);console.log(`[Eudia Calendar] Searching for "${r}" in ${i.length} folders`);let a=i.find(m=>m.toLowerCase()===r);if(a)return console.log(`[Eudia Calendar] Exact match found: ${a}`),`${t}/${a}`;let o=i.find(m=>m.toLowerCase().startsWith(r));if(o)return console.log(`[Eudia Calendar] Folder starts with match: ${o}`),`${t}/${o}`;let c=i.find(m=>r.startsWith(m.toLowerCase()));if(c)return console.log(`[Eudia Calendar] Search starts with folder match: ${c}`),`${t}/${c}`;let l=i.find(m=>{let y=m.toLowerCase();return y.length>=3&&r.includes(y)});if(l)return console.log(`[Eudia Calendar] Search contains folder match: ${l}`),`${t}/${l}`;let d=i.find(m=>{let y=m.toLowerCase();return r.length>=3&&y.includes(r)});return d?(console.log(`[Eudia Calendar] Folder contains search match: ${d}`),`${t}/${d}`):(console.log(`[Eudia Calendar] No folder match found for "${r}"`),null)}async createNoteForMeeting(e){let t=e.start.split("T")[0],n=this.plugin.settings.eudiaEmail||"",r=D(n),i=(e.attendees||[]).map(O=>O.email).filter(Boolean),a=re(e.subject,i);if(r&&a.isPipelineMeeting&&a.confidence>=60){await this._createPipelineNote(e,t);return}let o=e.subject.replace(/[<>:"/\\|?*]/g,"_").substring(0,50),c=`${t} - ${o}.md`,l=null,d=e.accountName||null,m=null;console.log(`[Eudia Calendar] === Creating note for meeting: "${e.subject}" ===`),console.log(`[Eudia Calendar] Attendees: ${JSON.stringify(e.attendees?.map(O=>O.email)||[])}`);let y=this.getExternalDomainsFromAttendees(e.attendees||[]);console.log(`[Eudia Calendar] External domains found: ${JSON.stringify(y)}`);let p=this.extractAccountFromSubject(e.subject);console.log(`[Eudia Calendar] Subject-extracted name: "${p||"none"}"`);let h=this.findBestAccountMatch(y,e.accountName,p||void 0);if(h&&(l=h.folder,d=h.accountName,console.log(`[Eudia Calendar] Best match (${h.source}): "${d}" -> ${l}`)),!l){let O=this.plugin.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(O)instanceof u.TFolder&&(l=O,console.log(`[Eudia Calendar] No match found, using Accounts root: ${l}`))}if(d){let O=this.plugin.settings.cachedAccounts.find(b=>b.name.toLowerCase()===d?.toLowerCase());O&&(m=O.id,d=O.name,console.log(`[Eudia Calendar] Matched to cached account: ${O.name} (${O.id})`))}let g=l?`${l}/${c}`:c,v=this.app.vault.getAbstractFileByPath(g);if(v instanceof u.TFile){await this.app.workspace.getLeaf().openFile(v),new u.Notice(`Opened existing note: ${c}`);return}let w=(e.attendees||[]).map(O=>O.name||O.email?.split("@")[0]||"Unknown").slice(0,5).join(", "),C=`---
title: "${e.subject}"
date: ${t}
attendees: [${w}]
account: "${d||""}"
account_id: "${m||""}"
meeting_start: ${e.start}
meeting_type: discovery
sync_to_salesforce: false
clo_meeting: false
source: ""
transcribed: false
---

# ${e.subject}

## Attendees
${(e.attendees||[]).map(O=>`- ${O.name||O.email}`).join(`
`)}

## Pre-Call Notes

*Add any prep notes, context, or questions before the meeting*



---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` \u2192 **"Transcribe Meeting"**

---

`;try{let O=await this.app.vault.create(g,C);await this.app.workspace.getLeaf().openFile(O),new u.Notice(`Created: ${g}`)}catch(O){console.error("[Eudia Calendar] Failed to create note:",O),new u.Notice(`Could not create note: ${O.message||"Unknown error"}`)}}async _createPipelineNote(e,t){let n=new Date(t+"T00:00:00"),r=String(n.getMonth()+1).padStart(2,"0"),i=String(n.getDate()).padStart(2,"0"),a=String(n.getFullYear()).slice(-2),o=`${r}.${i}.${a}`,c=`Team Pipeline Meeting - ${o}.md`,l="Pipeline Meetings";this.app.vault.getAbstractFileByPath(l)||await this.app.vault.createFolder(l);let m=`${l}/${c}`,y=this.app.vault.getAbstractFileByPath(m);if(y instanceof u.TFile){await this.app.workspace.getLeaf().openFile(y),new u.Notice(`Opened existing: ${c}`);return}let p=(e.attendees||[]).map(g=>g.name||g.email?.split("@")[0]||"Unknown"),h=`---
title: "Team Pipeline Meeting - ${o}"
date: ${t}
attendees: [${p.slice(0,10).join(", ")}]
meeting_type: pipeline_review
meeting_start: ${e.start}
transcribed: false
---

# Weekly Pipeline Review | ${n.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"})}

## Attendees
${p.map(g=>`- ${g}`).join(`
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

`;try{let g=await this.app.vault.create(m,h);await this.app.workspace.getLeaf().openFile(g),new u.Notice(`Created pipeline note: ${c}`),console.log(`[Eudia Pipeline] Created pipeline meeting note: ${m}`)}catch(g){console.error("[Eudia Pipeline] Failed to create pipeline note:",g),new u.Notice(`Could not create pipeline note: ${g.message||"Unknown error"}`)}}},K=class extends u.Plugin{constructor(){super(...arguments);this.audioRecorder=null;this.recordingStatusBar=null;this.micRibbonIcon=null;this.liveTranscript="";this.liveTranscriptChunkInterval=null;this.isTranscribingChunk=!1;this.sfSyncStatusBarEl=null;this.sfSyncIntervalId=null}async onload(){await this.loadSettings(),this.transcriptionService=new Y(this.settings.serverUrl),this.calendarService=new F(this.settings.serverUrl,this.settings.userEmail,this.settings.timezone||"America/New_York"),this.smartTagService=new V,this.checkForPluginUpdate(),this.registerView(G,e=>new ae(e,this)),this.registerView(H,e=>new ne(e,this)),this.addRibbonIcon("calendar","Open Calendar",()=>this.activateCalendarView()),this.micRibbonIcon=this.addRibbonIcon("microphone","Transcribe Meeting",async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}),this.addRibbonIcon("message-circle","Ask GTM Brain",()=>{this.openIntelligenceQueryForCurrentNote()}),this.addCommand({id:"transcribe-meeting",name:"Transcribe Meeting",callback:async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}}),this.addCommand({id:"open-calendar",name:"Open Calendar",callback:()=>this.activateCalendarView()}),this.addCommand({id:"sync-accounts",name:"Sync Salesforce Accounts",callback:()=>this.syncAccounts()}),this.addCommand({id:"sync-note",name:"Sync Note to Salesforce",callback:()=>this.syncNoteToSalesforce()}),this.addCommand({id:"new-meeting-note",name:"New Meeting Note",callback:()=>this.createMeetingNote()}),this.addCommand({id:"ask-gtm-brain",name:"Ask gtm-brain",callback:()=>this.openIntelligenceQueryForCurrentNote()}),this.addCommand({id:"enrich-accounts",name:"Enrich Account Folders with Salesforce Data",callback:async()=>{if(!this.settings.userEmail){new u.Notice("Please set up your email first.");return}let e=new R(this.settings.serverUrl),t;B(this.settings.userEmail)?t=await e.getCSAccounts(this.settings.userEmail):t=await e.getAccountsWithProspects(this.settings.userEmail);let n=[...t.accounts,...t.prospects];if(n.length===0){new u.Notice("No accounts found to enrich.");return}await this.enrichAccountFolders(n)}}),this.addCommand({id:"refresh-analytics",name:"Refresh Analytics Dashboard",callback:async()=>{let e=this.app.workspace.getActiveFile();e?await this.refreshAnalyticsDashboard(e):new u.Notice("No active file")}}),this.addCommand({id:"live-query-transcript",name:"Query Current Transcript (Live)",callback:async()=>{if(!this.audioRecorder?.isRecording()){new u.Notice("No active recording. Start recording first to use live query.");return}if(!this.liveTranscript||this.liveTranscript.length<50){new u.Notice("Not enough transcript captured yet. Keep recording for a few more minutes.");return}this.openLiveQueryModal()}}),this.sfSyncStatusBarEl=this.addStatusBarItem(),this.sfSyncStatusBarEl.setText("SF Sync: Idle"),this.sfSyncStatusBarEl.addClass("eudia-sf-sync-status"),this.addSettingTab(new ie(this.app,this)),this.registerEditorSuggest(new Q(this.app,this)),this.app.workspace.onLayoutReady(async()=>{if(this.settings.setupCompleted){if(this.settings.syncOnStartup){if(await this.scanLocalAccountFolders(),this.settings.userEmail&&this.settings.syncAccountsOnStartup){let e=new Date().toISOString().split("T")[0];this.settings.lastAccountRefreshDate!==e&&setTimeout(async()=>{try{console.log("[Eudia] Startup account sync - checking for changes...");let n=await this.syncAccountFolders();if(n.success){if(this.settings.lastAccountRefreshDate=e,await this.saveSettings(),n.added>0||n.archived>0){let r=[];n.added>0&&r.push(`${n.added} added`),n.archived>0&&r.push(`${n.archived} archived`),new u.Notice(`Account folders synced: ${r.join(", ")}`)}}else console.log("[Eudia] Sync failed:",n.error)}catch{console.log("[Eudia] Startup sync skipped (server unreachable), will retry tomorrow")}},2e3)}this.settings.showCalendarView&&this.settings.userEmail&&await this.activateCalendarView(),this.settings.userEmail&&this.settings.cachedAccounts.length>0&&setTimeout(async()=>{try{await this.checkAndAutoEnrich()}catch{console.log("[Eudia] Auto-enrich skipped (server unreachable)")}},5e3),this.settings.userEmail&&this.telemetry?setTimeout(async()=>{try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),t=0;e&&e instanceof u.TFolder&&(t=e.children.filter(i=>i instanceof u.TFolder&&!i.name.startsWith("_")).length);let n={salesforce:this.settings.salesforceConnected?"connected":"not_configured",calendar:this.settings.calendarConfigured?"connected":"not_configured"};await this.telemetry.sendHeartbeat(t,n);let r=await this.telemetry.checkForPushedConfig();if(r.length>0){let i=!1;for(let a of r)a.key&&this.settings.hasOwnProperty(a.key)&&(this.settings[a.key]=a.value,i=!0,console.log(`[Eudia] Applied pushed config: ${a.key} = ${a.value}`));i&&(await this.saveSettings(),new u.Notice("Settings updated by admin"))}await this.checkAndConsumeSyncFlags(),this.startSalesforceSyncScanner()}catch{console.log("[Eudia] Heartbeat/config check skipped"),this.startSalesforceSyncScanner()}},3e3):this.settings.sfAutoSyncEnabled&&this.settings.salesforceConnected&&setTimeout(()=>this.startSalesforceSyncScanner(),5e3)}}else{await new Promise(t=>setTimeout(t,100));let e=document.querySelector(".modal-container .modal");if(e){let t=e.querySelector(".modal-close-button");t&&t.click()}await this.activateSetupView()}this.app.workspace.on("file-open",async e=>{if(e&&(e.path.includes("_Analytics/")||e.path.includes("_Customer Health/")))try{let t=await this.app.vault.read(e);if(t.includes("type: analytics_dashboard")){let r=t.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/)?.[1],i=new Date().toISOString().split("T")[0];r!==i&&(console.log(`[Eudia] Auto-refreshing analytics: ${e.name}`),await this.refreshAnalyticsDashboard(e))}}catch{}})})}async onunload(){this.app.workspace.detachLeavesOfType(G)}async checkForPluginUpdate(){try{let e=this.settings.serverUrl||"https://gtm-wizard.onrender.com",t=await(0,u.requestUrl)({url:`${e}/api/plugin/version`,method:"GET",headers:{"Content-Type":"application/json"}});if(!t.json?.success)return;let n=t.json.currentVersion,r=this.manifest?.version||"0.0.0",i=n.split(".").map(Number),a=r.split(".").map(Number),o=!1;for(let c=0;c<3;c++){if((i[c]||0)>(a[c]||0)){o=!0;break}if((i[c]||0)<(a[c]||0))break}o?(console.log(`[Eudia Update] New version available: ${n} (current: ${r})`),await this.performAutoUpdate(e,n,r)):console.log(`[Eudia Update] Plugin is up to date (v${r})`)}catch(e){console.log("[Eudia Update] Could not check for updates:",e.message||e)}}async performAutoUpdate(e,t,n){try{if(this.audioRecorder?.isRecording()){console.log("[Eudia Update] Skipping auto-update \u2014 recording in progress"),new u.Notice(`Eudia update v${t} available.
Finish your recording, then restart Obsidian to update.`,1e4);return}let r=this.manifest.dir;if(!r){console.log("[Eudia Update] Cannot determine plugin directory \u2014 skipping");return}let i=this.app.vault.adapter;console.log("[Eudia Update] Downloading plugin files...");let[a,o,c]=await Promise.all([(0,u.requestUrl)({url:`${e}/api/plugin/main.js`}),(0,u.requestUrl)({url:`${e}/api/plugin/manifest.json`}),(0,u.requestUrl)({url:`${e}/api/plugin/styles.css`})]),l=a.text,d=o.text,m=c.text,y=1024,p=5*1024*1024;for(let[C,O]of[["main.js",l],["manifest.json",d],["styles.css",m]])if(!O||O.length<y||O.length>p){console.log(`[Eudia Update] Downloaded ${C} failed validation (${O?.length??0} bytes) \u2014 aborting`);return}try{let C=await i.read(`${r}/main.js`);await i.write(`${r}/main.js.bak`,C),console.log("[Eudia Update] Backed up current main.js")}catch{console.log("[Eudia Update] Could not back up main.js \u2014 continuing")}await i.write(`${r}/main.js`,l),await i.write(`${r}/manifest.json`,d),await i.write(`${r}/styles.css`,m),console.log(`[Eudia Update] Files written \u2014 v${n} \u2192 v${t}`);try{(0,u.requestUrl)({url:`${e}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"info",message:`Auto-updated from v${n} to v${t}`,userEmail:this.settings.userEmail||"anonymous",pluginVersion:t,platform:"obsidian",context:{fromVersion:n,toVersion:t}})}).catch(()=>{})}catch{}let h=document.createDocumentFragment(),g=document.createElement("div");g.style.cssText="display:flex;flex-direction:column;gap:8px;";let v=document.createElement("span");v.textContent=`Eudia updated to v${t}. Reload to apply.`,g.appendChild(v);let w=document.createElement("button");w.textContent="Reload now",w.style.cssText="padding:4px 12px;border-radius:4px;border:1px solid var(--interactive-accent);background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:12px;align-self:flex-start;",w.addEventListener("click",()=>{this.app.commands.executeCommandById("app:reload")}),g.appendChild(w),h.appendChild(g),new u.Notice(h,0)}catch(r){console.log("[Eudia Update] Auto-update failed:",r.message||r)}}async loadSettings(){this.settings=Object.assign({},Me,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}async activateCalendarView(){let e=this.app.workspace,t=e.getLeavesOfType(G);if(t.length>0)e.revealLeaf(t[0]);else{let n=e.getRightLeaf(!1);n&&(await n.setViewState({type:G,active:!0}),e.revealLeaf(n))}}async activateSetupView(){let e=this.app.workspace,t=e.getLeavesOfType(H);if(t.length>0)e.revealLeaf(t[0]);else{let n=e.getLeaf(!0);n&&(await n.setViewState({type:H,active:!0}),e.revealLeaf(n))}}async createTailoredAccountFolders(e,t){let n=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);let i=0,a=new Date().toISOString().split("T")[0],o=async l=>{let d=l.name.replace(/[<>:"/\\|?*]/g,"_").trim(),m=`${n}/${d}`;if(this.app.vault.getAbstractFileByPath(m)instanceof u.TFolder)return console.log(`[Eudia] Account folder already exists: ${d}`),!1;try{await this.app.vault.createFolder(m);let p=t?.[l.id],h=!!p,g=this.buildContactsContent(l,p,a),v=this.buildIntelligenceContent(l,p,a),w=this.buildMeetingNotesContent(l,p),C=this.buildNextStepsContent(l,p,a),O=[{name:"Note 1.md",content:`---
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

`},{name:"Meeting Notes.md",content:w},{name:"Contacts.md",content:g},{name:"Intelligence.md",content:v},{name:"Next Steps.md",content:C}];for(let W of O){let j=`${m}/${W.name}`;await this.app.vault.create(j,W.content)}return console.log(`[Eudia] Created account folder with subnotes${h?" (enriched)":""}: ${d}`),!0}catch(p){return console.error(`[Eudia] Failed to create folder for ${d}:`,p),!1}},c=5;for(let l=0;l<e.length;l+=c){let d=e.slice(l,l+c),m=await Promise.allSettled(d.map(y=>o(y)));i+=m.filter(y=>y.status==="fulfilled"&&y.value===!0).length}this.settings.cachedAccounts=e.map(l=>({id:l.id,name:l.name})),await this.saveSettings(),i>0&&new u.Notice(`Created ${i} account folders`),await this.ensureNextStepsFolderExists()}buildContactsContent(e,t,n){let r=t?`
enriched_at: "${new Date().toISOString()}"`:"",i=`---
account: "${e.name}"
account_id: "${e.id}"
type: contacts
sync_to_salesforce: false${r}
---`;return t?.contacts?`${i}

# ${e.name} - Key Contacts

${t.contacts}

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`:`${i}

# ${e.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
| *No contacts on record yet* | | | | |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`}buildIntelligenceContent(e,t,n){let r=t?`
enriched_at: "${new Date().toISOString()}"`:"",i=`---
account: "${e.name}"
account_id: "${e.id}"
type: intelligence
sync_to_salesforce: false${r}
---`;return t?.intelligence?`${i}

# ${e.name} - Account Intelligence

${t.intelligence}

## News & Signals

*Recent news, earnings mentions, leadership changes.*
`:`${i}

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
`}buildMeetingNotesContent(e,t){let n=t?`
enriched_at: "${new Date().toISOString()}"`:"",r=`---
account: "${e.name}"
account_id: "${e.id}"
type: meetings_index
sync_to_salesforce: false${n}
---`,i=[];return t?.opportunities&&i.push(t.opportunities),t?.recentActivity&&i.push(t.recentActivity),i.length>0?`${r}

# ${e.name} - Meeting Notes

${i.join(`

`)}

## Quick Start

1. Open **Note 1** for your next meeting
2. Click the **microphone** to record and transcribe
3. **Next Steps** are auto-extracted after transcription
4. Set \`sync_to_salesforce: true\` to sync to Salesforce
`:`${r}

# ${e.name} - Meeting Notes

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
`}buildNextStepsContent(e,t,n){let r=n||new Date().toISOString().split("T")[0],i=t?`
enriched_at: "${new Date().toISOString()}"`:"",a=`---
account: "${e.name}"
account_id: "${e.id}"
type: next_steps
auto_updated: true
last_updated: ${r}
sync_to_salesforce: false${i}
---`;return t?.nextSteps?`${a}

# ${e.name} - Next Steps

${t.nextSteps}

---

## History

*Previous next steps will be archived here.*
`:`${a}

# ${e.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}async fetchEnrichmentData(e){let t=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=e.filter(a=>a.id&&a.id.startsWith("001"));if(n.length===0)return{};let r={},i=20;console.log(`[Eudia Enrich] Fetching enrichment data for ${n.length} accounts`);for(let a=0;a<n.length;a+=i){let c=n.slice(a,a+i).map(l=>l.id);try{let l=await(0,u.requestUrl)({url:`${t}/api/accounts/enrich-batch`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountIds:c,userEmail:this.settings.userEmail})});l.json?.success&&l.json?.enrichments&&Object.assign(r,l.json.enrichments)}catch(l){console.error(`[Eudia Enrich] Batch fetch failed (batch ${a/i+1}):`,l)}a+i<n.length&&await new Promise(l=>setTimeout(l,100))}return console.log(`[Eudia Enrich] Got enrichment data for ${Object.keys(r).length}/${n.length} accounts`),r}async createProspectAccountFiles(e){if(!e||e.length===0)return 0;let t=this.settings.accountsFolder||"Accounts",n=`${t}/_Prospects`;if(!this.app.vault.getAbstractFileByPath(n))try{await this.app.vault.createFolder(n)}catch{}let i=0;for(let a of e){let o=a.name.replace(/[<>:"/\\|?*]/g,"_").trim(),c=`${n}/${o}`;if(this.app.vault.getAbstractFileByPath(c)instanceof u.TFolder)continue;let d=`${t}/${o}`;if(this.app.vault.getAbstractFileByPath(d)instanceof u.TFolder)continue;let y=`${n}/${o}.md`,p=this.app.vault.getAbstractFileByPath(y);if(p instanceof u.TFile)try{await this.app.vault.delete(p)}catch{}try{await this.app.vault.createFolder(c);let h=new Date().toISOString().split("T")[0],g=[{name:"Note 1.md",content:`---
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
`}];for(let v of g){let w=`${c}/${v.name}`;await this.app.vault.create(w,v.content)}i++}catch(h){console.log(`[Eudia] Failed to create prospect folder for ${a.name}:`,h)}}return i>0&&console.log(`[Eudia] Created ${i} prospect account folders in _Prospects/`),i}async createCSManagerDashboard(e,t){let n="CS Manager",r=new Date().toISOString().split("T")[0],i=pe(e);if(!this.app.vault.getAbstractFileByPath(n))try{await this.app.vault.createFolder(n)}catch{}let a={};for(let m of t){let y=m.ownerName||"Unassigned";a[y]||(a[y]=[]),a[y].push(m)}let o=`---
role: cs_manager
manager: "${e}"
direct_reports: ${i.length}
total_accounts: ${t.length}
created: ${r}
auto_refresh: true
---

# CS Manager Overview

**Manager:** ${e}
**Direct Reports:** ${i.join(", ")||"None configured"}
**Total CS Accounts:** ${t.length}
**Last Refreshed:** ${r}

---

## Account Distribution by Sales Rep

`,c=Object.keys(a).sort();for(let m of c){let y=a[m];o+=`### ${m} (${y.length} accounts)
`;for(let p of y.slice(0,10))o+=`- **${p.name}** \u2014 ${p.type||"Account"}
`;y.length>10&&(o+=`- _...and ${y.length-10} more_
`),o+=`
`}o+=`---

## CS Staffing Pipeline

| Account | Type | Owner | CSM |
|---------|------|-------|-----|
`;for(let m of t.slice(0,50))o+=`| ${m.name} | ${m.type||""} | ${m.ownerName||""} | ${m.csmName||""} |
`;o+=`
---

*This dashboard auto-updates when the vault syncs. New Stage 4/5 and Existing accounts will appear automatically.*
`;let l=`${n}/CS Manager Overview.md`,d=this.app.vault.getAbstractFileByPath(l);d instanceof u.TFile?await this.app.vault.modify(d,o):await this.app.vault.create(l,o);for(let m of i){let y=m.split("@")[0].replace("."," ").replace(/\b\w/g,b=>b.toUpperCase()),p=m.split("@")[0].replace("."," ").toLowerCase(),h=p.split(" ")[0],g=p.split(" ").pop()||"",v=t.filter(b=>{let W=(b.csmName||"").toLowerCase();if(W&&(W.includes(h)||W.includes(g)))return!0;let j=(b.ownerName||"").toLowerCase();return j.includes(h)||j.includes(g)}),w=`---
rep: "${m}"
rep_name: "${y}"
role: cs_rep_summary
account_count: ${v.length}
created: ${r}
---

# ${y} \u2014 CS Account Summary

**Email:** ${m}
**CS Accounts:** ${v.length}

---

## Assigned Accounts

`;if(v.length>0){w+=`| Account | Type | Owner |
|---------|------|-------|
`;for(let b of v)w+=`| ${b.name} | ${b.type||""} | ${b.ownerName||""} |
`}else w+=`*No accounts currently matched to this rep. Accounts will populate after connecting to Salesforce (Step 2).*
`;w+=`
---

*Updates automatically as new CS-relevant accounts sync.*
`;let C=`${n}/${y}.md`,O=this.app.vault.getAbstractFileByPath(C);O instanceof u.TFile?await this.app.vault.modify(O,w):await this.app.vault.create(C,w)}console.log(`[Eudia] Created CS Manager dashboard for ${e} with ${t.length} accounts across ${c.length} reps`)}async createAdminAccountFolders(e){let t=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t),await this.ensurePipelineFolderExists();let r=0,i=0,a=new Date().toISOString().split("T")[0],o=async l=>{let d=l.name.replace(/[<>:"/\\|?*]/g,"_").trim(),m=`${t}/${d}`;if(this.app.vault.getAbstractFileByPath(m)instanceof u.TFolder)return!1;try{return await this.app.vault.createFolder(m),await this.createExecAccountSubnotes(m,l,a),l.isOwned?r++:i++,console.log(`[Eudia Admin] Created ${l.isOwned?"owned":"view-only"} folder: ${d}`),!0}catch(p){return console.error(`[Eudia Admin] Failed to create folder for ${d}:`,p),!1}},c=5;for(let l=0;l<e.length;l+=c){let d=e.slice(l,l+c);await Promise.allSettled(d.map(m=>o(m)))}this.settings.cachedAccounts=e.map(l=>({id:l.id,name:l.name})),await this.saveSettings(),r+i>0&&new u.Notice(`Created ${r} owned + ${i} view-only account folders`),await this.ensureNextStepsFolderExists()}async createExecAccountSubnotes(e,t,n){let r=t.ownerName||"Unknown",i=[{name:"Note 1.md",content:`---
account: "${t.name}"
account_id: "${t.id}"
type: meeting_note
sync_to_salesforce: false
created: ${n}
---

# ${t.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 2.md",content:`---
account: "${t.name}"
account_id: "${t.id}"
type: meeting_note
sync_to_salesforce: false
created: ${n}
---

# ${t.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 3.md",content:`---
account: "${t.name}"
account_id: "${t.id}"
type: meeting_note
sync_to_salesforce: false
created: ${n}
---

# ${t.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Meeting Notes.md",content:`---
account: "${t.name}"
account_id: "${t.id}"
type: meetings_index
owner: "${r}"
sync_to_salesforce: false
---

# ${t.name} - Meeting Notes

**Account Owner:** ${r}

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
account: "${t.name}"
account_id: "${t.id}"
type: contacts
sync_to_salesforce: false
---

# ${t.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
|      |       |       |       |       |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`},{name:"Intelligence.md",content:`---
account: "${t.name}"
account_id: "${t.id}"
type: intelligence
sync_to_salesforce: false
---

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
`},{name:"Next Steps.md",content:`---
account: "${t.name}"
account_id: "${t.id}"
type: next_steps
auto_updated: true
last_updated: ${n}
sync_to_salesforce: false
---

# ${t.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}];for(let a of i){let o=`${e}/${a.name}`;await this.app.vault.create(o,a.content)}}async createFullAccountSubnotes(e,t,n){let r=[{name:"Note 1.md",content:`---
account: "${t.name}"
account_id: "${t.id}"
type: meeting_note
sync_to_salesforce: false
created: ${n}
---

# ${t.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Next Steps.md",content:`---
account: "${t.name}"
account_id: "${t.id}"
type: next_steps
auto_updated: true
last_updated: ${n}
sync_to_salesforce: false
---

# ${t.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}];for(let i of r){let a=`${e}/${i.name}`;await this.app.vault.create(a,i.content)}}async ensurePipelineFolderExists(){let e="Pipeline",t=`${e}/Pipeline Review Notes.md`;if(this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e),!this.app.vault.getAbstractFileByPath(t)){let a=`---
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
`;await this.app.vault.create(t,a)}}async ensureNextStepsFolderExists(){let e="Next Steps",t=`${e}/All Next Steps.md`;if(this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e),!this.app.vault.getAbstractFileByPath(t)){let i=new Date().toISOString().split("T")[0],a=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
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
`;await this.app.vault.create(t,o)}}async updateAccountNextSteps(e,t,n){try{console.log(`[Eudia] updateAccountNextSteps called for: ${e}`),console.log(`[Eudia] Content length: ${t?.length||0} chars`);let r=e.replace(/[<>:"/\\|?*]/g,"_").trim(),i=`${this.settings.accountsFolder}/${r}/Next Steps.md`;console.log(`[Eudia] Looking for Next Steps file at: ${i}`);let a=this.app.vault.getAbstractFileByPath(i);if(!a||!(a instanceof u.TFile)){console.log(`[Eudia] \u274C Next Steps file NOT FOUND at: ${i}`);let w=this.app.vault.getAbstractFileByPath(`${this.settings.accountsFolder}/${r}`);w&&w instanceof u.TFolder?console.log(`[Eudia] Files in ${r} folder:`,w.children.map(C=>C.name)):console.log(`[Eudia] Account folder also not found: ${this.settings.accountsFolder}/${r}`);return}console.log("[Eudia] Found Next Steps file, updating...");let o=new Date().toISOString().split("T")[0],c=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),l=n.split("/").pop()?.replace(".md","")||"Meeting",d=t;!t.includes("- [ ]")&&!t.includes("- [x]")&&(d=t.split(`
`).filter(w=>w.trim()).map(w=>{let C=w.replace(/^[-•*]\s*/,"").trim();return C?`- [ ] ${C}`:""}).filter(Boolean).join(`
`));let m=await this.app.vault.read(a),y="",p=m.match(/## History\n\n\*Previous next steps are archived below\.\*\n\n([\s\S]*?)$/);p&&p[1]&&(y=p[1].trim());let h=`### ${o} - ${l}
${d||"*None*"}`,g=y?`${h}

---

${y}`:h,v=`---
account: "${e}"
account_id: "${this.settings.cachedAccounts.find(w=>w.name===e)?.id||""}"
type: next_steps
auto_updated: true
last_updated: ${o}
sync_to_salesforce: false
---

# ${e} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*Last updated: ${o} ${c} from ${l}*

${d||"*No next steps identified*"}

---

## History

*Previous next steps are archived below.*

${g}
`;await this.app.vault.modify(a,v),console.log(`[Eudia] Updated Next Steps for ${e} (history preserved)`),await this.regenerateNextStepsDashboard()}catch(r){console.error(`[Eudia] Failed to update Next Steps for ${e}:`,r)}}async regenerateNextStepsDashboard(){try{let t=this.app.vault.getAbstractFileByPath("Next Steps/All Next Steps.md");if(!t||!(t instanceof u.TFile)){await this.ensureNextStepsFolderExists();return}let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!n||!(n instanceof u.TFolder))return;let r=[];for(let c of n.children)if(c instanceof u.TFolder){let l=`${c.path}/Next Steps.md`,d=this.app.vault.getAbstractFileByPath(l);if(d instanceof u.TFile){let m=await this.app.vault.read(d),y=m.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/),p=y?y[1]:"Unknown",h=m.split(`
`).filter(g=>g.match(/^- \[[ x]\]/)).slice(0,5);(h.length>0||p!=="Unknown")&&r.push({account:c.name,lastUpdated:p,nextSteps:h})}}r.sort((c,l)=>l.lastUpdated.localeCompare(c.lastUpdated));let i=new Date().toISOString().split("T")[0],a=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${i}
---

# All Next Steps Dashboard

*Last updated: ${i} ${a}*

---

`;if(r.length===0)o+=`## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;else{for(let c of r)o+=`## ${c.account}

`,c.nextSteps.length>0?o+=c.nextSteps.join(`
`)+`
`:o+=`*No current next steps*
`,o+=`
*Updated: ${c.lastUpdated}*

---

`;o+=`## Summary

`,o+=`| Account | Last Updated | Open Items |
`,o+=`|---------|--------------|------------|
`;for(let c of r){let l=c.nextSteps.filter(d=>d.includes("- [ ]")).length;o+=`| ${c.account} | ${c.lastUpdated} | ${l} |
`}}await this.app.vault.modify(t,o),console.log("[Eudia] Regenerated All Next Steps dashboard")}catch(e){console.error("[Eudia] Failed to regenerate Next Steps dashboard:",e)}}async startRecording(){if(!$.isSupported()){new u.Notice("Audio transcription is not supported in this browser");return}let e=this.app.workspace.getActiveFile();if(e||(await this.createMeetingNote(),e=this.app.workspace.getActiveFile()),!e){new u.Notice("Please open or create a note first");return}this.audioRecorder=new $,this.recordingStatusBar=new ee(()=>this.audioRecorder?.pause(),()=>this.audioRecorder?.resume(),()=>this.stopRecording(),()=>this.cancelRecording());try{await this.audioRecorder.start(),this.recordingStatusBar.show(),this.micRibbonIcon?.addClass("eudia-ribbon-recording");let t=setInterval(()=>{if(this.audioRecorder?.isRecording()){let n=this.audioRecorder.getState();this.recordingStatusBar?.updateState(n)}else clearInterval(t)},100);this.liveTranscript="",this.startLiveTranscription(),new u.Notice("Transcription started. Click stop when finished.")}catch(t){new u.Notice(`Failed to start transcription: ${t.message}`),this.recordingStatusBar?.hide(),this.recordingStatusBar=null}}async stopRecording(){if(!this.audioRecorder?.isRecording())return;let e=this.app.workspace.getActiveFile();if(!e){new u.Notice("No active file to save transcription"),this.cancelRecording();return}this.recordingStatusBar?.showProcessing();try{let t=await this.audioRecorder.stop();await this.processRecording(t,e)}catch(t){new u.Notice(`Transcription failed: ${t.message}`)}finally{this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null}}async cancelRecording(){this.audioRecorder?.isRecording()&&this.audioRecorder.cancel(),this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null,new u.Notice("Transcription cancelled")}startLiveTranscription(){this.stopLiveTranscription();let e=12e4;this.liveTranscriptChunkInterval=setInterval(async()=>{await this.transcribeCurrentChunk()},e),setTimeout(async()=>{this.audioRecorder?.isRecording()&&await this.transcribeCurrentChunk()},3e4),console.log("[Eudia] Live transcription started")}stopLiveTranscription(){this.liveTranscriptChunkInterval&&(clearInterval(this.liveTranscriptChunkInterval),this.liveTranscriptChunkInterval=null),console.log("[Eudia] Live transcription stopped")}async transcribeCurrentChunk(){if(!this.audioRecorder?.isRecording()||this.isTranscribingChunk)return;let e=this.audioRecorder.extractNewChunks();if(!(!e||e.size<5e3)){this.isTranscribingChunk=!0,console.log(`[Eudia] Transcribing chunk: ${e.size} bytes`);try{let t=new FileReader,r=await new Promise((o,c)=>{t.onload=()=>{let d=t.result.split(",")[1];o(d)},t.onerror=c,t.readAsDataURL(e)}),i=this.audioRecorder.getMimeType(),a=await this.transcriptionService.transcribeChunk(r,i);a.success&&a.text&&(this.liveTranscript+=(this.liveTranscript?`

`:"")+a.text,console.log(`[Eudia] Chunk transcribed, total transcript length: ${this.liveTranscript.length}`))}catch(t){console.error("[Eudia] Chunk transcription error:",t)}finally{this.isTranscribingChunk=!1}}}openLiveQueryModal(){let e=new u.Modal(this.app);e.titleEl.setText("Query Live Transcript");let t=e.contentEl;t.addClass("eudia-live-query-modal"),t.createDiv({cls:"eudia-live-query-instructions"}).setText(`Ask a question about what has been discussed so far (${Math.round(this.liveTranscript.length/4)} words captured):`);let r=t.createEl("textarea",{cls:"eudia-live-query-input",attr:{placeholder:'e.g., "What did Tom say about pricing?" or "What were the main concerns raised?"',rows:"3"}}),i=t.createDiv({cls:"eudia-live-query-response"});i.style.display="none";let a=t.createEl("button",{text:"Ask",cls:"eudia-btn-primary"});a.addEventListener("click",async()=>{let o=r.value.trim();if(!o){new u.Notice("Please enter a question");return}a.disabled=!0,a.setText("Searching..."),i.style.display="block",i.setText("Searching transcript..."),i.addClass("eudia-loading");try{let c=await this.transcriptionService.liveQueryTranscript(o,this.liveTranscript,this.getAccountNameFromActiveFile());i.removeClass("eudia-loading"),c.success?i.setText(c.answer):(i.setText(c.error||"Failed to query transcript"),i.addClass("eudia-error"))}catch(c){i.removeClass("eudia-loading"),i.setText(`Error: ${c.message}`),i.addClass("eudia-error")}finally{a.disabled=!1,a.setText("Ask")}}),r.addEventListener("keydown",o=>{o.key==="Enter"&&!o.shiftKey&&(o.preventDefault(),a.click())}),e.open(),r.focus()}getAccountNameFromActiveFile(){let e=this.app.workspace.getActiveFile();if(!e)return;let t=e.path.match(/Accounts\/([^\/]+)\//i);if(t)return t[1]}async processRecording(e,t){let n=e.audioBlob?.size||0;if(console.log(`[Eudia] Audio blob size: ${n} bytes, duration: ${e.duration}s`),n<1e3){new u.Notice("Recording too short or no audio captured. Please try again.");return}try{let c=await $.analyzeAudioBlob(e.audioBlob);console.log(`[Eudia] Audio diagnostic: hasAudio=${c.hasAudio}, peak=${c.peakLevel}, silent=${c.silentPercent}%`),c.warning&&(console.warn(`[Eudia] Audio warning: ${c.warning}`),c.hasAudio?new u.Notice(`Warning: ${c.warning.split(":")[0]}`,5e3):new u.Notice("Warning: Audio appears to be silent. Transcription may not work correctly. Check your microphone settings.",8e3))}catch(c){console.warn("[Eudia] Audio diagnostic failed, continuing anyway:",c)}let r=Math.ceil(e.duration/60),i=Math.max(1,Math.ceil(r/5));new u.Notice(`Transcription started. Estimated ${i}-${i+1} minutes.`);let a=await this.app.vault.read(t),o=`

---
**Transcription in progress...**
Started: ${new Date().toLocaleTimeString()}
Estimated completion: ${i}-${i+1} minutes

*You can navigate away. Check back shortly.*
---
`;await this.app.vault.modify(t,a+o),this.processTranscriptionAsync(e,t).catch(c=>{console.error("Background transcription failed:",c),new u.Notice(`Transcription failed: ${c.message}`)})}async processTranscriptionAsync(e,t){try{let n={},r=t.path.split("/");console.log(`[Eudia] Processing transcription for: ${t.path}`),console.log(`[Eudia] Path parts: ${JSON.stringify(r)}, accountsFolder: ${this.settings.accountsFolder}`);let i=r[0]==="Pipeline Meetings",a=!1;try{let h=(await this.app.vault.read(t)).match(/^---\n([\s\S]*?)\n---/);h&&(a=/meeting_type:\s*pipeline_review/.test(h[1]))}catch{}if(!a&&i&&(a=!0),a){console.log("[Eudia Pipeline] Detected pipeline review meeting, using pipeline prompt");let p="";try{let h=await(0,u.requestUrl)({url:`${this.settings.serverUrl||"https://gtm-brain.onrender.com"}/api/pipeline-context`,method:"GET",headers:{"Content-Type":"application/json"}});h.json?.success&&h.json?.context&&(p=h.json.context,console.log(`[Eudia Pipeline] Loaded Salesforce pipeline context (${p.length} chars)`))}catch(h){console.warn("[Eudia Pipeline] Could not fetch pipeline context:",h)}n={meetingType:"pipeline_review",pipelineContext:p}}else if(r.length>=2&&r[0]===this.settings.accountsFolder){let p=r[1];console.log(`[Eudia] Detected account folder: ${p}`);let h=this.settings.cachedAccounts.find(g=>g.name.toLowerCase()===p.toLowerCase());h?(n={accountName:h.name,accountId:h.id},console.log(`[Eudia] Found cached account: ${h.name} (${h.id})`)):(n={accountName:p,accountId:""},console.log(`[Eudia] Account not in cache, using folder name: ${p}`))}else console.log("[Eudia] File not in Accounts folder, skipping account context");let o=[];try{let p=await this.calendarService.getCurrentMeeting();p.meeting?.attendees&&(o=p.meeting.attendees.map(h=>h.name||h.email.split("@")[0]).filter(Boolean).slice(0,10))}catch{}let c=await this.transcriptionService.transcribeAudio(e.audioBlob,{...n,speakerHints:o}),l=p=>p?!!(p.summary?.trim()||p.nextSteps?.trim()):!1,d=c.sections;if(l(d)||c.text?.trim()&&(d=await this.transcriptionService.processTranscription(c.text,n)),!l(d)&&!c.text?.trim()){let h=(await this.app.vault.read(t)).replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g,"");await this.app.vault.modify(t,h+`

**Transcription failed:** No audio detected.
`),new u.Notice("Transcription failed: No audio detected.");return}let m;a?m=this.buildPipelineNoteContent(d,c,t.path):m=this.buildNoteContent(d,c),await this.app.vault.modify(t,m);let y=Math.floor(e.duration/60);if(new u.Notice(`Transcription complete (${y} min recording)`),!a){let p=d.nextSteps||d.actionItems;console.log(`[Eudia] Next Steps extraction - accountContext: ${n?.accountName||"undefined"}`),console.log(`[Eudia] Next Steps content found: ${p?"YES ("+p.length+" chars)":"NO"}`),console.log(`[Eudia] sections.nextSteps: ${d.nextSteps?"YES":"NO"}, sections.actionItems: ${d.actionItems?"YES":"NO"}`),p&&n?.accountName?(console.log(`[Eudia] Calling updateAccountNextSteps for ${n.accountName}`),await this.updateAccountNextSteps(n.accountName,p,t.path)):console.log("[Eudia] Skipping Next Steps update - missing content or account context")}this.settings.autoSyncAfterTranscription&&await this.syncNoteToSalesforce()}catch(n){try{let i=(await this.app.vault.read(t)).replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g,"");await this.app.vault.modify(t,i+`

**Transcription failed:** ${n.message}
`)}catch{}throw n}}buildPipelineNoteContent(e,t,n){let r=new Date,i=String(r.getMonth()+1).padStart(2,"0"),a=String(r.getDate()).padStart(2,"0"),o=String(r.getFullYear()).slice(-2),c=r.toISOString().split("T")[0],l=`${i}.${a}.${o}`,d=h=>h==null?"":Array.isArray(h)?h.map(String).join(`
`):typeof h=="object"?JSON.stringify(h,null,2):String(h),m=d(e.summary),y=t.transcript||t.text||"",p=`---
title: "Team Pipeline Meeting - ${l}"
date: ${c}
meeting_type: pipeline_review
transcribed: true
---

# Weekly Pipeline Review | ${r.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"})}

`;if(m)p+=m;else{let h=[e.painPoints,e.productInterest,e.nextSteps,e.actionItems].filter(Boolean).map(d).join(`

`);h?p+=h:p+="*Pipeline summary could not be generated. See transcript below.*"}return y&&(p+=`

---

<details>
<summary><strong>Full Transcript</strong> (${Math.ceil(y.length/1e3)}k chars)</summary>

${y}

</details>
`),p}buildNoteContent(e,t){let n=g=>g==null?"":Array.isArray(g)?g.map(v=>typeof v=="object"?v.category?`**${v.category}**: ${v.signal||v.insight||""}`:JSON.stringify(v):String(v)).join(`
`):typeof g=="object"?JSON.stringify(g):String(g),r=n(e.title)||"Meeting Notes",i=n(e.summary),a=n(e.painPoints),o=n(e.productInterest),c=n(e.meddiccSignals),l=n(e.nextSteps),d=n(e.actionItems),m=n(e.keyDates),y=n(e.risksObjections),p=n(e.attendees),h=`---
title: "${r}"
date: ${new Date().toISOString().split("T")[0]}
transcribed: true
sync_to_salesforce: false
clo_meeting: false
source: ""
confidence: ${t.confidence}
---

# ${r}

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

`),m&&!m.includes("No specific dates")&&(h+=`## Key Dates

${m}

`),y&&!y.includes("None raised")&&(h+=`## Risks and Objections

${y}

`),p&&(h+=`## Attendees

${p}

`),this.settings.appendTranscript&&t.text&&(h+=`---

## Full Transcript

${t.text}
`),h}openIntelligenceQuery(){new J(this.app,this).open()}openIntelligenceQueryForCurrentNote(){let e=this.app.workspace.getActiveFile(),t;if(e){let n=this.app.metadataCache.getFileCache(e)?.frontmatter;if(n?.account_id&&n?.account)t={id:n.account_id,name:n.account};else if(n?.account){let r=this.settings.cachedAccounts.find(i=>i.name.toLowerCase()===n.account.toLowerCase());r?t={id:r.id,name:r.name}:t={id:"",name:n.account}}else{let r=e.path.split("/");if(r.length>=2&&r[0]===this.settings.accountsFolder){let i=r[1],a=this.settings.cachedAccounts.find(o=>o.name.replace(/[<>:"/\\|?*]/g,"_").trim()===i);a?t={id:a.id,name:a.name}:t={id:"",name:i}}}}new J(this.app,this,t).open()}async syncAccounts(e=!1){e||new u.Notice("Syncing Salesforce accounts...");try{let n=(await(0,u.requestUrl)({url:`${this.settings.serverUrl}/api/accounts/obsidian`,method:"GET",headers:{Accept:"application/json"}})).json;if(!n.success||!n.accounts){e||new u.Notice("Failed to fetch accounts from server");return}this.settings.cachedAccounts=n.accounts.map(r=>({id:r.id,name:r.name})),this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings(),e||new u.Notice(`Synced ${n.accounts.length} accounts for matching`)}catch(t){e||new u.Notice(`Failed to sync accounts: ${t.message}`)}}async scanLocalAccountFolders(){try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!e||!(e instanceof u.TFolder))return;let t=[];for(let n of e.children)n instanceof u.TFolder&&t.push({id:`local-${n.name.replace(/\s+/g,"-").toLowerCase()}`,name:n.name});this.settings.cachedAccounts=t,this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings()}catch(e){console.error("Failed to scan local account folders:",e)}}async refreshAccountFolders(){if(!this.settings.userEmail)throw new Error("Please configure your email first");let e=new R(this.settings.serverUrl);if((await e.getAccountsForUser(this.settings.userEmail)).length===0)return console.log("[Eudia] No accounts found for user"),0;let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),r=[];if(n&&n instanceof u.TFolder)for(let o of n.children)o instanceof u.TFolder&&r.push(o.name);let i=await e.getNewAccounts(this.settings.userEmail,r);if(i.length===0)return console.log("[Eudia] All account folders exist"),0;console.log(`[Eudia] Creating ${i.length} new account folders`);let a=await this.fetchEnrichmentData(i);return await this.createTailoredAccountFolders(i,a),i.length}async checkAndConsumeSyncFlags(){if(!this.settings.userEmail)return;let e=encodeURIComponent(this.settings.userEmail.toLowerCase().trim()),t=this.settings.serverUrl||"https://gtm-wizard.onrender.com";try{let i=((await(0,u.requestUrl)({url:`${t}/api/admin/users/${e}/sync-flags`,method:"GET"})).json?.flags||[]).filter(o=>!o.consumed_at);if(i.length===0)return;console.log(`[Eudia] Found ${i.length} pending sync flag(s)`);let a=!1;for(let o of i)if(o.flag==="resync_accounts"){a=!0;let c=o.payload||{},l=c.added?.length||0,d=c.removed?.length||0;console.log(`[Eudia] Sync flag: resync_accounts (+${l} / -${d})`)}else o.flag==="update_plugin"?new u.Notice("A plugin update is available. Please download the latest vault."):o.flag==="reset_setup"&&(console.log("[Eudia] Sync flag: reset_setup received"),this.settings.setupCompleted=!1,await this.saveSettings(),new u.Notice("Setup has been reset by admin. Please re-run the setup wizard."));if(a){console.log("[Eudia] Triggering account folder resync from sync flag..."),new u.Notice("Syncing account updates...");let o=await this.syncAccountFolders();o.success?new u.Notice(`Account sync complete: ${o.added} new, ${o.archived} archived`):console.log(`[Eudia] Account resync error: ${o.error}`)}try{await(0,u.requestUrl)({url:`${t}/api/admin/users/${e}/sync-flags/consume`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagIds:i.map(o=>o.id)})}),console.log(`[Eudia] Consumed ${i.length} sync flag(s)`)}catch{console.log("[Eudia] Failed to consume sync flags (will retry next startup)")}}catch{console.log("[Eudia] Sync flag check skipped (endpoint not available)")}}async syncAccountFolders(){if(!this.settings.userEmail)return{success:!1,added:0,archived:0,error:"No email configured"};let e=this.settings.userEmail.toLowerCase().trim();console.log(`[Eudia] Syncing account folders for: ${e}`);try{let t=await fetch(`${this.settings.serverUrl}/api/bl-accounts/${encodeURIComponent(e)}`);if(!t.ok){let S=await t.json().catch(()=>({}));throw new Error(S.error||`Server returned ${t.status}`)}let n=await t.json();if(!n.success||!n.accounts)throw new Error(n.error||"Invalid response from server");let r=n.meta?.userGroup||"bl",i=n.meta?.queryDescription||"accounts",a=n.meta?.region||null;console.log(`[Eudia] User group: ${r}, accounts: ${n.accounts.length} (${i})`),a&&console.log(`[Eudia] Sales Leader region: ${a}`);let o=n.accounts||[],c=n.prospectAccounts||[],l=o.length+c.length;console.log(`[Eudia] Server returned: ${o.length} active + ${c.length} prospects = ${l} total`);let d=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),m=new Map,y=`${this.settings.accountsFolder}/_Prospects`,p=this.app.vault.getAbstractFileByPath(y),h=new Map,g=new Map;if(d&&d instanceof u.TFolder)for(let S of d.children)S instanceof u.TFolder&&!S.name.startsWith("_")&&m.set(S.name.toLowerCase().trim(),S);if(p&&p instanceof u.TFolder)for(let S of p.children)S instanceof u.TFolder?h.set(S.name.toLowerCase().trim(),S):S instanceof u.TFile&&S.extension==="md"&&g.set(S.basename.toLowerCase().trim(),S);let v=new Set(o.map(S=>S.name.toLowerCase().trim())),w=o.filter(S=>{let A=S.name.toLowerCase().trim();return!m.has(A)}),C=c.filter(S=>{let A=S.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();return!h.has(A)&&!g.has(A)&&!m.has(S.name.toLowerCase().trim())}),O=[];for(let S of o){let A=S.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();(h.has(A)||g.has(A))&&!m.has(S.name.toLowerCase().trim())&&O.push(S)}let b=new Set([...o.map(S=>S.name.toLowerCase().trim()),...c.map(S=>S.name.toLowerCase().trim())]),W=[];if(r==="bl")for(let[S,A]of m.entries())b.has(S)||W.push(A);let j=0,E=0,T=0,M=0;if(O.length>0){console.log(`[Eudia] Promoting ${O.length} accounts from prospect to active`);for(let S of O){let A=S.name.replace(/[<>:"/\\|?*]/g,"_").trim(),x=h.get(A.toLowerCase()),k=g.get(A.toLowerCase());try{if(x){let L=`${this.settings.accountsFolder}/${A}`;await this.app.vault.rename(x,L),T++,new u.Notice(`${S.name} promoted to active`)}else if(k){await this.app.vault.delete(k);let L=[{id:S.id,name:S.name,type:S.customerType,isOwned:!0,hadOpportunity:!0}],he=await this.fetchEnrichmentData(L);await this.createTailoredAccountFolders(L,he),T++,new u.Notice(`${S.name} promoted to active -- full account folder created`)}}catch(L){console.error(`[Eudia] Failed to promote ${S.name}:`,L)}}}if(w.length>0){console.log(`[Eudia] Creating ${w.length} new active account folders for ${r}`);let S=new Set(O.map(x=>x.name.toLowerCase().trim())),A=w.filter(x=>!S.has(x.name.toLowerCase().trim()));if(A.length>0){let x=A.map(k=>({id:k.id,name:k.name,type:k.customerType,isOwned:r==="bl",ownerName:k.ownerName,hadOpportunity:!0}));if(r==="admin"||r==="exec")await this.createAdminAccountFolders(x);else{let k=await this.fetchEnrichmentData(x);await this.createTailoredAccountFolders(x,k)}j=A.length}this.telemetry&&this.telemetry.reportInfo("Accounts synced - added",{count:j,userGroup:r,region:a||void 0})}return C.length>0&&r==="bl"&&(console.log(`[Eudia] Creating ${C.length} new prospect files`),M=await this.createProspectAccountFiles(C.map(S=>({id:S.id,name:S.name,type:"Prospect",hadOpportunity:!1,website:S.website,industry:S.industry})))),this.settings.archiveRemovedAccounts&&W.length>0&&(console.log(`[Eudia] Archiving ${W.length} removed account folders`),E=await this.archiveAccountFolders(W),this.telemetry&&this.telemetry.reportInfo("Accounts synced - archived",{count:E})),console.log(`[Eudia] Sync complete: ${j} active added, ${M} prospects added, ${T} promoted, ${E} archived (group: ${r})`),{success:!0,added:j+M+T,archived:E,userGroup:r}}catch(t){return console.error("[Eudia] Account sync error:",t),this.telemetry&&this.telemetry.reportError("Account sync failed",{error:t.message}),{success:!1,added:0,archived:0,error:t.message}}}async archiveAccountFolders(e){let t=0,n=`${this.settings.accountsFolder}/_Archived`;this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);for(let i of e)try{let a=`${n}/${i.name}`;if(this.app.vault.getAbstractFileByPath(a)){let d=new Date().toISOString().split("T")[0];await this.app.fileManager.renameFile(i,`${n}/${i.name}_${d}`)}else await this.app.fileManager.renameFile(i,a);let c=`${n}/${i.name}/_archived.md`,l=`---
archived_date: ${new Date().toISOString()}
reason: Account no longer in book of business
---

This account folder was archived because it no longer appears in your Salesforce book of business.

To restore, move this folder back to the Accounts directory.
`;try{await this.app.vault.create(c,l)}catch{}t++,console.log(`[Eudia] Archived: ${i.name}`)}catch(a){console.error(`[Eudia] Failed to archive ${i.name}:`,a)}return t}async syncSpecificNoteToSalesforce(e){let t=await this.app.vault.read(e),n=this.app.metadataCache.getFileCache(e)?.frontmatter;if(!n?.sync_to_salesforce)return{success:!1,error:"sync_to_salesforce not enabled"};let r=n.account_id,i=n.account;if(!r&&i){let a=this.settings.cachedAccounts.find(o=>o.name.toLowerCase()===i.toLowerCase());a&&(r=a.id)}if(!r){let a=e.path.split("/");if(a.length>=2&&a[0]===this.settings.accountsFolder){let o=a[1]==="_Prospects"&&a.length>=3?a[2]:a[1],c=this.settings.cachedAccounts.find(l=>l.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);c&&(r=c.id,i=c.name)}}if(!r)return{success:!1,error:`Could not determine account for ${e.path}`};try{let a=await(0,u.requestUrl)({url:`${this.settings.serverUrl}/api/notes/sync`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:r,accountName:i,noteTitle:e.basename,notePath:e.path,content:t,frontmatter:n,syncedAt:new Date().toISOString(),userEmail:this.settings.userEmail})});return a.json?.success?{success:!0}:{success:!1,error:a.json?.error||"Unknown error",authRequired:a.json?.authRequired}}catch(a){return{success:!1,error:a.message}}}async syncNoteToSalesforce(){let e=this.app.workspace.getActiveFile();if(!e){new u.Notice("No active file to sync");return}if(!this.app.metadataCache.getFileCache(e)?.frontmatter?.sync_to_salesforce){new u.Notice("Set sync_to_salesforce: true in frontmatter to enable sync");return}new u.Notice("Syncing to Salesforce...");let n=await this.syncSpecificNoteToSalesforce(e);n.success?new u.Notice("Synced to Salesforce"):n.authRequired?new u.Notice("Salesforce authentication required. Please reconnect."):new u.Notice("Failed to sync: "+(n.error||"Unknown error"))}async checkAndAutoEnrich(){let e=this.settings.accountsFolder||"Accounts",t=this.app.vault.getAbstractFileByPath(e);if(!t||!(t instanceof u.TFolder))return;let n=[];for(let r of t.children){if(!(r instanceof u.TFolder)||r.name.startsWith("_"))continue;let i=`${r.path}/Contacts.md`,a=this.app.vault.getAbstractFileByPath(i);if(!(!a||!(a instanceof u.TFile))){if(this.app.metadataCache.getFileCache(a)?.frontmatter?.enriched_at)continue}let o=r.name,c=this.settings.cachedAccounts.find(l=>l.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);c&&c.id&&n.push({id:c.id,name:c.name,owner:"",ownerEmail:""})}if(n.length===0){console.log("[Eudia] Auto-enrich: all account folders already enriched");return}console.log(`[Eudia] Auto-enrich: ${n.length} accounts need enrichment`);try{await this.enrichAccountFolders(n)}catch(r){console.error("[Eudia] Auto-enrich failed:",r)}}async enrichAccountFolders(e){if(!e||e.length===0)return;let t=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=this.settings.accountsFolder||"Accounts",r=e.filter(d=>d.id&&d.id.startsWith("001"));if(r.length===0)return;let i=r.length,a=0,o=0;console.log(`[Eudia Enrich] Starting enrichment for ${i} accounts`),new u.Notice(`Enriching account data: 0/${i}...`);let c=20;for(let d=0;d<r.length;d+=c){let m=r.slice(d,d+c),y=m.map(h=>h.id);try{let h=await(0,u.requestUrl)({url:`${t}/api/accounts/enrich-batch`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountIds:y,userEmail:this.settings.userEmail})});if(h.json?.success&&h.json?.enrichments){let g=h.json.enrichments;for(let v of m){let w=g[v.id];if(w)try{await this.writeEnrichmentToAccount(v,w,n),a++}catch(C){o++,console.error(`[Eudia Enrich] Write failed for ${v.name}:`,C)}}}}catch(h){o+=m.length,console.error("[Eudia Enrich] Batch fetch failed:",h)}let p=Math.min(d+c,i);new u.Notice(`Enriching account data: ${p}/${i}...`),d+c<r.length&&await new Promise(h=>setTimeout(h,100))}let l=o>0?`Enrichment complete: ${a} enriched, ${o} skipped`:`Enrichment complete: ${a} accounts enriched with Salesforce data`;console.log(`[Eudia Enrich] ${l}`),new u.Notice(l)}async writeEnrichmentToAccount(e,t,n){let r=e.name.replace(/[<>:"/\\|?*]/g,"_").trim(),i=`${n}/${r}`,a=this.app.vault.getAbstractFileByPath(i);if(a instanceof u.TFolder||(i=`${n}/_Prospects/${r}`,a=this.app.vault.getAbstractFileByPath(i)),!(a instanceof u.TFolder))return;let o=new Date().toISOString(),c=async(l,d)=>{let m=`${i}/${l}`,y=this.app.vault.getAbstractFileByPath(m);if(!(y instanceof u.TFile))return;let p=await this.app.vault.read(y),h="",g=p;if(p.startsWith("---")){let O=p.indexOf("---",3);O!==-1&&(h=p.substring(0,O+3),g=p.substring(O+3),h.includes("enriched_at:")?h=h.replace(/enriched_at:.*/,`enriched_at: "${o}"`):h=h.substring(0,O)+`enriched_at: "${o}"
---`)}let v=g.match(/^(\s*#[^\n]+)/),C=`${v?v[1]:""}

${d}
`;await this.app.vault.modify(y,`${h}
${C}`)};if(t.contacts&&await c("Contacts.md",`${t.contacts}

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*`),t.intelligence&&await c("Intelligence.md",t.intelligence),t.nextSteps&&await c("Next Steps.md",t.nextSteps),t.opportunities||t.recentActivity){let l=`${i}/Meeting Notes.md`,d=this.app.vault.getAbstractFileByPath(l);if(d instanceof u.TFile){let m=await this.app.vault.read(d),y="",p=m;if(m.startsWith("---")){let w=m.indexOf("---",3);w!==-1&&(y=m.substring(0,w+3),p=m.substring(w+3),y.includes("enriched_at:")?y=y.replace(/enriched_at:.*/,`enriched_at: "${o}"`):y=y.substring(0,w)+`enriched_at: "${o}"
---`)}let h=p.match(/^(\s*#[^\n]+)/),v=[h?h[1]:`
# ${e.name} - Meeting Notes`,""];t.opportunities&&v.push(t.opportunities,""),t.recentActivity&&v.push(t.recentActivity,""),v.push("## Quick Start","","1. Open **Note 1** for your next meeting","2. Click the **microphone** to record and transcribe","3. **Next Steps** are auto-extracted after transcription","4. Set `sync_to_salesforce: true` to sync to Salesforce"),await this.app.vault.modify(d,`${y}
${v.join(`
`)}
`)}}}startSalesforceSyncScanner(){if(!this.settings.sfAutoSyncEnabled){console.log("[Eudia SF Sync] Auto-sync is disabled in settings"),this.updateSfSyncStatusBar("SF Sync: Off");return}let e=(this.settings.sfAutoSyncIntervalMinutes||15)*60*1e3;console.log(`[Eudia SF Sync] Starting scanner \u2014 interval: ${this.settings.sfAutoSyncIntervalMinutes}min`),this.updateSfSyncStatusBar("SF Sync: Idle");let t=window.setTimeout(()=>{this.runSalesforceSyncScan()},3e4);this.registerInterval(t),this.sfSyncIntervalId=window.setInterval(()=>{this.runSalesforceSyncScan()},e),this.registerInterval(this.sfSyncIntervalId)}async runSalesforceSyncScan(){if(!(!this.settings.sfAutoSyncEnabled||!this.settings.userEmail)){console.log("[Eudia SF Sync] Running scan...");try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!(e instanceof u.TFolder)){console.log("[Eudia SF Sync] Accounts folder not found");return}let t=[],n=d=>{for(let m of d.children)m instanceof u.TFile&&m.extension==="md"?t.push(m):m instanceof u.TFolder&&n(m)};n(e);let r=[];for(let d of t){let y=this.app.metadataCache.getFileCache(d)?.frontmatter;if(!y?.sync_to_salesforce)continue;let p=y.last_sf_sync?new Date(y.last_sf_sync).getTime():0;d.stat.mtime>p&&r.push(d)}if(r.length===0){console.log("[Eudia SF Sync] No flagged notes need syncing"),this.updateSfSyncStatusBar("SF Sync: Idle");return}console.log(`[Eudia SF Sync] ${r.length} note(s) queued for sync`),this.updateSfSyncStatusBar(`SF Sync: Syncing ${r.length}...`);let i=0,a=0;for(let d of r){let m=await this.syncSpecificNoteToSalesforce(d);if(m.success)i++,await this.updateNoteSyncTimestamp(d);else if(a++,console.log(`[Eudia SF Sync] Failed to sync ${d.path}: ${m.error}`),m.authRequired){new u.Notice("Salesforce authentication expired. Please reconnect to resume auto-sync."),this.updateSfSyncStatusBar("SF Sync: Auth required");return}}let c=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}),l=a>0?`SF Sync: ${i} synced, ${a} failed at ${c}`:`SF Sync: ${i} note${i!==1?"s":""} synced at ${c}`;console.log(`[Eudia SF Sync] ${l}`),this.updateSfSyncStatusBar(l),i>0&&new u.Notice(l)}catch(e){console.error("[Eudia SF Sync] Scan error:",e),this.updateSfSyncStatusBar("SF Sync: Error")}}}async updateNoteSyncTimestamp(e){try{let t=await this.app.vault.read(e),n=new Date().toISOString();if(t.startsWith("---")){let r=t.indexOf("---",3);if(r!==-1){let i=t.substring(0,r),a=t.substring(r);if(i.includes("last_sf_sync:")){let o=i.replace(/last_sf_sync:.*/,`last_sf_sync: "${n}"`)+a;await this.app.vault.modify(e,o)}else{let o=i+`last_sf_sync: "${n}"
`+a;await this.app.vault.modify(e,o)}}}}catch(t){console.error(`[Eudia SF Sync] Failed to update sync timestamp for ${e.path}:`,t)}}updateSfSyncStatusBar(e){this.sfSyncStatusBarEl&&this.sfSyncStatusBarEl.setText(e)}async createMeetingNote(){return new Promise(e=>{new te(this.app,this,async n=>{if(!n){e();return}let r=new Date().toISOString().split("T")[0],i=n.name.replace(/[<>:"/\\|?*]/g,"_").trim(),a=`${this.settings.accountsFolder}/${i}`,o=`${r} Meeting.md`,c=`${a}/${o}`;this.app.vault.getAbstractFileByPath(a)||await this.app.vault.createFolder(a);let l=`---
title: "Meeting with ${n.name}"
date: ${r}
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

`,d=await this.app.vault.create(c,l);await this.app.workspace.getLeaf().openFile(d),new u.Notice(`Created meeting note for ${n.name}`),e()}).open()})}async fetchAndInsertContext(){new u.Notice("Fetching pre-call context...")}async refreshAnalyticsDashboard(e){if(!this.settings.userEmail){console.log("[Eudia] Cannot refresh analytics - no email configured");return}let n=(await this.app.vault.read(e)).match(/^---\n([\s\S]*?)\n---/);if(!n)return;let r=n[1];if(!r.includes("type: analytics_dashboard"))return;let i=r.match(/category:\s*(\w+)/)?.[1]||"team";console.log(`[Eudia] Refreshing analytics dashboard: ${e.name} (${i})`);try{let a=null,o=this.settings.serverUrl,c=encodeURIComponent(this.settings.userEmail);switch(i){case"pain_points":a=(await(0,u.requestUrl)({url:`${o}/api/analytics/pain-points?days=30`,method:"GET"})).json,a.success&&await this.updatePainPointNote(e,a.painPoints);break;case"objections":a=(await(0,u.requestUrl)({url:`${o}/api/analytics/objection-playbook?days=90`,method:"GET"})).json,a.success&&await this.updateObjectionNote(e,a);break;case"coaching":case"team":default:a=(await(0,u.requestUrl)({url:`${o}/api/analytics/team-trends?managerId=${c}`,method:"GET"})).json,a.success&&await this.updateTeamPerformanceNote(e,a.trends);break}a?.success&&new u.Notice(`Analytics refreshed: ${e.name}`)}catch(a){console.error("[Eudia] Analytics refresh error:",a)}}async updatePainPointNote(e,t){if(!t||t.length===0)return;let n=new Date().toISOString().split("T")[0],r=t.slice(0,10).map(l=>`| ${l.painPoint||"--"} | ${l.count||0} | ${l.category||"--"} | ${l.averageSeverity||"medium"} |`).join(`
`),i={};for(let l of t){let d=l.category||"other";i[d]||(i[d]=[]),i[d].push(l)}let a="";for(let[l,d]of Object.entries(i)){a+=`
### ${l.charAt(0).toUpperCase()+l.slice(1)}
`;for(let m of d.slice(0,3))a+=`- ${m.painPoint}
`}let o=t.filter(l=>l.exampleQuotes&&l.exampleQuotes.length>0).slice(0,5).map(l=>`> "${l.exampleQuotes[0]}" - on ${l.painPoint}`).join(`

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
${r}

---

## By Category
${a}

---

## Example Quotes

${o||"*No quotes available*"}

---

> **Tip:** Use these pain points to prepare for customer calls.
`;await this.app.vault.modify(e,c)}async updateObjectionNote(e,t){if(!t.objections||t.objections.length===0)return;let n=new Date().toISOString().split("T")[0],r=t.objections.slice(0,10).map(o=>{let c=o.handleRatePercent>=75?"\u2705 Strong":o.handleRatePercent>=50?"\u26A0\uFE0F Moderate":"\u274C Needs Work";return`| ${o.objection?.substring(0,40)||"--"}... | ${o.count||0} | ${o.handleRatePercent||0}% | ${c} |`}).join(`
`),i="";for(let o of t.objections.slice(0,5))if(o.bestResponses&&o.bestResponses.length>0){i+=`
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
${r}

---

## Best Practices
${i||"*No best practices available yet*"}

---

## Coaching Notes

*Objections with <50% handle rate need training focus*

Average handle rate: ${t.avgHandleRate||0}%

---

> **Tip:** Review this playbook before important calls.
`;await this.app.vault.modify(e,a)}async updateTeamPerformanceNote(e,t){if(!t)return;let n=new Date().toISOString().split("T")[0],r=a=>a>0?`\u2191 ${Math.abs(a).toFixed(1)}%`:a<0?`\u2193 ${Math.abs(a).toFixed(1)}%`:"--",i=`---
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
| Calls Analyzed | ${t.callCount||0} | -- |
| Avg Score | ${t.avgScore?.toFixed(1)||"--"} | ${r(t.scoreTrend)} |
| Talk Ratio | ${t.avgTalkRatio?Math.round(t.avgTalkRatio*100):"--"}% | ${r(t.talkRatioTrend)} |
| Value Score | ${t.avgValueScore?.toFixed(1)||"--"} | ${r(t.valueScoreTrend)} |
| Next Step Rate | ${t.nextStepRate?Math.round(t.nextStepRate*100):"--"}% | -- |

---

## Top Pain Points

${t.topPainPoints?.slice(0,5).map(a=>`- **${a.painPoint}** (${a.count} mentions)`).join(`
`)||"*No pain points captured yet*"}

---

## Trending Topics

${t.trendingTopics?.slice(0,8).map(a=>`- ${a.topic} (${a.count})`).join(`
`)||"*No topics captured yet*"}

---

## Top Objections

${t.topObjections?.slice(0,5).map(a=>`- ${a.objection} - ${a.handleRatePercent}% handled`).join(`
`)||"*No objections captured yet*"}

---

> **Note:** This dashboard refreshes automatically when you open it.
> Data is aggregated from all analyzed calls in your region.
`;await this.app.vault.modify(e,i)}},ie=class extends u.PluginSettingTab{constructor(s,e){super(s,e),this.plugin=e}display(){let{containerEl:s}=this;s.empty(),s.createEl("h2",{text:"Eudia Sync & Scribe"}),s.createEl("h3",{text:"Your Profile"});let e=s.createDiv();e.style.cssText="padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px; margin-top: 16px;";let t=e.createDiv();t.style.cssText="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";let n=t.createSpan(),r=t.createSpan(),i=e.createDiv();i.style.cssText="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;",i.setText("Connect with Salesforce to sync notes with your user attribution.");let a=e.createEl("button");a.style.cssText="padding: 10px 20px; cursor: pointer; border-radius: 6px;";let o=null,c=async()=>{if(!this.plugin.settings.userEmail)return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);",r.setText("Enter email above first"),a.setText("Setup Required"),a.disabled=!0,a.style.opacity="0.5",a.style.cursor="not-allowed",!1;a.disabled=!1,a.style.opacity="1",a.style.cursor="pointer";try{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); animation: pulse 1s infinite;",r.setText("Checking..."),(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;",r.setText("Connected to Salesforce"),a.setText("Reconnect"),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),!0):(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;",r.setText("Not connected"),a.setText("Connect to Salesforce"),!1)}catch{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;",r.setText("Status unavailable"),a.setText("Connect to Salesforce"),!1}};new u.Setting(s).setName("Eudia Email").setDesc("Your @eudia.com email address for calendar and Salesforce sync").addText(p=>p.setPlaceholder("yourname@eudia.com").setValue(this.plugin.settings.userEmail).onChange(async h=>{let g=h.trim().toLowerCase();this.plugin.settings.userEmail=g,await this.plugin.saveSettings(),await c()})),new u.Setting(s).setName("Timezone").setDesc("Your local timezone for calendar event display").addDropdown(p=>{me.forEach(h=>{p.addOption(h.value,h.label)}),p.setValue(this.plugin.settings.timezone),p.onChange(async h=>{this.plugin.settings.timezone=h,await this.plugin.saveSettings(),this.plugin.calendarService?.setTimezone(h),new u.Notice(`Timezone set to ${me.find(g=>g.value===h)?.label||h}`)})}),s.createEl("h3",{text:"Salesforce Connection"}),s.appendChild(e);let l=()=>{o&&window.clearInterval(o);let p=0,h=30;o=window.setInterval(async()=>{p++,await c()?(o&&(window.clearInterval(o),o=null),new u.Notice("Salesforce connected successfully!")):p>=h&&o&&(window.clearInterval(o),o=null)},5e3)};a.onclick=async()=>{if(!this.plugin.settings.userEmail){new u.Notice("Please enter your email first");return}let p=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(p,"_blank"),new u.Notice("Complete the Salesforce login in the popup window",5e3),l()},c(),s.createEl("h3",{text:"Server"}),new u.Setting(s).setName("GTM Brain Server").setDesc("Server URL for calendar, accounts, and sync").addText(p=>p.setValue(this.plugin.settings.serverUrl).onChange(async h=>{this.plugin.settings.serverUrl=h,await this.plugin.saveSettings()}));let d=s.createDiv({cls:"settings-advanced-collapsed"}),m=d.createDiv({cls:"eudia-transcription-status"});m.style.cssText="padding: 12px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;",m.innerHTML='<span style="color: var(--text-muted);">Checking server transcription status...</span>',(async()=>{try{(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/plugin/config`,method:"GET"})).json?.capabilities?.serverTranscription?m.innerHTML='<span class="eudia-check-icon"></span> Server transcription is available. No local API key needed.':m.innerHTML='<span class="eudia-warn-icon"></span> Server transcription unavailable. Add a local API key below.'}catch{m.innerHTML='<span style="color: #f59e0b;">\u26A0</span> Could not check server status. Local API key recommended as backup.'}})();let y=new u.Setting(s).setName("Advanced Options").setDesc("Show fallback API key (usually not needed)").addToggle(p=>p.setValue(!1).onChange(h=>{d.style.display=h?"block":"none"}));d.style.display="none",s.createEl("h3",{text:"Transcription"}),new u.Setting(s).setName("Save Audio Files").setDesc("Keep original audio recordings").addToggle(p=>p.setValue(this.plugin.settings.saveAudioFiles).onChange(async h=>{this.plugin.settings.saveAudioFiles=h,await this.plugin.saveSettings()})),new u.Setting(s).setName("Append Full Transcript").setDesc("Include complete transcript in notes").addToggle(p=>p.setValue(this.plugin.settings.appendTranscript).onChange(async h=>{this.plugin.settings.appendTranscript=h,await this.plugin.saveSettings()})),s.createEl("h3",{text:"Sync"}),new u.Setting(s).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle(p=>p.setValue(this.plugin.settings.syncOnStartup).onChange(async h=>{this.plugin.settings.syncOnStartup=h,await this.plugin.saveSettings()})),new u.Setting(s).setName("Auto-Sync After Transcription").setDesc("Push notes to Salesforce after transcription").addToggle(p=>p.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async h=>{this.plugin.settings.autoSyncAfterTranscription=h,await this.plugin.saveSettings()})),new u.Setting(s).setName("Auto-Sync Flagged Notes").setDesc("Periodically push notes with sync_to_salesforce: true to Salesforce").addToggle(p=>p.setValue(this.plugin.settings.sfAutoSyncEnabled).onChange(async h=>{this.plugin.settings.sfAutoSyncEnabled=h,await this.plugin.saveSettings(),h?this.plugin.startSalesforceSyncScanner():this.plugin.updateSfSyncStatusBar("SF Sync: Off")})),new u.Setting(s).setName("Auto-Sync Interval").setDesc("How often to scan for flagged notes (in minutes)").addDropdown(p=>{p.addOption("5","Every 5 minutes"),p.addOption("15","Every 15 minutes"),p.addOption("30","Every 30 minutes"),p.setValue(String(this.plugin.settings.sfAutoSyncIntervalMinutes)),p.onChange(async h=>{this.plugin.settings.sfAutoSyncIntervalMinutes=parseInt(h),await this.plugin.saveSettings(),new u.Notice(`SF auto-sync interval set to ${h} minutes. Restart Obsidian for changes to take effect.`)})}),s.createEl("h3",{text:"Folders"}),new u.Setting(s).setName("Accounts Folder").setDesc("Where account folders are stored").addText(p=>p.setValue(this.plugin.settings.accountsFolder).onChange(async h=>{this.plugin.settings.accountsFolder=h||"Accounts",await this.plugin.saveSettings()})),new u.Setting(s).setName("Recordings Folder").setDesc("Where audio files are saved").addText(p=>p.setValue(this.plugin.settings.recordingsFolder).onChange(async h=>{this.plugin.settings.recordingsFolder=h||"Recordings",await this.plugin.saveSettings()})),s.createEl("h3",{text:"Actions"}),new u.Setting(s).setName("Sync Accounts Now").setDesc(`${this.plugin.settings.cachedAccounts.length} accounts available for matching`).addButton(p=>p.setButtonText("Sync").setCta().onClick(async()=>{await this.plugin.syncAccounts(),this.display()})),new u.Setting(s).setName("Refresh Account Folders").setDesc("Check for new account assignments and create folders for them").addButton(p=>p.setButtonText("Refresh Folders").onClick(async()=>{p.setButtonText("Checking..."),p.setDisabled(!0);try{let h=await this.plugin.refreshAccountFolders();h>0?new u.Notice(`Created ${h} new account folder${h>1?"s":""}`):new u.Notice("All account folders are up to date")}catch(h){new u.Notice("Failed to refresh folders: "+h.message)}p.setButtonText("Refresh Folders"),p.setDisabled(!1),this.display()})),this.plugin.settings.lastSyncTime&&s.createEl("p",{text:`Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()}`,cls:"setting-item-description"}),s.createEl("p",{text:`Audio transcription: ${$.isSupported()?"Supported":"Not supported"}`,cls:"setting-item-description"})}};
