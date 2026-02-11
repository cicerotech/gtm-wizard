var le=Object.create;var H=Object.defineProperty;var ue=Object.getOwnPropertyDescriptor;var pe=Object.getOwnPropertyNames;var me=Object.getPrototypeOf,he=Object.prototype.hasOwnProperty;var ge=(f,a)=>{for(var e in a)H(f,e,{get:a[e],enumerable:!0})},te=(f,a,e,t)=>{if(a&&typeof a=="object"||typeof a=="function")for(let n of pe(a))!he.call(f,n)&&n!==e&&H(f,n,{get:()=>a[n],enumerable:!(t=ue(a,n))||t.enumerable});return f};var ne=(f,a,e)=>(e=f!=null?le(me(f)):{},te(a||!f||!f.__esModule?H(e,"default",{value:f,enumerable:!0}):e,f)),ye=f=>te(H({},"__esModule",{value:!0}),f);var Pe={};ge(Pe,{default:()=>z});module.exports=ye(Pe);var u=require("obsidian");var E=class f{constructor(){this.mediaRecorder=null;this.audioChunks=[];this.stream=null;this.startTime=0;this.pausedDuration=0;this.pauseStartTime=0;this.durationInterval=null;this.audioContext=null;this.analyser=null;this.levelInterval=null;this.lastExtractedChunkIndex=0;this.mimeTypeCache="audio/webm";this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0};this.stateCallback=null;this.levelHistory=[];this.trackingLevels=!1}onStateChange(a){this.stateCallback=a}static isIOSOrSafari(){let a=navigator.userAgent,e=/iPad|iPhone|iPod/.test(a)&&!window.MSStream,t=/^((?!chrome|android).)*safari/i.test(a);return e||t}getSupportedMimeType(){let a=f.isIOSOrSafari(),e=a?["audio/mp4","audio/mp4;codecs=aac","audio/aac","audio/webm;codecs=opus","audio/webm"]:["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];for(let t of e)if(MediaRecorder.isTypeSupported(t))return console.log(`[AudioRecorder] Using MIME type: ${t} (iOS/Safari: ${a})`),t;return a?"audio/mp4":"audio/webm"}async startRecording(){if(this.state.isRecording)throw new Error("Already recording");try{let a=f.isIOSOrSafari(),e=a?{echoCancellation:!0,noiseSuppression:!0}:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0,sampleRate:48e3,channelCount:1};this.stream=await navigator.mediaDevices.getUserMedia({audio:e}),console.log(`[AudioRecorder] Microphone access granted (iOS/Safari: ${a})`),this.setupAudioAnalysis();let t=this.getSupportedMimeType();this.mimeTypeCache=t,this.mediaRecorder=new MediaRecorder(this.stream,{mimeType:t,audioBitsPerSecond:96e3}),this.audioChunks=[],this.lastExtractedChunkIndex=0,this.mediaRecorder.ondataavailable=n=>{n.data.size>0&&this.audioChunks.push(n.data)},this.mediaRecorder.start(1e3),this.startTime=Date.now(),this.pausedDuration=0,this.state={isRecording:!0,isPaused:!1,duration:0,audioLevel:0},this.startDurationTracking(),this.startLevelTracking(),this.notifyStateChange()}catch(a){throw this.cleanup(),new Error(`Failed to start recording: ${a.message}`)}}setupAudioAnalysis(){if(this.stream)try{this.audioContext=new AudioContext;let a=this.audioContext.createMediaStreamSource(this.stream);this.analyser=this.audioContext.createAnalyser(),this.analyser.fftSize=256,a.connect(this.analyser)}catch(a){console.warn("Failed to set up audio analysis:",a)}}startDurationTracking(){this.durationInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused){let a=Date.now()-this.startTime-this.pausedDuration;this.state.duration=Math.floor(a/1e3),this.notifyStateChange()}},100)}startLevelTracking(){if(!this.analyser)return;let a=new Uint8Array(this.analyser.frequencyBinCount);this.levelInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused&&this.analyser){this.analyser.getByteFrequencyData(a);let e=0;for(let n=0;n<a.length;n++)e+=a[n];let t=e/a.length;this.state.audioLevel=Math.min(100,Math.round(t/255*100*2)),this.notifyStateChange()}},50)}pauseRecording(){!this.state.isRecording||this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="recording"&&(this.mediaRecorder.pause(),this.pauseStartTime=Date.now(),this.state.isPaused=!0,this.notifyStateChange())}resumeRecording(){!this.state.isRecording||!this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="paused"&&(this.mediaRecorder.resume(),this.pausedDuration+=Date.now()-this.pauseStartTime,this.state.isPaused=!1,this.notifyStateChange())}async stopRecording(){return new Promise((a,e)=>{if(!this.mediaRecorder||!this.state.isRecording){e(new Error("Not currently recording"));return}let t=this.mediaRecorder.mimeType,n=this.state.duration,s=!1,r=setTimeout(()=>{if(!s){s=!0,console.warn("AudioRecorder: onstop timeout, forcing completion");try{let i=new Blob(this.audioChunks,{type:t}),o=new Date,c=o.toISOString().split("T")[0],d=o.toTimeString().split(" ")[0].replace(/:/g,"-"),l=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm",h=`recording-${c}-${d}.${l}`;this.cleanup(),a({audioBlob:i,duration:n,mimeType:t,filename:h})}catch{this.cleanup(),e(new Error("Failed to process recording after timeout"))}}},1e4);this.mediaRecorder.onstop=()=>{if(!s){s=!0,clearTimeout(r);try{console.log(`[AudioRecorder] Chunks collected: ${this.audioChunks.length}`);let i=new Blob(this.audioChunks,{type:t});console.log(`[AudioRecorder] Blob size: ${i.size} bytes`);let o=new Date,c=o.toISOString().split("T")[0],d=o.toTimeString().split(" ")[0].replace(/:/g,"-"),l=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm",h=`recording-${c}-${d}.${l}`;this.cleanup(),a({audioBlob:i,duration:n,mimeType:t,filename:h})}catch(i){this.cleanup(),e(i)}}},this.mediaRecorder.onerror=i=>{s||(s=!0,clearTimeout(r),this.cleanup(),e(new Error("Recording error occurred")))},this.mediaRecorder.state==="recording"&&this.mediaRecorder.requestData(),setTimeout(()=>{this.mediaRecorder&&this.mediaRecorder.state!=="inactive"&&this.mediaRecorder.stop()},100)})}cancelRecording(){this.cleanup()}cleanup(){this.durationInterval&&(clearInterval(this.durationInterval),this.durationInterval=null),this.levelInterval&&(clearInterval(this.levelInterval),this.levelInterval=null),this.audioContext&&(this.audioContext.close().catch(()=>{}),this.audioContext=null,this.analyser=null),this.stream&&(this.stream.getTracks().forEach(a=>a.stop()),this.stream=null),this.mediaRecorder=null,this.audioChunks=[],this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0},this.notifyStateChange()}getState(){return{...this.state}}static isSupported(){if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder)return!1;let e=["audio/webm","audio/mp4","audio/ogg","audio/webm;codecs=opus"].some(t=>MediaRecorder.isTypeSupported(t));return e||console.warn("[AudioRecorder] No supported audio formats found"),e}static getMobileInstructions(){return this.isIOSOrSafari()?"For best results on iOS, ensure you have granted microphone permissions in Settings > Privacy > Microphone.":null}notifyStateChange(){this.stateCallback&&this.stateCallback({...this.state})}static formatDuration(a){let e=Math.floor(a/60),t=a%60;return`${e.toString().padStart(2,"0")}:${t.toString().padStart(2,"0")}`}static async blobToBase64(a){return new Promise((e,t)=>{let n=new FileReader;n.onload=()=>{let r=n.result.split(",")[1];e(r)},n.onerror=t,n.readAsDataURL(a)})}static async blobToArrayBuffer(a){return a.arrayBuffer()}async start(){return this.startRecording()}async stop(){return this.stopRecording()}pause(){return this.pauseRecording()}resume(){return this.resumeRecording()}cancel(){return this.cancelRecording()}isRecording(){return this.state.isRecording}extractNewChunks(){if(!this.state.isRecording||this.audioChunks.length===0)return null;let a=this.audioChunks.slice(this.lastExtractedChunkIndex);return a.length===0?null:(this.lastExtractedChunkIndex=this.audioChunks.length,new Blob(a,{type:this.mimeTypeCache}))}getAllChunksAsBlob(){return this.audioChunks.length===0?null:new Blob(this.audioChunks,{type:this.mimeTypeCache})}getDuration(){return this.state.duration}getMimeType(){return this.mimeTypeCache}startLevelHistoryTracking(){this.levelHistory=[],this.trackingLevels=!0}recordLevelSample(){this.trackingLevels&&this.levelHistory.push(this.state.audioLevel)}getAudioDiagnostic(){if(this.levelHistory.length===0)return{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:100,warning:"Unable to analyze audio levels - recording may be too short"};let a=this.levelHistory.reduce((r,i)=>r+i,0)/this.levelHistory.length,e=Math.max(...this.levelHistory),t=this.levelHistory.filter(r=>r<5).length,n=Math.round(t/this.levelHistory.length*100),s=null;return e<5?s="SILENT AUDIO: No audio was detected during recording. Check your microphone settings and ensure Obsidian has microphone permission.":a<10&&n>80?s="VERY LOW AUDIO: Audio levels were extremely low. The transcription may not be accurate. Check your microphone or move closer to it.":n>90&&(s="MOSTLY SILENT: Over 90% of the recording had no audio. Make sure you're capturing the meeting audio, not just silence."),{hasAudio:e>=5,averageLevel:Math.round(a),peakLevel:e,silentPercent:n,warning:s}}static async analyzeAudioBlob(a){try{let e=new AudioContext,t=await a.arrayBuffer(),n;try{n=await e.decodeAudioData(t)}catch{return await e.close(),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:"Could not analyze audio format. Proceeding with transcription."}}let s=n.getChannelData(0),r=0,i=0,o=0,c=.01,d=100,l=0;for(let w=0;w<s.length;w+=d){let S=Math.abs(s[w]);r+=S,S>i&&(i=S),S<c&&o++,l++}await e.close();let h=r/l,g=Math.round(o/l*100),m=Math.round(h*100*10),p=Math.round(i*100),y=null;return i<.01?y='SILENT AUDIO DETECTED: The recording appears to contain only silence. This typically causes Whisper to hallucinate random text like "Yes. Yes. Yes." Check your audio input source.':h<.005&&g>95?y="NEAR-SILENT AUDIO: The recording is almost entirely silent. The transcription will likely be inaccurate.":g>90&&(y="MOSTLY SILENT: Over 90% of the recording is silent. Consider checking your audio setup."),{hasAudio:i>=.01,averageLevel:m,peakLevel:p,silentPercent:g,warning:y}}catch(e){return console.error("Audio analysis failed:",e),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:null}}}};var k=require("obsidian");var V=class{constructor(){this.salesforceAccounts=[]}setAccounts(a){this.salesforceAccounts=a}detectAccount(a,e,t){if(a){let n=this.detectFromTitle(a);if(n.confidence>=70)return n}if(t){let n=this.detectFromFilePath(t);if(n.confidence>=70)return n}if(e&&e.length>0){let n=this.detectFromAttendees(e);if(n.confidence>=50)return n}return{account:null,accountId:null,confidence:0,source:"none",evidence:"No account detected from available context"}}detectFromTitle(a){if(!a)return{account:null,accountId:null,confidence:0,source:"title",evidence:"No title"};let e=[{regex:/^([A-Za-z0-9][^-–—]+?)\s*[-–—]\s*(?:[A-Z][a-z]+|[A-Za-z]{2,})/,confidence:85},{regex:/(?:call|meeting|sync|check-in|demo|discovery)\s+(?:with|re:?|@)\s+([^-–—]+?)(?:\s*[-–—]|$)/i,confidence:80},{regex:/^([A-Za-z][^-–—]+?)\s+(?:discovery|demo|review|kickoff|intro|onboarding|sync)\s*(?:call)?$/i,confidence:75},{regex:/^([^:]+?):\s+/i,confidence:70},{regex:/^\[([^\]]+)\]/,confidence:75}],t=["weekly","daily","monthly","internal","team","1:1","one on one","standup","sync","meeting","call","notes","monday","tuesday","wednesday","thursday","friday","untitled","new","test"];for(let n of e){let s=a.match(n.regex);if(s&&s[1]){let r=s[1].trim();if(t.some(o=>r.toLowerCase()===o)||r.length<2)continue;let i=this.fuzzyMatchSalesforce(r);return i?{account:i.name,accountId:i.id,confidence:Math.min(n.confidence+10,100),source:"salesforce_match",evidence:`Matched "${r}" from title to Salesforce account "${i.name}"`}:{account:r,accountId:null,confidence:n.confidence,source:"title",evidence:"Extracted from meeting title pattern"}}}return{account:null,accountId:null,confidence:0,source:"title",evidence:"No pattern matched"}}detectFromFilePath(a){let e=a.match(/Accounts\/([^\/]+)\//i);if(e&&e[1]){let t=e[1].trim(),n=this.fuzzyMatchSalesforce(t);return n?{account:n.name,accountId:n.id,confidence:95,source:"salesforce_match",evidence:`File in account folder "${t}" matched to "${n.name}"`}:{account:t,accountId:null,confidence:85,source:"title",evidence:`File located in Accounts/${t} folder`}}return{account:null,accountId:null,confidence:0,source:"none",evidence:"Not in Accounts folder"}}detectFromAttendees(a){let e=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com"],t=new Set;for(let i of a){let c=i.toLowerCase().match(/@([a-z0-9.-]+)/);if(c){let d=c[1];!d.includes("eudia.com")&&!e.includes(d)&&t.add(d)}}if(t.size===0)return{account:null,accountId:null,confidence:0,source:"attendee_domain",evidence:"No external domains"};for(let i of t){let o=i.split(".")[0],c=o.charAt(0).toUpperCase()+o.slice(1),d=this.fuzzyMatchSalesforce(c);if(d)return{account:d.name,accountId:d.id,confidence:75,source:"salesforce_match",evidence:`Matched attendee domain ${i} to "${d.name}"`}}let n=Array.from(t)[0],s=n.split(".")[0];return{account:s.charAt(0).toUpperCase()+s.slice(1),accountId:null,confidence:50,source:"attendee_domain",evidence:`Guessed from external attendee domain: ${n}`}}fuzzyMatchSalesforce(a){if(!a||this.salesforceAccounts.length===0)return null;let e=a.toLowerCase().trim();for(let t of this.salesforceAccounts)if(t.name?.toLowerCase()===e)return t;for(let t of this.salesforceAccounts)if(t.name?.toLowerCase().startsWith(e))return t;for(let t of this.salesforceAccounts)if(t.name?.toLowerCase().includes(e))return t;for(let t of this.salesforceAccounts)if(e.includes(t.name?.toLowerCase()))return t;return null}suggestAccounts(a,e=10){if(!a||a.length<2)return this.salesforceAccounts.slice(0,e).map(s=>({...s,score:0}));let t=a.toLowerCase(),n=[];for(let s of this.salesforceAccounts){let r=s.name?.toLowerCase()||"",i=0;r===t?i=100:r.startsWith(t)?i=90:r.includes(t)?i=70:t.includes(r)&&(i=50),i>0&&n.push({...s,score:i})}return n.sort((s,r)=>r.score-s.score).slice(0,e)}},Ne=new V,fe=["pipeline review","pipeline call","weekly pipeline","forecast call","forecast review","deal review","opportunity review","sales review","pipeline sync","forecast sync","deal sync","pipeline update","forecast meeting"];function ae(f,a){if(f){let e=f.toLowerCase();for(let t of fe)if(e.includes(t))return{isPipelineMeeting:!0,confidence:95,evidence:`Title contains "${t}"`}}if(a&&a.length>=2){let e=["eudia.com","johnsonhana.com"];if(a.every(n=>{let s=n.toLowerCase().split("@")[1]||"";return e.some(r=>s.includes(r))})&&a.length>=3){if(f){let n=f.toLowerCase();if(["sync","review","update","weekly","team","forecast"].some(i=>n.includes(i)))return{isPipelineMeeting:!0,confidence:70,evidence:`All internal attendees (${a.length}) with team meeting signal`}}return{isPipelineMeeting:!1,confidence:40,evidence:"All internal attendees but no clear pipeline signal"}}}return{isPipelineMeeting:!1,confidence:0,evidence:"No pipeline meeting indicators found"}}function Oe(f,a){let e="";return(a?.account||a?.opportunities?.length)&&(e=`
ACCOUNT CONTEXT (use to inform your analysis):
${a.account?`- Account: ${a.account.name}`:""}
${a.account?.owner?`- Account Owner: ${a.account.owner}`:""}
${a.opportunities?.length?`- Open Opportunities: ${a.opportunities.map(t=>`${t.name} (${t.stage}, $${(t.acv/1e3).toFixed(0)}k)`).join("; ")}`:""}
${a.contacts?.length?`- Known Contacts: ${a.contacts.slice(0,5).map(t=>`${t.name} - ${t.title}`).join("; ")}`:""}
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
- Action items have clear owners`}function ve(f){return`You are a sales operations analyst producing the weekly pipeline review summary for Eudia, an AI-powered legal technology company. You are processing the transcript of an internal team pipeline review meeting.
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
10. If the meeting discussed general topics like demo stability, growth motion, enablement, or hiring \u2014 capture these in the Growth & Cross-Team section, not mixed into account tables.`}var B=class{constructor(a){this.serverUrl=a}setServerUrl(a){this.serverUrl=a}async transcribeAndSummarize(a,e,t,n,s){try{let r=s?.meetingType==="pipeline_review",i=r?ve(s?.pipelineContext):Oe(t,s),o=await(0,k.requestUrl)({url:`${this.serverUrl}/api/transcribe-and-summarize`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:a,mimeType:e,accountName:r?"Pipeline Review":t,accountId:n,meetingType:s?.meetingType||"discovery",context:s?{customerBrain:s.account?.customerBrain,opportunities:s.opportunities,contacts:s.contacts}:void 0,systemPrompt:i})});return o.json.success?{success:!0,transcript:o.json.transcript||"",sections:this.normalizeSections(o.json.sections),duration:o.json.duration||0}:{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:o.json.error||"Transcription failed"}}catch(r){console.error("Server transcription error:",r),r.response&&console.error("Server response:",r.response);let i="";try{r.response?.json?.error?i=r.response.json.error:typeof r.response=="string"&&(i=JSON.parse(r.response).error||"")}catch{}let o=i||`Transcription failed: ${r.message}`;return r.message?.includes("413")?o="Audio file too large for server. Try a shorter recording.":r.message?.includes("500")?o=i||"Server error during transcription. Please try again.":(r.message?.includes("Failed to fetch")||r.message?.includes("NetworkError"))&&(o="Could not reach transcription server. Check your internet connection."),console.error("Final error message:",o),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:o}}}parseSections(a){let e=this.getEmptySections(),t={summary:"summary",attendees:"attendees","meddicc signals":"meddiccSignals","product interest":"productInterest","pain points":"painPoints","buying triggers":"buyingTriggers","key dates":"keyDates","next steps":"nextSteps","action items":"actionItems","action items (internal)":"actionItems","deal signals":"dealSignals","risks & objections":"risksObjections","risks and objections":"risksObjections","competitive intelligence":"competitiveIntel"},n=/## ([^\n]+)\n([\s\S]*?)(?=## |$)/g,s;for(;(s=n.exec(a))!==null;){let r=s[1].trim().toLowerCase(),i=s[2].trim(),o=t[r];o&&(e[o]=i)}return e}normalizeSections(a){let e=this.getEmptySections();return a?{...e,...a}:e}async getMeetingContext(a){try{let e=await(0,k.requestUrl)({url:`${this.serverUrl}/api/meeting-context/${a}`,method:"GET",headers:{Accept:"application/json"}});return e.json.success?{success:!0,account:e.json.account,opportunities:e.json.opportunities,contacts:e.json.contacts,lastMeeting:e.json.lastMeeting}:{success:!1,error:e.json.error||"Failed to fetch context"}}catch(e){return console.error("Meeting context error:",e),{success:!1,error:e.message||"Network error"}}}async syncToSalesforce(a,e,t,n,s,r){try{let i=await(0,k.requestUrl)({url:`${this.serverUrl}/api/transcription/sync-to-salesforce`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:a,accountName:e,noteTitle:t,sections:n,transcript:s,meetingDate:r||new Date().toISOString(),syncedAt:new Date().toISOString()})});return i.json.success?{success:!0,customerBrainUpdated:i.json.customerBrainUpdated,eventCreated:i.json.eventCreated,eventId:i.json.eventId,contactsCreated:i.json.contactsCreated,tasksCreated:i.json.tasksCreated}:{success:!1,error:i.json.error||"Sync failed"}}catch(i){return console.error("Salesforce sync error:",i),{success:!1,error:i.message||"Network error"}}}getEmptySections(){return{summary:"",attendees:"",meddiccSignals:"",productInterest:"",painPoints:"",buyingTriggers:"",keyDates:"",nextSteps:"",actionItems:"",dealSignals:"",risksObjections:"",competitiveIntel:""}}async liveQueryTranscript(a,e,t){if(!e||e.trim().length<50)return{success:!1,answer:"",error:"Not enough transcript captured yet. Keep recording for a few more minutes."};try{let n=await(0,k.requestUrl)({url:`${this.serverUrl}/api/live-query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:a,transcript:e,accountName:t,systemPrompt:this.buildLiveQueryPrompt()})});return n.json.success?{success:!0,answer:n.json.answer||"No relevant information found in the transcript."}:{success:!1,answer:"",error:n.json.error||"Query failed"}}catch(n){return console.error("Live query error:",n),{success:!1,answer:"",error:n.message||"Failed to query transcript"}}}async transcribeChunk(a,e){try{let t=await(0,k.requestUrl)({url:`${this.serverUrl}/api/transcribe-chunk`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:a,mimeType:e})});return t.json.success?{success:!0,text:t.json.text||""}:{success:!1,text:"",error:t.json.error||"Chunk transcription failed"}}catch(t){return console.error("Chunk transcription error:",t),{success:!1,text:"",error:t.message||"Failed to transcribe chunk"}}}buildLiveQueryPrompt(){return`You are an AI assistant helping a salesperson during an active customer call. 
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

Format your response as a brief, actionable answer suitable for quick reference during a call.`}static formatSectionsForNote(a,e,t){let n="";if(a.summary&&(n+=`## TL;DR

${a.summary}

`),t?.enabled&&t?.talkTime){n+=`## Call Analytics

`;let r=t.talkTime.repPercent,i=t.talkTime.customerPercent,o=t.talkTime.isHealthyRatio?"\u2705":"\u26A0\uFE0F";n+=`**Talk Time:** Rep ${r}% / Customer ${i}% ${o}
`;let c=Math.round(r/5),d=Math.round(i/5);if(n+=`\`${"\u2588".repeat(c)}${"\u2591".repeat(20-c)}\` Rep
`,n+=`\`${"\u2588".repeat(d)}${"\u2591".repeat(20-d)}\` Customer

`,t.coaching){let l=t.coaching;if(l.totalQuestions>0){let h=Math.round(l.openQuestions/l.totalQuestions*100);n+=`**Questions:** ${l.totalQuestions} total (${l.openQuestions} open, ${l.closedQuestions} closed - ${h}% open)
`}if(l.objections&&l.objections.length>0){let h=l.objections.filter(g=>g.handled).length;n+=`**Objections:** ${l.objections.length} raised, ${h} handled
`}l.valueScore!==void 0&&(n+=`**Value Articulation:** ${l.valueScore}/10
`),l.nextStepClear!==void 0&&(n+=`**Next Step Clarity:** ${l.nextStepClear?"\u2705 Clear":"\u26A0\uFE0F Unclear"}
`),n+=`
`}}a.painPoints&&!a.painPoints.includes("None explicitly stated")&&(n+=`## Pain Points

${a.painPoints}

`),a.productInterest&&!a.productInterest.includes("None identified")&&(n+=`## Product Interest

${a.productInterest}

`),a.meddiccSignals&&(n+=`## MEDDICC Signals

${a.meddiccSignals}

`),a.nextSteps&&(n+=`## Next Steps

${a.nextSteps}

`),a.actionItems&&(n+=`## Action Items (Internal)

${a.actionItems}

`),a.keyDates&&!a.keyDates.includes("No specific dates")&&(n+=`## Key Dates

${a.keyDates}

`),a.buyingTriggers&&(n+=`## Buying Triggers

${a.buyingTriggers}

`),a.dealSignals&&(n+=`## Deal Signals

${a.dealSignals}

`),a.risksObjections&&!a.risksObjections.includes("None raised")&&(n+=`## Risks & Objections

${a.risksObjections}

`),a.competitiveIntel&&!a.competitiveIntel.includes("No competitive")&&(n+=`## Competitive Intelligence

${a.competitiveIntel}

`),a.attendees&&(n+=`## Attendees

${a.attendees}

`);let s=t?.enabled&&t?.formattedTranscript?t.formattedTranscript:e;if(s){let r=t?.enabled?"Full Transcript (Speaker-Attributed)":"Full Transcript";n+=`---

<details>
<summary><strong>${r}</strong></summary>

${s}

</details>
`}return n}static formatSectionsWithAudio(a,e,t,n){let s=this.formatSectionsForNote(a,e,n);return t&&(s+=`
---

## Recording

![[${t}]]
`),s}static formatContextForNote(a){if(!a.success)return"";let e=`## Pre-Call Context

`;if(a.account&&(e+=`**Account:** ${a.account.name}
`,e+=`**Owner:** ${a.account.owner}

`),a.opportunities&&a.opportunities.length>0){e+=`### Open Opportunities

`;for(let t of a.opportunities){let n=t.acv?`$${(t.acv/1e3).toFixed(0)}k`:"TBD";e+=`- **${t.name}** - ${t.stage} - ${n}`,t.targetSignDate&&(e+=` - Target: ${new Date(t.targetSignDate).toLocaleDateString()}`),e+=`
`}e+=`
`}if(a.contacts&&a.contacts.length>0){e+=`### Key Contacts

`;for(let t of a.contacts.slice(0,5))e+=`- **${t.name}**`,t.title&&(e+=` - ${t.title}`),e+=`
`;e+=`
`}if(a.lastMeeting&&(e+=`### Last Meeting

`,e+=`${new Date(a.lastMeeting.date).toLocaleDateString()} - ${a.lastMeeting.subject}

`),a.account?.customerBrain){let t=a.account.customerBrain.substring(0,500);t&&(e+=`### Recent Notes

`,e+=`${t}${a.account.customerBrain.length>500?"...":""}

`)}return e+=`---

`,e}async blobToBase64(a){return new Promise((e,t)=>{let n=new FileReader;n.onload=()=>{let r=n.result.split(",")[1];e(r)},n.onerror=t,n.readAsDataURL(a)})}async transcribeAudio(a,e){try{let t=await this.blobToBase64(a),n=a.type||"audio/webm",s=e?.meetingType==="pipeline_review"?{success:!0,meetingType:"pipeline_review",pipelineContext:e.pipelineContext}:void 0,r=await this.transcribeAndSummarize(t,n,e?.accountName,e?.accountId,s);return{text:r.transcript,confidence:r.success?.95:0,duration:r.duration,sections:r.sections}}catch(t){return console.error("transcribeAudio error:",t),{text:"",confidence:0,duration:0,sections:this.getEmptySections()}}}async processTranscription(a,e){if(!a||a.trim().length===0)return this.getEmptySections();try{let t=await(0,k.requestUrl)({url:`${this.serverUrl}/api/process-sections`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript:a,accountName:e?.accountName,context:e})});if(t.json?.success&&t.json?.sections){let n=t.json.sections;return{summary:n.summary||"",painPoints:n.painPoints||n.keyPoints||"",productInterest:n.productInterest||"",meddiccSignals:n.meddiccSignals||"",nextSteps:n.nextSteps||"",actionItems:n.actionItems||"",keyDates:n.keyDates||"",buyingTriggers:n.buyingTriggers||"",dealSignals:n.dealSignals||"",risksObjections:n.risksObjections||n.concerns||"",competitiveIntel:n.competitiveIntel||"",attendees:n.attendees||"",transcript:a}}return console.warn("Server process-sections returned no sections, using fallback"),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:a}}catch(t){return console.error("processTranscription server error:",t),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:a}}}};var _=require("obsidian"),I=class f{constructor(a,e,t="America/New_York"){this.serverUrl=a,this.userEmail=e.toLowerCase(),this.timezone=t}setUserEmail(a){this.userEmail=a.toLowerCase()}setServerUrl(a){this.serverUrl=a}setTimezone(a){this.timezone=a}async getTodaysMeetings(a=!1){if(!this.userEmail)return{success:!1,date:new Date().toISOString().split("T")[0],email:"",meetingCount:0,meetings:[],error:"User email not configured"};try{let e=encodeURIComponent(this.timezone),t=a?"&forceRefresh=true":"";return(await(0,_.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/today?timezone=${e}${t}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(e){return console.error("Failed to fetch today's meetings:",e),{success:!1,date:new Date().toISOString().split("T")[0],email:this.userEmail,meetingCount:0,meetings:[],error:e.message||"Failed to fetch calendar"}}}async getWeekMeetings(a=!1){if(!this.userEmail)return{success:!1,startDate:"",endDate:"",email:"",totalMeetings:0,byDay:{},error:"User email not configured"};try{let e=encodeURIComponent(this.timezone),t=a?"&forceRefresh=true":"";return(await(0,_.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/week?timezone=${e}${t}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(e){return console.error("Failed to fetch week's meetings:",e),{success:!1,startDate:"",endDate:"",email:this.userEmail,totalMeetings:0,byDay:{},error:e.message||"Failed to fetch calendar"}}}async getMeetingsInRange(a,e){if(!this.userEmail)return[];try{let t=a.toISOString().split("T")[0],n=e.toISOString().split("T")[0],s=await(0,_.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${t}&end=${n}`,method:"GET",headers:{Accept:"application/json"}});return s.json.success?s.json.meetings||[]:[]}catch(t){return console.error("Failed to fetch calendar range:",t),[]}}async getCurrentMeeting(){let a=await this.getTodaysMeetings();if(!a.success||a.meetings.length===0)return{meeting:null,isNow:!1};let e=new Date;for(let t of a.meetings){let n=f.safeParseDate(t.start),s=f.safeParseDate(t.end);if(e>=n&&e<=s)return{meeting:t,isNow:!0};let r=(n.getTime()-e.getTime())/(1e3*60);if(r>0&&r<=15)return{meeting:t,isNow:!1,minutesUntilStart:Math.ceil(r)}}return{meeting:null,isNow:!1}}async getMeetingsForAccount(a){let e=await this.getWeekMeetings();if(!e.success)return[];let t=[];Object.values(e.byDay).forEach(s=>{t.push(...s)});let n=a.toLowerCase();return t.filter(s=>s.accountName?.toLowerCase().includes(n)||s.subject.toLowerCase().includes(n)||s.attendees.some(r=>r.email.toLowerCase().includes(n.split(" ")[0])))}static formatMeetingForNote(a){let e=a.attendees.filter(t=>t.isExternal!==!1).map(t=>t.name||t.email.split("@")[0]).slice(0,5).join(", ");return{title:a.subject,attendees:e,meetingStart:a.start,accountName:a.accountName}}static getDayName(a){let e;a.length===10&&a.includes("-")?e=new Date(a+"T00:00:00"):e=new Date(a);let t=new Date;t.setHours(0,0,0,0);let n=new Date(e);n.setHours(0,0,0,0);let s=Math.round((n.getTime()-t.getTime())/(1e3*60*60*24));return s===0?"Today":s===1?"Tomorrow":e.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}static formatTime(a,e){let t=a;t&&!t.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(t)&&(t=t+"Z");let n=new Date(t);if(isNaN(n.getTime()))return a;let s={hour:"numeric",minute:"2-digit",hour12:!0};return e&&(s.timeZone=e),n.toLocaleTimeString("en-US",s)}static safeParseDate(a){if(!a)return new Date(NaN);let e=a;return!e.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(e)&&(e=e+"Z"),new Date(e)}static getMeetingDuration(a,e){let t=f.safeParseDate(a),n=f.safeParseDate(e);return Math.round((n.getTime()-t.getTime())/(1e3*60))}};var we=["ai-contracting-tech","ai-contracting-services","ai-compliance-tech","ai-compliance-services","ai-ma-tech","ai-ma-services","sigma"],Se=["metrics-identified","economic-buyer-identified","decision-criteria-discussed","decision-process-discussed","pain-confirmed","champion-identified","competition-mentioned"],Ce=["progressing","stalled","at-risk","champion-engaged","early-stage"],We=["discovery","demo","negotiation","qbr","implementation","follow-up"],je=`You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

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
}`,G=class{constructor(a,e){this.openaiApiKey=null;this.serverUrl=a,this.openaiApiKey=e||null}setOpenAIKey(a){this.openaiApiKey=a}setServerUrl(a){this.serverUrl=a}async extractTags(a){let e=this.buildTagContext(a);if(!e.trim())return{success:!1,tags:this.getEmptyTags(),error:"No content to analyze"};try{return await this.extractTagsViaServer(e)}catch(t){return console.warn("Server tag extraction failed, trying local:",t.message),this.openaiApiKey?await this.extractTagsLocal(e):this.extractTagsRuleBased(a)}}buildTagContext(a){let e=[];return a.summary&&e.push(`SUMMARY:
${a.summary}`),a.productInterest&&e.push(`PRODUCT INTEREST:
${a.productInterest}`),a.meddiccSignals&&e.push(`MEDDICC SIGNALS:
${a.meddiccSignals}`),a.dealSignals&&e.push(`DEAL SIGNALS:
${a.dealSignals}`),a.painPoints&&e.push(`PAIN POINTS:
${a.painPoints}`),a.attendees&&e.push(`ATTENDEES:
${a.attendees}`),e.join(`

`)}async extractTagsViaServer(a){let e=await fetch(`${this.serverUrl}/api/extract-tags`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:a,openaiApiKey:this.openaiApiKey})});if(!e.ok)throw new Error(`Server returned ${e.status}`);let t=await e.json();if(!t.success)throw new Error(t.error||"Tag extraction failed");return{success:!0,tags:this.validateAndNormalizeTags(t.tags)}}async extractTagsLocal(a){if(!this.openaiApiKey)return{success:!1,tags:this.getEmptyTags(),error:"No OpenAI API key configured"};try{let e=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:je},{role:"user",content:`Extract tags from this meeting content:

${a}`}],temperature:.1,response_format:{type:"json_object"}})});if(!e.ok)throw new Error(`OpenAI returned ${e.status}`);let n=(await e.json()).choices?.[0]?.message?.content;if(!n)throw new Error("No content in response");let s=JSON.parse(n);return{success:!0,tags:this.validateAndNormalizeTags(s)}}catch(e){return console.error("Local tag extraction error:",e),{success:!1,tags:this.getEmptyTags(),error:e.message||"Tag extraction failed"}}}extractTagsRuleBased(a){let e=Object.values(a).join(" ").toLowerCase(),t={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:.4};return(e.includes("contract")||e.includes("contracting"))&&(e.includes("service")?t.product_interest.push("ai-contracting-services"):t.product_interest.push("ai-contracting-tech")),e.includes("compliance")&&t.product_interest.push("ai-compliance-tech"),(e.includes("m&a")||e.includes("due diligence")||e.includes("acquisition"))&&t.product_interest.push("ai-ma-tech"),e.includes("sigma")&&t.product_interest.push("sigma"),(e.includes("metric")||e.includes("%")||e.includes("roi")||e.includes("save"))&&t.meddicc_signals.push("metrics-identified"),(e.includes("budget")||e.includes("cfo")||e.includes("economic buyer"))&&t.meddicc_signals.push("economic-buyer-identified"),(e.includes("pain")||e.includes("challenge")||e.includes("problem")||e.includes("struggle"))&&t.meddicc_signals.push("pain-confirmed"),(e.includes("champion")||e.includes("advocate")||e.includes("sponsor"))&&t.meddicc_signals.push("champion-identified"),(e.includes("competitor")||e.includes("alternative")||e.includes("vs")||e.includes("compared to"))&&t.meddicc_signals.push("competition-mentioned"),(e.includes("next step")||e.includes("follow up")||e.includes("schedule"))&&(t.deal_health="progressing"),(e.includes("concern")||e.includes("objection")||e.includes("hesitant")||e.includes("risk"))&&(t.deal_health="at-risk"),e.includes("demo")||e.includes("show you")||e.includes("demonstration")?t.meeting_type="demo":e.includes("pricing")||e.includes("negotiat")||e.includes("contract terms")?t.meeting_type="negotiation":e.includes("quarterly")||e.includes("qbr")||e.includes("review")?t.meeting_type="qbr":(e.includes("implementation")||e.includes("onboard")||e.includes("rollout"))&&(t.meeting_type="implementation"),{success:!0,tags:t}}validateAndNormalizeTags(a){let e={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:a.confidence||.8};return Array.isArray(a.product_interest)&&(e.product_interest=a.product_interest.filter(t=>we.includes(t))),Array.isArray(a.meddicc_signals)&&(e.meddicc_signals=a.meddicc_signals.filter(t=>Se.includes(t))),Ce.includes(a.deal_health)&&(e.deal_health=a.deal_health),We.includes(a.meeting_type)&&(e.meeting_type=a.meeting_type),Array.isArray(a.key_stakeholders)&&(e.key_stakeholders=a.key_stakeholders.slice(0,10)),e}getEmptyTags(){return{product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:0}}static formatTagsForFrontmatter(a){return{product_interest:a.product_interest.length>0?a.product_interest:null,meddicc_signals:a.meddicc_signals.length>0?a.meddicc_signals:null,deal_health:a.deal_health,meeting_type:a.meeting_type,key_stakeholders:a.key_stakeholders.length>0?a.key_stakeholders:null,tag_confidence:Math.round(a.confidence*100)}}static generateTagSummary(a){let e=[];return a.product_interest.length>0&&e.push(`**Products:** ${a.product_interest.join(", ")}`),a.meddicc_signals.length>0&&e.push(`**MEDDICC:** ${a.meddicc_signals.join(", ")}`),e.push(`**Deal Health:** ${a.deal_health}`),e.push(`**Meeting Type:** ${a.meeting_type}`),e.join(" | ")}};var ie=["keigan.pesenti@eudia.com","michael.ayers@eudia.com","michael.flynn@eudia.com","zach@eudia.com"],se=["omar@eudia.com","david@eudia.com","ashish@eudia.com","siddharth.saxena@eudia.com"],re={"mitchell.loquaci@eudia.com":{name:"Mitchell Loquaci",region:"US",role:"RVP Sales"},"stephen.mulholland@eudia.com":{name:"Stephen Mulholland",region:"EMEA",role:"VP Sales"},"riona.mchale@eudia.com":{name:"Riona McHale",region:"IRE_UK",role:"Head of Sales"}},be=["nikhita.godiwala@eudia.com","jon.dedych@eudia.com","farah.haddad@eudia.com"],Ae={US:["asad.hussain@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com","rajeev.patel@eudia.com"],EMEA:["greg.machale@eudia.com","tom.clancy@eudia.com","nicola.fratini@eudia.com","nathan.shine@eudia.com","stephen.mulholland@eudia.com"],IRE_UK:["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com","riona.mchale@eudia.com"]},q={"mitchell.loquaci@eudia.com":["asad.hussain@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com","rajeev.patel@eudia.com"],"stephen.mulholland@eudia.com":["greg.machale@eudia.com","tom.clancy@eudia.com","conor.molloy@eudia.com","nathan.shine@eudia.com","nicola.fratini@eudia.com"],"riona.mchale@eudia.com":["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com"]},xe={"sean.boyd@eudia.com":"US","riley.stack@eudia.com":"US","rajeev.patel@eudia.com":"US"};function Ee(f){let a=f.toLowerCase().trim();return ie.includes(a)?"admin":se.includes(a)?"exec":a in re?"sales_leader":be.includes(a)?"cs":"bl"}function ke(f){let a=f.toLowerCase().trim();return re[a]?.region||null}function oe(f){return Ae[f]||[]}function Ie(f){let a=f.toLowerCase().trim();if(q[a])return q[a];let e=ke(a);return e?oe(e):[]}function x(f){let a=f.toLowerCase().trim();return ie.includes(a)||se.includes(a)}var A={version:"2026-02-09",lastUpdated:"2026-02-09",businessLeads:{"alex.fox@eudia.com":{email:"alex.fox@eudia.com",name:"Alex Fox",accounts:[{id:"001Wj00000mCFsT",name:"Arabic Computer Systems",hadOpportunity:!0},{id:"001Wj00000mCFsO",name:"Brown Thomas",hadOpportunity:!0},{id:"001Wj00000mCFt2",name:"Byrne Wallace Shields",hadOpportunity:!0},{id:"001Wj00000mCFsu",name:"Corrigan & Corrigan Solicitors LLP",hadOpportunity:!0},{id:"001Wj00000pzTPY",name:"Defence Forces Tribunal",hadOpportunity:!1},{id:"001Wj00000mCFsc",name:"Department of Children, Disability and Equality",hadOpportunity:!0},{id:"001Wj00000mCFsN",name:"Department of Climate, Energy and the Environment",hadOpportunity:!0},{id:"001Wj00000mCFrZ",name:"Department of Housing",hadOpportunity:!0},{id:"001Wj00000mCFsU",name:"ESB NI/Electric Ireland",hadOpportunity:!0},{id:"001Wj00000pzTPV",name:"MW Keller",hadOpportunity:!1},{id:"001Wj00000pzTPX",name:"Murphy's Ice Cream",hadOpportunity:!1},{id:"001Wj00000mCFrM",name:"Sisk Group",hadOpportunity:!0}]},"ananth.cherukupally@eudia.com":{email:"ananth.cherukupally@eudia.com",name:"Ananth Cherukupally",accounts:[{id:"001Wj00000PfssX",name:"AGC Partners",hadOpportunity:!1},{id:"001Wj00000ahBZt",name:"AMETEK",hadOpportunity:!1},{id:"001Wj00000ahBZr",name:"Accel-KKR",hadOpportunity:!1},{id:"001Wj00000bwVu4",name:"Addtech",hadOpportunity:!1},{id:"001Wj00000YNV7Z",name:"Advent",hadOpportunity:!0},{id:"001Wj00000VZScK",name:"Affinity Consulting Group",hadOpportunity:!1},{id:"001Wj00000lyFyt",name:"Albacore Capital Group",hadOpportunity:!0},{id:"001Wj00000nlL88",name:"Alder",hadOpportunity:!0},{id:"001Wj00000XumF6",name:"Alpine Investors",hadOpportunity:!0},{id:"001Wj00000QTbLP",name:"Alvarez AI Advisors",hadOpportunity:!1},{id:"001Wj00000ahFCJ",name:"American Pacific Group",hadOpportunity:!1},{id:"001Wj00000ah6dg",name:"Angeles Equity Partners",hadOpportunity:!1},{id:"001Hp00003kIrEu",name:"Apollo Global Management",hadOpportunity:!0},{id:"001Wj00000cl5pq",name:"Arizona MBDA Business Center",hadOpportunity:!1},{id:"001Wj00000nlRev",name:"Attack Capital",hadOpportunity:!0},{id:"001Wj00000ahFBx",name:"Audax Group",hadOpportunity:!1},{id:"001Wj00000YhZAE",name:"Beacon Software",hadOpportunity:!0},{id:"001Wj00000cfg0c",name:"Beekers Capital",hadOpportunity:!1},{id:"001Wj00000bwVsk",name:"Bertram Capital",hadOpportunity:!1},{id:"001Wj00000ahBa0",name:"Bessemer Venture Partners",hadOpportunity:!1},{id:"001Wj00000lzDWj",name:"BlueEarth Capital",hadOpportunity:!0},{id:"001Wj00000ah6dZ",name:"Brentwood Associates",hadOpportunity:!1},{id:"001Wj00000ah6dL",name:"Brown & Brown",hadOpportunity:!1},{id:"001Hp00003kIrCh",name:"CBRE Group",hadOpportunity:!0},{id:"001Wj00000cejJz",name:"CVC",hadOpportunity:!0},{id:"001Wj00000ahFCV",name:"Caltius Equity Partners",hadOpportunity:!1},{id:"001Wj00000ahFBz",name:"Capstone Partners",hadOpportunity:!1},{id:"001Wj00000nlB0g",name:"Capvest",hadOpportunity:!0},{id:"001Hp00003kIrFy",name:"Cardinal Health",hadOpportunity:!0},{id:"001Hp00003kIrDg",name:"Carlyle",hadOpportunity:!0},{id:"001Wj00000PbIZ8",name:"Cascadia Capital",hadOpportunity:!1},{id:"001Wj00000ah6dW",name:"Catterton",hadOpportunity:!1},{id:"001Wj00000ahFC7",name:"Century Park Capital Partners",hadOpportunity:!1},{id:"001Wj00000Rjuhj",name:"Citadel",hadOpportunity:!0},{id:"001Wj00000ah6dn",name:"Clearlake Capital Group",hadOpportunity:!1},{id:"001Wj00000ah6dY",name:"Cognex Corporation",hadOpportunity:!1},{id:"001Wj00000ah6do",name:"Comvest Partners",hadOpportunity:!1},{id:"001Wj00000ah6dv",name:"Constellation Software",hadOpportunity:!0},{id:"001Wj00000ahFCI",name:"Cortec Group",hadOpportunity:!1},{id:"001Wj00000ahBa4",name:"Crosslink Capital",hadOpportunity:!1},{id:"001Wj00000ahFCR",name:"DCA Partners",hadOpportunity:!1},{id:"001Wj00000ah6dc",name:"DFO Management",hadOpportunity:!1},{id:"001Wj00000W8fEu",name:"Davis Polk",hadOpportunity:!1},{id:"001Wj00000crdDR",name:"Delcor",hadOpportunity:!0},{id:"001Wj00000ahFCM",name:"Diploma",hadOpportunity:!1},{id:"001Wj00000kcANH",name:"Discord",hadOpportunity:!0},{id:"001Wj00000ahFCU",name:"Doughty Hanson & Co",hadOpportunity:!1},{id:"001Wj00000ah6dd",name:"Edgewater Capital Partners",hadOpportunity:!1},{id:"001Wj00000Y64qh",name:"Emigrant Bank",hadOpportunity:!0},{id:"001Wj00000ah6dM",name:"Encore Consumer Capital",hadOpportunity:!1},{id:"001Wj00000ahFCL",name:"Endeavour Capital",hadOpportunity:!1},{id:"001Wj00000ah6di",name:"FFL Partners",hadOpportunity:!1},{id:"001Wj00000ah6dV",name:"Falfurrias Capital Partners",hadOpportunity:!1},{id:"001Wj00000ah6dU",name:"FirstService Corporation",hadOpportunity:!1},{id:"001Wj00000nlLZU",name:"Five Capital",hadOpportunity:!0},{id:"001Wj00000ahFCK",name:"Flexpoint Ford",hadOpportunity:!1},{id:"001Wj00000QkjJL",name:"Floodgate",hadOpportunity:!1},{id:"001Wj00000bwVu6",name:"Fortive Corporation",hadOpportunity:!1},{id:"001Wj00000ahFCa",name:"Foundry Group",hadOpportunity:!1},{id:"001Hp00003kIrID",name:"Freeport-McMoRan",hadOpportunity:!0},{id:"001Wj00000bwVuN",name:"Fremont Partners",hadOpportunity:!1},{id:"001Wj00000ahFCO",name:"Frontenac Company",hadOpportunity:!1},{id:"001Hp00003kIrII",name:"GE Healthcare",hadOpportunity:!0},{id:"001Hp00003kIrIJ",name:"GE Vernova",hadOpportunity:!0},{id:"001Wj00000lz2Jb",name:"GTIS Partners",hadOpportunity:!0},{id:"001Wj00000ah6dh",name:"Gallant Capital Partners",hadOpportunity:!1},{id:"001Hp00003kJ9oP",name:"General Catalyst",hadOpportunity:!0},{id:"001Wj00000ah6dr",name:"Genstar Capital",hadOpportunity:!1},{id:"001Hp00003kIrIT",name:"GlaxoSmithKline",hadOpportunity:!0},{id:"001Wj00000ahFCb",name:"Goldner Hawn Johnson & Morrison",hadOpportunity:!1},{id:"001Wj00000ah6du",name:"Great Point Partners",hadOpportunity:!1},{id:"001Wj00000ahBZx",name:"Greenoaks Capital",hadOpportunity:!0},{id:"001Wj00000ahFCB",name:"Greenspring Associates",hadOpportunity:!1},{id:"001Wj00000ahFCX",name:"Group 206",hadOpportunity:!1},{id:"001Wj00000ahBZz",name:"Gryphon Investors",hadOpportunity:!1},{id:"001Wj00000ah6dT",name:"HEICO Corporation",hadOpportunity:!1},{id:"001Wj00000cy4m1",name:"HG",hadOpportunity:!0},{id:"001Wj00000ahBZn",name:"HGGC",hadOpportunity:!1},{id:"001Wj00000ah6df",name:"Halma",hadOpportunity:!1},{id:"001Wj00000ah48X",name:"Harvest Partners",hadOpportunity:!1},{id:"001Wj00000ahFCS",name:"HealthpointCapital",hadOpportunity:!1},{id:"001Wj00000lzDtJ",name:"Heidrick & Struggles",hadOpportunity:!0},{id:"001Hp00003kIrIl",name:"Hellman & Friedman",hadOpportunity:!0},{id:"001Wj00000ahFCW",name:"Highview Capital",hadOpportunity:!1},{id:"001Wj00000Pg7rW",name:"Houlihan Lokey",hadOpportunity:!1},{id:"001Wj00000ahFCH",name:"Housatonic Partners",hadOpportunity:!1},{id:"001Wj00000ahFC9",name:"Huron Capital",hadOpportunity:!1},{id:"001Wj00000ahFC6",name:"Indutrade",hadOpportunity:!1},{id:"001Wj00000ahBa5",name:"Insight Partners",hadOpportunity:!1},{id:"001Wj00000nlbr9",name:"Intercorp",hadOpportunity:!0},{id:"001Wj00000ahFCA",name:"Irving Place Capital",hadOpportunity:!1},{id:"001Wj00000bwVtt",name:"Jack Henry & Associates",hadOpportunity:!1},{id:"001Wj00000Pg9oT",name:"Jackim Woods & Co.",hadOpportunity:!1},{id:"001Wj00000ah6de",name:"Jonas Software",hadOpportunity:!1},{id:"001Hp00003kIrJU",name:"KKR",hadOpportunity:!1},{id:"001Wj00000ahBa1",name:"Kayne Anderson Capital Advisors",hadOpportunity:!1},{id:"001Wj00000m5kud",name:"Kelly Services",hadOpportunity:!0},{id:"001Wj00000ahBZp",name:"Keysight Technologies",hadOpportunity:!1},{id:"001Wj00000ahFC8",name:"L Squared Capital Partners",hadOpportunity:!1},{id:"001Wj00000QGTNV",name:"LCS Forensic Accounting & Advisory",hadOpportunity:!1},{id:"001Wj00000ahFCD",name:"Lagercrantz Group",hadOpportunity:!1},{id:"001Wj00000ahBZs",name:"Levine Leichtman Capital Partners",hadOpportunity:!1},{id:"001Wj00000Z6zhP",name:"Liberty Mutual Insurance",hadOpportunity:!0},{id:"001Wj00000ahFCC",name:"Lifco",hadOpportunity:!1},{id:"001Wj00000ahFCP",name:"LightBay Capital",hadOpportunity:!1},{id:"001Wj00000iYEVS",name:"Lightstone Group",hadOpportunity:!0},{id:"001Wj00000ahFCT",name:"Lincolnshire Management",hadOpportunity:!1},{id:"001Wj00000c8ynV",name:"Littelfuse",hadOpportunity:!0},{id:"001Wj00000W95CX",name:"Long Lake",hadOpportunity:!0},{id:"001Wj00000ahBa3",name:"Luminate Capital",hadOpportunity:!1},{id:"001Wj00000ahFC1",name:"Lumine Group",hadOpportunity:!1},{id:"001Wj00000bwVuH",name:"Markel Corporation",hadOpportunity:!1},{id:"001Wj00000Pfppo",name:"Marks Baughan",hadOpportunity:!1},{id:"001Wj00000ah6dm",name:"Martis Capital",hadOpportunity:!1},{id:"001Hp00003kKrRR",name:"Marvell Technology",hadOpportunity:!0},{id:"001Wj00000PbJ2B",name:"Meridian Capital",hadOpportunity:!1},{id:"001Wj00000ahFC3",name:"Nexa Equity",hadOpportunity:!1},{id:"001Wj00000ahBZv",name:"Norwest Venture Partners",hadOpportunity:!1},{id:"001Wj00000ah6dp",name:"Novanta",hadOpportunity:!1},{id:"001Wj00000ah6dQ",name:"Pacific Avenue Capital Partners",hadOpportunity:!1},{id:"001Wj00000ah6dt",name:"Palladium Equity Partners",hadOpportunity:!1},{id:"001Wj00000iXNFs",name:"Palomar Holdings",hadOpportunity:!0},{id:"001Wj00000ahFCG",name:"Pamlico Capital",hadOpportunity:!1},{id:"001Wj00000W3R2u",name:"Paradigm",hadOpportunity:!1},{id:"001Wj00000bWBlQ",name:"Pegasystems",hadOpportunity:!0},{id:"001Wj00000YcPTM",name:"Percheron Capital",hadOpportunity:!0},{id:"001Wj00000bzz9M",name:"Peregrine Hospitality",hadOpportunity:!0},{id:"001Wj00000VZkJ3",name:"PerformLaw",hadOpportunity:!1},{id:"001Hp00003ljCJ8",name:"Petco",hadOpportunity:!0},{id:"001Wj00000ahFBy",name:"Pharos Capital Group",hadOpportunity:!1},{id:"001Wj00000bwVuF",name:"Pool Corporation",hadOpportunity:!1},{id:"001Wj00000ah48Y",name:"Pritzker Private Capital",hadOpportunity:!1},{id:"001Wj00000mRFNX",name:"Publicis Group",hadOpportunity:!0},{id:"001Hp00003kKXSI",name:"Pure Storage",hadOpportunity:!0},{id:"001Wj00000ah6dS",name:"Quad-C Management",hadOpportunity:!1},{id:"001Hp00003kIrLo",name:"Raymond James Financial",hadOpportunity:!1},{id:"001Wj00000ah6ds",name:"Resilience Capital Partners",hadOpportunity:!1},{id:"001Wj00000m0jBC",name:"RingCentral",hadOpportunity:!0},{id:"001Wj00000ahFC4",name:"Riverside Acceleration Capital",hadOpportunity:!1},{id:"001Wj00000ah48a",name:"Riverside Partners",hadOpportunity:!1},{id:"001Wj00000ahFCE",name:"Rustic Canyon Partners",hadOpportunity:!1},{id:"001Wj00000ah6dR",name:"Sageview Capital",hadOpportunity:!1},{id:"001Wj00000ahFCN",name:"Salt Creek Capital",hadOpportunity:!1},{id:"001Wj00000lzlLX",name:"Sandbox",hadOpportunity:!0},{id:"001Wj00000nldrK",name:"Scout Motors",hadOpportunity:!0},{id:"001Wj00000ah48Z",name:"Searchlight Capital",hadOpportunity:!1},{id:"001Wj00000ahBZq",name:"Serent Capital",hadOpportunity:!1},{id:"001Hp00003kIrEB",name:"Silver Lake",hadOpportunity:!0},{id:"001Wj00000ahBZo",name:"Siris Capital Group",hadOpportunity:!1},{id:"001Wj00000ah6db",name:"Solace Capital Partners",hadOpportunity:!1},{id:"001Wj00000ahFCF",name:"Solis Capital Partners",hadOpportunity:!1},{id:"001Wj00000VkQyY",name:"Sonja Cotton & Associates",hadOpportunity:!1},{id:"001Wj00000ah6dO",name:"Sorenson Capital",hadOpportunity:!1},{id:"001Wj00000lygkU",name:"SoundPoint Capital",hadOpportunity:!0},{id:"001Wj00000lxbYR",name:"Spark Brighter Thinking",hadOpportunity:!0},{id:"001Wj00000ah6dj",name:"Spectrum Equity",hadOpportunity:!0},{id:"001Wj00000lusqi",name:"Symphony Technology Partners",hadOpportunity:!0},{id:"001Wj00000tOAoE",name:"TA Associates",hadOpportunity:!0},{id:"001Hp00003kKrU1",name:"TPG",hadOpportunity:!0},{id:"001Wj00000dNhDy",name:"TSS Europe",hadOpportunity:!0},{id:"001Wj00000QTbzh",name:"Taytrom",hadOpportunity:!1},{id:"001Wj00000ahFCY",name:"The Courtney Group",hadOpportunity:!1},{id:"001Wj00000ahFCZ",name:"The Riverside Company",hadOpportunity:!1},{id:"001Wj00000cgCF8",name:"Titan AI",hadOpportunity:!1},{id:"001Wj00000nlOIv",name:"Together Fund",hadOpportunity:!0},{id:"001Wj00000ah6dX",name:"Topicus.com",hadOpportunity:!1},{id:"001Hp00003kIrNO",name:"TransDigm Group",hadOpportunity:!1},{id:"001Wj00000ah6dN",name:"Transom Capital Group",hadOpportunity:!1},{id:"001Wj00000ahBZu",name:"Trimble Inc.",hadOpportunity:!1},{id:"001Wj00000ah6dl",name:"Trivest Partners",hadOpportunity:!1},{id:"001Wj00000dXDo3",name:"Tucker's Farm",hadOpportunity:!0},{id:"001Wj00000ah6da",name:"Tyler Technologies",hadOpportunity:!1},{id:"001Wj00000Y6VMa",name:"UBS",hadOpportunity:!0},{id:"001Wj00000ahFCQ",name:"Vance Street Capital",hadOpportunity:!1},{id:"001Wj00000bn8VS",name:"Vista Equity Partners",hadOpportunity:!0},{id:"001Wj00000ahFC0",name:"Vitec Software",hadOpportunity:!1},{id:"001Wj00000ah6dP",name:"Volaris Group",hadOpportunity:!1},{id:"001Hp00003kIrO2",name:"Watsco",hadOpportunity:!1},{id:"001Wj00000ahBZw",name:"West Lane Capital Partners",hadOpportunity:!1},{id:"001Wj00000ahBZy",name:"Zebra Technologies",hadOpportunity:!1}]},"asad.hussain@eudia.com":{email:"asad.hussain@eudia.com",name:"Asad Hussain",accounts:[{id:"001Hp00003kIrFC",name:"AT&T",hadOpportunity:!0},{id:"001Hp00003kIrCy",name:"Airbnb",hadOpportunity:!0},{id:"001Hp00003kIrEe",name:"Amazon",hadOpportunity:!0},{id:"001Wj00000WElj9",name:"American Arbitration Association",hadOpportunity:!0},{id:"001Hp00003kIrCz",name:"American Express",hadOpportunity:!0},{id:"001Wj00000hewsX",name:"Amkor",hadOpportunity:!0},{id:"001Wj00000WZ05x",name:"Applied Intuition",hadOpportunity:!0},{id:"001Hp00003kIrEx",name:"Applied Materials",hadOpportunity:!1},{id:"001Hp00003kIrEz",name:"Archer Daniels Midland",hadOpportunity:!0},{id:"001Wj00000Y0g8Z",name:"Asana",hadOpportunity:!0},{id:"001Wj00000gGYAQ",name:"Autodesk",hadOpportunity:!0},{id:"001Wj00000c0wRA",name:"Away",hadOpportunity:!0},{id:"001Wj00000WTMCR",name:"BNY Mellon",hadOpportunity:!0},{id:"001Wj00000c6DHy",name:"BetterUp",hadOpportunity:!0},{id:"001Hp00003kIrFY",name:"BlackRock",hadOpportunity:!1},{id:"001Hp00003kIrFe",name:"Booz Allen Hamilton",hadOpportunity:!1},{id:"001Wj00000XhcVG",name:"Box.com",hadOpportunity:!0},{id:"001Wj00000bWBla",name:"CNA Insurance",hadOpportunity:!0},{id:"001Wj00000XiYqz",name:"Canva",hadOpportunity:!0},{id:"001Hp00003kIrG0",name:"Carrier Global",hadOpportunity:!1},{id:"001Wj00000mosEX",name:"Carta",hadOpportunity:!0},{id:"001Wj00000ah6dk",name:"Charlesbank Capital Partners",hadOpportunity:!0},{id:"001Wj00000XiXjd",name:"Circle",hadOpportunity:!0},{id:"001Hp00003kIrE5",name:"Coherent",hadOpportunity:!0},{id:"001Hp00003kIrGf",name:"Corning",hadOpportunity:!0},{id:"001Wj00000fgfGu",name:"Cyware",hadOpportunity:!0},{id:"001Hp00003kIrE6",name:"DHL",hadOpportunity:!0},{id:"001Wj00000duIWr",name:"Deepmind",hadOpportunity:!0},{id:"001Hp00003kIrGy",name:"Dell Technologies",hadOpportunity:!1},{id:"001Hp00003kIrGz",name:"Deloitte",hadOpportunity:!0},{id:"001Wj00000W8ZKl",name:"Docusign",hadOpportunity:!0},{id:"001Hp00003kIrHN",name:"Ecolab",hadOpportunity:!0},{id:"001Wj00000dheQN",name:"Emory",hadOpportunity:!0},{id:"001Wj00000bWIxP",name:"Ericsson",hadOpportunity:!0},{id:"001Hp00003kIrHs",name:"FedEx",hadOpportunity:!1},{id:"001Wj00000lMcwT",name:"Flo Health",hadOpportunity:!0},{id:"001Hp00003kIrI3",name:"Fluor",hadOpportunity:!0},{id:"001Hp00003kIrIA",name:"Fox",hadOpportunity:!0},{id:"001Hp00003kJ9oe",name:"Fresh Del Monte",hadOpportunity:!0},{id:"001Wj00000Y6HEY",name:"G-III Apparel Group",hadOpportunity:!0},{id:"001Wj00000kNTF0",name:"GLG",hadOpportunity:!0},{id:"001Hp00003kIrIK",name:"Geico",hadOpportunity:!0},{id:"001Hp00003lhVuD",name:"General Atlantic",hadOpportunity:!0},{id:"001Wj00000dw1gb",name:"Glean",hadOpportunity:!0},{id:"001Hp00003kJ9l1",name:"Google",hadOpportunity:!0},{id:"001Wj00000oqVXg",name:"Goosehead Insurance",hadOpportunity:!0},{id:"001Wj00000tuXZb",name:"Gopuff",hadOpportunity:!0},{id:"001Hp00003kIrDP",name:"HP",hadOpportunity:!0},{id:"001Hp00003kIrIt",name:"HSBC",hadOpportunity:!0},{id:"001Hp00003kL3Mo",name:"Honeywell",hadOpportunity:!0},{id:"001Hp00003kIrIy",name:"Huntsman",hadOpportunity:!0},{id:"001Wj00000d7IL8",name:"IAC",hadOpportunity:!0},{id:"001Hp00003kIrJ0",name:"IBM",hadOpportunity:!0},{id:"001Wj00000hdoLx",name:"Insight Enterprises Inc.",hadOpportunity:!0},{id:"001Wj00000gH7ua",name:"JFrog",hadOpportunity:!0},{id:"001Wj00000tNwur",name:"Janus Henderson",hadOpportunity:!1},{id:"001Wj00000iC14X",name:"Klarna",hadOpportunity:!0},{id:"001Wj00000wSLUl",name:"LexisNexis",hadOpportunity:!1},{id:"001Wj00000mCFtJ",name:"LinkedIn",hadOpportunity:!0},{id:"001Hp00003kIrJu",name:"Lockheed Martin",hadOpportunity:!0},{id:"001Hp00003kIrKC",name:"Mass Mutual Life Insurance",hadOpportunity:!0},{id:"001Hp00003kIrKO",name:"Microsoft",hadOpportunity:!0},{id:"001Wj00000lyDQk",name:"MidOcean Partners",hadOpportunity:!0},{id:"001Hp00003kIrKT",name:"Morgan Stanley",hadOpportunity:!0},{id:"001Wj00000bWIxq",name:"Motiva",hadOpportunity:!0},{id:"001Hp00003kIrKr",name:"NVIDIA",hadOpportunity:!1},{id:"001Hp00003kIrCx",name:"Novartis",hadOpportunity:!0},{id:"001Wj00000hVTTB",name:"One Oncology",hadOpportunity:!0},{id:"001Wj00000Y6VVW",name:"Oscar Health",hadOpportunity:!0},{id:"001Wj00000eLHLO",name:"Palo Alto Networks",hadOpportunity:!1},{id:"001Wj00000kNp2X",name:"Plusgrade",hadOpportunity:!0},{id:"001Wj00000YoLqW",name:"Procore Technologies",hadOpportunity:!0},{id:"001Wj00000lXD0F",name:"RBI (Burger King)",hadOpportunity:!1},{id:"001Hp00003kIrLx",name:"Republic Services",hadOpportunity:!1},{id:"001Wj00000bWJ0J",name:"SAP",hadOpportunity:!1},{id:"001Hp00003kIrD9",name:"Salesforce",hadOpportunity:!0},{id:"001Wj00000fPr6N",name:"Santander",hadOpportunity:!0},{id:"001Hp00003kIrMK",name:"ServiceNow",hadOpportunity:!0},{id:"001Wj00000eL760",name:"Shell",hadOpportunity:!1},{id:"001Wj00000kNmsg",name:"Skims",hadOpportunity:!0},{id:"001Wj00000aCGR3",name:"Solventum",hadOpportunity:!0},{id:"001Hp00003kIrEC",name:"Southwest Airlines",hadOpportunity:!0},{id:"001Hp00003kIrMc",name:"SpaceX",hadOpportunity:!1},{id:"001Wj00000SdYHq",name:"Spotify",hadOpportunity:!0},{id:"001Hp00003kIrDl",name:"StoneX Group",hadOpportunity:!0},{id:"001Wj00000WYtsU",name:"Tenable",hadOpportunity:!0},{id:"001Hp00003kIrN5",name:"Tesla",hadOpportunity:!1},{id:"001Wj00000c0wRK",name:"The Initial Group",hadOpportunity:!0},{id:"001Wj00000bWBlX",name:"Thomson Reuters Ventures",hadOpportunity:!1},{id:"001Hp00003kIrCs",name:"UPS",hadOpportunity:!0},{id:"001Wj00000tuRNo",name:"Virtusa",hadOpportunity:!0},{id:"001Hp00003kIrNw",name:"W.W. Grainger",hadOpportunity:!0},{id:"001Hp00003kIrNy",name:"Walmart",hadOpportunity:!0},{id:"001Wj00000Y64qk",name:"Warburg Pincus LLC",hadOpportunity:!1},{id:"001Wj00000bzz9N",name:"Wealth Partners Capital Group",hadOpportunity:!0},{id:"001Wj00000tuolf",name:"Wynn Las Vegas",hadOpportunity:!0},{id:"001Wj00000bzz9Q",name:"Youtube",hadOpportunity:!0},{id:"001Wj00000uzs1f",name:"Zero RFI",hadOpportunity:!0}]},"conor.molloy@eudia.com":{email:"conor.molloy@eudia.com",name:"Conor Molloy",accounts:[{id:"001Wj00000mCFrf",name:"APEX Group",hadOpportunity:!1},{id:"001Wj00000xxtg6",name:"ASR Nederland",hadOpportunity:!1},{id:"001Hp00003kIrQD",name:"Accenture",hadOpportunity:!0},{id:"001Wj00000qLixn",name:"Al Dahra Group Llc",hadOpportunity:!0},{id:"001Wj00000syNyn",name:"Alliance Healthcare",hadOpportunity:!1},{id:"001Hp00003kIrEy",name:"Aramark Ireland",hadOpportunity:!0},{id:"001Wj00000tWwXk",name:"Aramex",hadOpportunity:!1},{id:"001Wj00000xyXlY",name:"Arkema",hadOpportunity:!1},{id:"001Wj00000mCFrg",name:"Aryza",hadOpportunity:!0},{id:"001Wj00000xz3F7",name:"Aurubis",hadOpportunity:!1},{id:"001Wj00000bWIzJ",name:"BAE Systems, Inc.",hadOpportunity:!1},{id:"001Wj00000fFhea",name:"BBC News",hadOpportunity:!1},{id:"001Wj00000Y6Vk4",name:"BBC Studios",hadOpportunity:!1},{id:"001Wj00000xypIc",name:"BMW Group",hadOpportunity:!1},{id:"001Wj00000eLPna",name:"BP",hadOpportunity:!1},{id:"001Wj00000tsfWO",name:"Baker Tilly",hadOpportunity:!0},{id:"001Wj00000tWwXr",name:"Bestseller",hadOpportunity:!1},{id:"001Wj00000xz3LZ",name:"Bouygues",hadOpportunity:!1},{id:"001Wj00000xz3Td",name:"British Broadcasting Corporation",hadOpportunity:!1},{id:"001Wj00000xyc3f",name:"Carrefour",hadOpportunity:!1},{id:"001Wj00000tWwXy",name:"Citco",hadOpportunity:!1},{id:"001Wj00000mCFrk",name:"Coillte",hadOpportunity:!0},{id:"001Wj00000mCFsH",name:"Consensys",hadOpportunity:!0},{id:"001Wj00000xxS3B",name:"Currys",hadOpportunity:!1},{id:"001Wj00000Y6Vgo",name:"Cushman & Wakefield",hadOpportunity:!1},{id:"001Wj00000tWwY2",name:"DB Schenker",hadOpportunity:!1},{id:"001Wj00000xxpXf",name:"DZ Bank",hadOpportunity:!1},{id:"001Wj00000bWIzG",name:"DZB BANK GmbH",hadOpportunity:!1},{id:"001Wj00000Y6VMZ",name:"Danone",hadOpportunity:!1},{id:"001Wj00000xyCKX",name:"Deutsche Bahn",hadOpportunity:!1},{id:"001Wj00000tWwY3",name:"Dyson",hadOpportunity:!1},{id:"001Wj00000xy3Iu",name:"E.ON",hadOpportunity:!1},{id:"001Wj00000xz3Jx",name:"Electricite de France",hadOpportunity:!1},{id:"001Hp00003kIrHR",name:"Electronic Arts",hadOpportunity:!1},{id:"001Wj00000xz373",name:"Energie Baden-Wurttemberg",hadOpportunity:!1},{id:"001Wj00000xwnL0",name:"Evonik Industries",hadOpportunity:!1},{id:"001Wj00000xyr5v",name:"FMS Wertmanagement",hadOpportunity:!1},{id:"001Wj00000Y6DDb",name:"Federal Reserve Bank of New York",hadOpportunity:!1},{id:"001Wj00000tWwYf",name:"Fenergo",hadOpportunity:!1},{id:"001Wj00000xxuFZ",name:"Finatis",hadOpportunity:!1},{id:"001Wj00000xz3QP",name:"Groupe SEB",hadOpportunity:!1},{id:"001Wj00000syXLZ",name:"Guerbet",hadOpportunity:!1},{id:"001Wj00000xyP83",name:"Heraeus Holding",hadOpportunity:!1},{id:"001Wj00000xxuVh",name:"Hermes International",hadOpportunity:!1},{id:"001Wj00000xz32D",name:"Hornbach Group",hadOpportunity:!1},{id:"001Wj00000hkk0u",name:"ICON",hadOpportunity:!1},{id:"001Wj00000mCFr2",name:"ICON Clinical Research",hadOpportunity:!0},{id:"001Wj00000Y64qd",name:"ION",hadOpportunity:!0},{id:"001Wj00000xz3AH",name:"Ingka Group",hadOpportunity:!1},{id:"001Wj00000tWwXa",name:"Jacobs Engineering Group",hadOpportunity:!1},{id:"001Wj00000xz30c",name:"Johnson Matthey",hadOpportunity:!1},{id:"001Wj00000mCFtM",name:"Kellanova",hadOpportunity:!0},{id:"001Wj00000xz3S1",name:"Klockner",hadOpportunity:!1},{id:"001Wj00000tWwYC",name:"Kuehne & Nagel",hadOpportunity:!1},{id:"001Wj00000bWIym",name:"LSEG",hadOpportunity:!1},{id:"001Wj00000Y6VZE",name:"Linde",hadOpportunity:!1},{id:"001Wj00000xy1Lu",name:"M&G",hadOpportunity:!1},{id:"001Wj00000xz0h4",name:"Metinvest",hadOpportunity:!1},{id:"001Wj00000xyNse",name:"NN Group",hadOpportunity:!1},{id:"001Wj00000xyECc",name:"Network Rail",hadOpportunity:!1},{id:"001Wj00000xyudG",name:"Nordex",hadOpportunity:!1},{id:"001Wj00000tWwXc",name:"Ocorian",hadOpportunity:!1},{id:"001Wj00000fFW1m",name:"Okta",hadOpportunity:!1},{id:"001Wj00000mCFrI",name:"Orsted",hadOpportunity:!0},{id:"001Wj00000tWwYK",name:"PGIM",hadOpportunity:!1},{id:"001Wj00000xz38f",name:"PPF Group",hadOpportunity:!1},{id:"001Wj00000tWwYi",name:"Penneys",hadOpportunity:!1},{id:"001Wj00000tWwYL",name:"Philips Electronics",hadOpportunity:!1},{id:"001Wj00000tWwYP",name:"Reddit",hadOpportunity:!1},{id:"001Wj00000mCFrU",name:"Riot Games",hadOpportunity:!0},{id:"001Wj00000xyD0Q",name:"Rolls-Royce",hadOpportunity:!1},{id:"001Wj00000xxIqC",name:"Royal Ahold Delhaize",hadOpportunity:!1},{id:"001Wj00000xz3Gj",name:"Rubis",hadOpportunity:!1},{id:"001Wj00000xyrh0",name:"Salzgitter",hadOpportunity:!1},{id:"001Wj00000bWBm6",name:"Schneider Electric",hadOpportunity:!1},{id:"001Wj00000mI9Nm",name:"Sequoia Climate Fund",hadOpportunity:!1},{id:"001Wj00000fCp7J",name:"Siemens",hadOpportunity:!1},{id:"001Wj00000tWwYR",name:"Smurfit Kappa",hadOpportunity:!1},{id:"001Wj00000tWwYS",name:"Stewart",hadOpportunity:!1},{id:"001Wj00000syavy",name:"Symrise AG",hadOpportunity:!1},{id:"001Wj00000mCFs0",name:"Taoglas Limited",hadOpportunity:!0},{id:"001Wj00000mCFtP",name:"Teamwork.com",hadOpportunity:!0},{id:"001Wj00000sxsOq",name:"TechnipFMC",hadOpportunity:!1},{id:"001Wj00000tWwXe",name:"Teneo",hadOpportunity:!1},{id:"001Wj00000Y64qc",name:"Thales",hadOpportunity:!1},{id:"001Hp00003kIrNJ",name:"Toyota",hadOpportunity:!0},{id:"001Wj00000mCFqw",name:"Ulster Bank",hadOpportunity:!1},{id:"001Wj00000xxDSI",name:"Unedic",hadOpportunity:!1},{id:"001Wj00000mCFs2",name:"Vantage Towers",hadOpportunity:!0},{id:"001Hp00003kIrNs",name:"Vistra",hadOpportunity:!0},{id:"001Wj00000Y6VZD",name:"WPP",hadOpportunity:!0},{id:"001Wj00000ZLVpT",name:"Wellspring Philanthropic Fund",hadOpportunity:!0},{id:"001Wj00000mCFsY",name:"World Rugby",hadOpportunity:!1},{id:"001Wj00000xyygs",name:"Wurth",hadOpportunity:!1},{id:"001Wj00000aLlzL",name:"Xerox",hadOpportunity:!1},{id:"001Wj00000j3QNL",name:"adidas",hadOpportunity:!1}]},"david.vanreyk@eudia.com":{email:"david.vanreyk@eudia.com",name:"David Van Reyk",accounts:[{id:"001Wj00000cIA4i",name:"Amerivet",hadOpportunity:!0},{id:"001Wj00000dw9pN",name:"Ardian",hadOpportunity:!0}]},"emer.flynn@eudia.com":{email:"emer.flynn@eudia.com",name:"Emer Flynn",accounts:[{id:"001Wj00000syUts",name:"Bakkavor",hadOpportunity:!1},{id:"001Wj00000syAdO",name:"Bonduelle",hadOpportunity:!1},{id:"001Wj00000syAoe",name:"Gerresheimer",hadOpportunity:!1},{id:"001Wj00000syBb5",name:"Harbour Energy",hadOpportunity:!1},{id:"001Wj00000soqIv",name:"Lundbeck",hadOpportunity:!1},{id:"001Wj00000mCFr6",name:"NTMA",hadOpportunity:!0},{id:"001Wj00000sxy9J",name:"Orion Pharma",hadOpportunity:!1},{id:"001Wj00000soqNk",name:"Sobi",hadOpportunity:!1},{id:"001Wj00000sy54F",name:"SubSea7",hadOpportunity:!1},{id:"001Wj00000sxvzJ",name:"Virbac",hadOpportunity:!1}]},"greg.machale@eudia.com":{email:"greg.machale@eudia.com",name:"Greg MacHale",accounts:[{id:"001Wj00000Y64ql",name:"ABN AMRO Bank N.V.",hadOpportunity:!1},{id:"001Wj00000tWwYd",name:"AXA",hadOpportunity:!1},{id:"001Hp00003kIrEF",name:"Abbott Laboratories",hadOpportunity:!0},{id:"001Wj00000tWwXg",name:"Abtran",hadOpportunity:!1},{id:"001Wj00000umCEl",name:"Aerogen",hadOpportunity:!1},{id:"001Wj00000xyMyB",name:"Air Liquide",hadOpportunity:!1},{id:"001Wj00000tWwYa",name:"Allergan",hadOpportunity:!1},{id:"001Wj00000sgXdB",name:"Allianz Insurance",hadOpportunity:!0},{id:"001Wj00000tWwYb",name:"Almac Group",hadOpportunity:!1},{id:"001Hp00003kIrEm",name:"Amgen",hadOpportunity:!1},{id:"001Wj00000pzTPu",name:"Arrow Global Group PLC/Mars Capital",hadOpportunity:!1},{id:"001Wj00000tWwXm",name:"Arvato Digital Services",hadOpportunity:!1},{id:"001Wj00000tWwXn",name:"Arvato Supply Chain Solutions",hadOpportunity:!1},{id:"001Wj00000tWwYc",name:"Arvato Systems",hadOpportunity:!1},{id:"001Wj00000xz3VF",name:"Asklepios",hadOpportunity:!1},{id:"001Wj00000vWwfx",name:"Associated British Foods",hadOpportunity:!1},{id:"001Hp00003kIrFB",name:"AstraZeneca",hadOpportunity:!1},{id:"001Wj00000bWJ0A",name:"Atos",hadOpportunity:!1},{id:"001Wj00000hfWMu",name:"Aya Healthcare",hadOpportunity:!1},{id:"001Wj00000tWwXV",name:"BCM Group",hadOpportunity:!1},{id:"001Wj00000tWwXU",name:"BCMGlobal ASI Ltd",hadOpportunity:!1},{id:"001Wj00000Y6VMd",name:"BNP Paribas",hadOpportunity:!0},{id:"001Wj00000X4OqN",name:"BT Group",hadOpportunity:!0},{id:"001Wj00000vRJ13",name:"BWG Group",hadOpportunity:!1},{id:"001Wj00000bWBsw",name:"Bausch + Lomb",hadOpportunity:!1},{id:"001Hp00003kIrFO",name:"Baxter International",hadOpportunity:!1},{id:"001Wj00000wLIjh",name:"Baywa",hadOpportunity:!1},{id:"001Wj00000tWwXs",name:"Bidvest Noonan",hadOpportunity:!1},{id:"001Wj00000mCFqr",name:"Biomarin International Limited",hadOpportunity:!0},{id:"001Hp00003kIrFd",name:"Booking Holdings",hadOpportunity:!0},{id:"001Wj00000T5gdt",name:"Bosch",hadOpportunity:!1},{id:"001Hp00003kIrFg",name:"Boston Scientific",hadOpportunity:!1},{id:"001Wj00000xyNsd",name:"Brenntag",hadOpportunity:!1},{id:"001Wj00000tgYgj",name:"British American Tobacco ( BAT )",hadOpportunity:!1},{id:"001Wj00000ulXoK",name:"British Petroleum ( BP )",hadOpportunity:!1},{id:"001Hp00003kIrDK",name:"Bupa",hadOpportunity:!1},{id:"001Wj00000bWBkr",name:"CRH",hadOpportunity:!1},{id:"001Wj00000uZ5J7",name:"Canada Life",hadOpportunity:!0},{id:"001Hp00003kIrFu",name:"Capgemini",hadOpportunity:!1},{id:"001Wj00000tWwYe",name:"Capita",hadOpportunity:!1},{id:"001Wj00000mCFt9",name:"Cerberus European Servicing",hadOpportunity:!0},{id:"001Wj00000tWwXz",name:"CluneTech",hadOpportunity:!1},{id:"001Wj00000wKnrE",name:"Co-operative Group ( Co-op )",hadOpportunity:!1},{id:"001Wj00000Y6HEM",name:"Commerzbank AG",hadOpportunity:!1},{id:"001Wj00000aLp9L",name:"Compass",hadOpportunity:!1},{id:"001Wj00000cSBr6",name:"Compass Group Equity Partners",hadOpportunity:!1},{id:"001Wj00000Y6VMk",name:"Computershare",hadOpportunity:!0},{id:"001Wj00000uP5x8",name:"Cornmarket Financial Services",hadOpportunity:!0},{id:"001Wj00000tWwY0",name:"Cornmarket Hill Trading Limited",hadOpportunity:!1},{id:"001Hp00003kIrGk",name:"Covestro",hadOpportunity:!1},{id:"001Wj00000tWwXY",name:"DCC Vital",hadOpportunity:!1},{id:"001Wj00000mCFrV",name:"Danske Bank",hadOpportunity:!1},{id:"001Hp00003kJ9fx",name:"Deutsche Bank AG",hadOpportunity:!1},{id:"001Wj00000Y6VMM",name:"Diageo",hadOpportunity:!0},{id:"001Wj00000prFOX",name:"Doosan Bobcat",hadOpportunity:!0},{id:"001Wj00000wKzZ1",name:"Drax Group",hadOpportunity:!1},{id:"001Hp00003kIrHQ",name:"EG Group",hadOpportunity:!1},{id:"001Wj00000hUcQZ",name:"EY",hadOpportunity:!0},{id:"001Wj00000wK30S",name:"EY ( Ernst & Young )",hadOpportunity:!1},{id:"001Hp00003kIrHL",name:"Eaton Corporation",hadOpportunity:!1},{id:"001Wj00000mCFtR",name:"Ekco Cloud Limited",hadOpportunity:!0},{id:"001Hp00003kIrHS",name:"Elevance Health",hadOpportunity:!1},{id:"001Hp00003kIrHT",name:"Eli Lilly",hadOpportunity:!1},{id:"001Wj00000Y6HEn",name:"Ferring Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000tWwYn",name:"Fibrus",hadOpportunity:!1},{id:"001Hp00003kIrHu",name:"Fidelity Investments",hadOpportunity:!1},{id:"001Hp00003kIrI0",name:"Fiserv",hadOpportunity:!1},{id:"001Wj00000xxg4V",name:"Fnac Darty",hadOpportunity:!1},{id:"001Wj00000wL79x",name:"Frasers Group",hadOpportunity:!1},{id:"001Wj00000aLlyX",name:"Gartner",hadOpportunity:!1},{id:"001Wj00000fFuFY",name:"Grant Thornton",hadOpportunity:!0},{id:"001Wj00000uZ4A9",name:"Great West Lifec co",hadOpportunity:!0},{id:"001Wj00000pzTPt",name:"Gym Plus Coffee",hadOpportunity:!1},{id:"001Wj00000xW3SE",name:"Hayfin",hadOpportunity:!0},{id:"001Wj00000pzTPm",name:"Hedgserv",hadOpportunity:!1},{id:"001Wj00000xxsbv",name:"Heidelberg Materials",hadOpportunity:!1},{id:"001Wj00000wvtPl",name:"ICEYE",hadOpportunity:!0},{id:"001Wj00000mCFrH",name:"Indra",hadOpportunity:!1},{id:"001Wj00000uZtcT",name:"Ineos",hadOpportunity:!0},{id:"001Wj00000vXdt1",name:"International Airline Group ( IAG )",hadOpportunity:!1},{id:"001Wj00000wKnZU",name:"International Distribution Services",hadOpportunity:!1},{id:"001Wj00000wKTao",name:"John Swire & Sons",hadOpportunity:!1},{id:"001Wj00000vaqot",name:"Johnson Controls",hadOpportunity:!1},{id:"001Wj00000xwwRX",name:"Jumbo Groep Holding",hadOpportunity:!1},{id:"001Hp00003kIrJb",name:"KPMG",hadOpportunity:!1},{id:"001Wj00000Y6VZM",name:"Kering",hadOpportunity:!1},{id:"001Wj00000mCFrr",name:"Kerry Group",hadOpportunity:!1},{id:"001Wj00000xyyk7",name:"La Poste",hadOpportunity:!1},{id:"001Wj00000tWwYr",name:"Laya Healthcare",hadOpportunity:!1},{id:"001Wj00000tWwYE",name:"Leaseplan",hadOpportunity:!1},{id:"001Wj00000tWwYF",name:"Linked Finance",hadOpportunity:!1},{id:"001Wj00000Y6HEA",name:"Lloyds Banking Group",hadOpportunity:!1},{id:"001Wj00000xyDV4",name:"LyondellBasell Industries",hadOpportunity:!1},{id:"001Wj00000tWwYG",name:"MSC - Mediterranean Shipping Company",hadOpportunity:!1},{id:"001Wj00000wvGLB",name:"MTU Maintenance Lease Services",hadOpportunity:!1},{id:"001Wj00000iC14L",name:"MUFG Investor Services",hadOpportunity:!1},{id:"001Wj00000xyp2U",name:"MVV Energie",hadOpportunity:!1},{id:"001Wj00000tWwYp",name:"Mail Metrics",hadOpportunity:!0},{id:"001Wj00000qFtCk",name:"Mars Capital",hadOpportunity:!1},{id:"001Wj00000pAeWg",name:"Meetingsbooker",hadOpportunity:!0},{id:"001Hp00003kIrKJ",name:"Mercedes-Benz Group",hadOpportunity:!0},{id:"001Wj00000YEMaI",name:"Mercer",hadOpportunity:!1},{id:"001Wj00000vwSUX",name:"Mercor",hadOpportunity:!0},{id:"001Wj00000mCFtU",name:"Mercury Engineering",hadOpportunity:!0},{id:"001Wj00000yGZth",name:"Monzo",hadOpportunity:!1},{id:"001Wj00000tWwYg",name:"Musgrave",hadOpportunity:!1},{id:"001Wj00000lPFP3",name:"Nomura",hadOpportunity:!0},{id:"001Wj00000tWwYH",name:"Norbrook Laboratories",hadOpportunity:!1},{id:"001Hp00003kIrKn",name:"Northrop Grumman",hadOpportunity:!1},{id:"001Wj00000xxcH4",name:"Orange",hadOpportunity:!1},{id:"001Wj00000tWwYI",name:"P.J. Carroll (BAT Ireland)",hadOpportunity:!1},{id:"001Wj00000mCFsf",name:"Pepper Finance Corporation",hadOpportunity:!0},{id:"001Wj00000mCFrO",name:"Peptalk",hadOpportunity:!0},{id:"001Wj00000mCFr1",name:"Permanent TSB plc",hadOpportunity:!0},{id:"001Wj00000Y6QfR",name:"Pernod Ricard",hadOpportunity:!0},{id:"001Wj00000vVxFy",name:"Phoenix Group",hadOpportunity:!1},{id:"001Wj00000tWwYM",name:"Pinewood Laboratories",hadOpportunity:!1},{id:"001Wj00000tWwYN",name:"Pinsent Masons",hadOpportunity:!1},{id:"001Wj00000tWwYO",name:"Pramerica",hadOpportunity:!1},{id:"001Hp00003kIrLf",name:"PwC",hadOpportunity:!1},{id:"001Hp00003kIrLi",name:"Quest Diagnostics",hadOpportunity:!0},{id:"001Wj00000xy735",name:"RATP Group",hadOpportunity:!1},{id:"001Wj00000xyKjS",name:"Randstad",hadOpportunity:!1},{id:"001Wj00000mCFsF",name:"Regeneron",hadOpportunity:!0},{id:"001Wj00000xwh4H",name:"Renault",hadOpportunity:!1},{id:"001Wj00000xy1P5",name:"Rheinmetall",hadOpportunity:!1},{id:"001Wj00000tWwYQ",name:"Roche",hadOpportunity:!1},{id:"001Wj00000wKi8O",name:"Royal London",hadOpportunity:!1},{id:"001Wj00000mCFsR",name:"Ryanair",hadOpportunity:!0},{id:"001Wj00000xyJqd",name:"SCOR",hadOpportunity:!1},{id:"001Wj00000pAxKo",name:"SSP Group",hadOpportunity:!0},{id:"001Wj00000bWIzx",name:"Saint-Gobain",hadOpportunity:!1},{id:"001Wj00000pzTPv",name:"Scottish Friendly",hadOpportunity:!1},{id:"001Wj00000bzz9U",name:"Signify Group",hadOpportunity:!0},{id:"001Wj00000fFuG4",name:"Sky",hadOpportunity:!1},{id:"001Hp00003kIrDR",name:"Smith & Nephew",hadOpportunity:!1},{id:"001Hp00003kIrE1",name:"Societe Generale",hadOpportunity:!1},{id:"001Hp00003kIrMj",name:"State Street",hadOpportunity:!0},{id:"001Wj00000xyy4A",name:"Sudzucker",hadOpportunity:!1},{id:"001Wj00000mCFtB",name:"SurveyMonkey",hadOpportunity:!1},{id:"001Wj00000xypQh",name:"TUI",hadOpportunity:!1},{id:"001Wj00000tWwYT",name:"Takeda",hadOpportunity:!1},{id:"001Wj00000wKD4c",name:"Talanx",hadOpportunity:!1},{id:"001Wj00000mCFr9",name:"Tesco",hadOpportunity:!0},{id:"001Wj00000tWwYX",name:"Tullow Oil",hadOpportunity:!1},{id:"001Wj00000mCFsS",name:"Uniphar PLC",hadOpportunity:!0},{id:"001Hp00003kIrNg",name:"UnitedHealth Group",hadOpportunity:!1},{id:"001Wj00000mCFsx",name:"Vodafone Ireland",hadOpportunity:!1},{id:"001Wj00000xybh4",name:"Wendel",hadOpportunity:!1},{id:"001Wj00000sCb3D",name:"Willis Towers Watson",hadOpportunity:!1},{id:"001Wj00000tWwYY",name:"Winthrop",hadOpportunity:!1},{id:"001Wj00000pzTPW",name:"WizzAir",hadOpportunity:!1},{id:"001Wj00000mCFrm",name:"eShopWorld",hadOpportunity:!0},{id:"001Hp00003kJ9Ck",name:"wnco.com",hadOpportunity:!1}]},"himanshu.agarwal@eudia.com":{email:"himanshu.agarwal@eudia.com",name:"Himanshu Agarwal",accounts:[{id:"001Hp00003kIrEs",name:"AON",hadOpportunity:!0},{id:"001Wj00000RwUpO",name:"Acrisure",hadOpportunity:!0},{id:"001Hp00003kIrCd",name:"Adobe",hadOpportunity:!1},{id:"001Hp00003kIrEU",name:"Albertsons",hadOpportunity:!0},{id:"001Wj00000T6Hrw",name:"Atlassian",hadOpportunity:!0},{id:"001Wj00000ZRrYl",name:"Avis Budget Group",hadOpportunity:!0},{id:"001Wj00000kIYAD",name:"Axis Bank",hadOpportunity:!0},{id:"001Hp00003kIrD0",name:"Broadcom",hadOpportunity:!0},{id:"001Hp00003kIrGh",name:"Costco Wholesale",hadOpportunity:!1},{id:"001Hp00003kIrCu",name:"Disney",hadOpportunity:!1},{id:"001Hp00003kIrIF",name:"Gap",hadOpportunity:!0},{id:"001Hp00003kIrDN",name:"Genpact",hadOpportunity:!0},{id:"001Wj00000Zcmad",name:"Geodis",hadOpportunity:!0},{id:"001Wj00000Q2yaX",name:"Innovative Driven",hadOpportunity:!1},{id:"001Hp00003lhshd",name:"Instacart",hadOpportunity:!0},{id:"001Hp00003kIrJx",name:"Lowe's",hadOpportunity:!1},{id:"001Hp00003kIrDk",name:"Moderna",hadOpportunity:!0},{id:"001Wj00000hDvCc",name:"Nykaa",hadOpportunity:!0},{id:"001Wj00000h9r1F",name:"Piramal Finance",hadOpportunity:!0},{id:"001Hp00003kIrDc",name:"Progressive",hadOpportunity:!0},{id:"001Wj00000cyDxS",name:"Pyxus",hadOpportunity:!0},{id:"001Wj00000XXvnk",name:"Relativity",hadOpportunity:!0},{id:"001Wj00000kIFDh",name:"Reliance",hadOpportunity:!0},{id:"001Wj00000eKsGZ",name:"Snowflake",hadOpportunity:!1},{id:"001Hp00003kIrNr",name:"Visa",hadOpportunity:!0},{id:"001Hp00003kIrO0",name:"Warner Bros Discovery",hadOpportunity:!1},{id:"001Hp00003kIrDT",name:"xAI",hadOpportunity:!0}]},"jon.cobb@eudia.com":{email:"jon.cobb@eudia.com",name:"Jon Cobb",accounts:[{id:"001Wj00000XTOQZ",name:"Armstrong World Industries",hadOpportunity:!0},{id:"001Wj00000c0Cxn",name:"U.S. Aircraft Insurance Group",hadOpportunity:!0}]},"julie.stefanich@eudia.com":{email:"julie.stefanich@eudia.com",name:"Julie Stefanich",accounts:[{id:"001Wj00000asSHB",name:"Airbus",hadOpportunity:!0},{id:"001Hp00003kIrEl",name:"Ameriprise Financial",hadOpportunity:!0},{id:"001Wj00000X6IDs",name:"Andersen",hadOpportunity:!0},{id:"001Hp00003kIrEv",name:"Apple",hadOpportunity:!0},{id:"001Wj00000soLVH",name:"Base Power",hadOpportunity:!0},{id:"001Hp00003kJ9pX",name:"Bayer",hadOpportunity:!0},{id:"001Hp00003kIrFP",name:"Bechtel",hadOpportunity:!0},{id:"001Hp00003kIrFZ",name:"Block",hadOpportunity:!0},{id:"001Hp00003kIrE3",name:"Cargill",hadOpportunity:!0},{id:"001Hp00003kIrGD",name:"Charles Schwab",hadOpportunity:!0},{id:"001Hp00003kIrE4",name:"Chevron",hadOpportunity:!0},{id:"001Hp00003kIrDh",name:"Comcast",hadOpportunity:!0},{id:"001Hp00003kIrGe",name:"Corebridge Financial",hadOpportunity:!0},{id:"001Wj00000eLJAK",name:"CrowdStrike",hadOpportunity:!1},{id:"001Hp00003liBe9",name:"DoorDash",hadOpportunity:!1},{id:"001Hp00003kIrE7",name:"ECMS",hadOpportunity:!0},{id:"001Hp00003kIrHP",name:"Edward Jones",hadOpportunity:!0},{id:"001Wj00000iRzqv",name:"Florida Crystals Corporation",hadOpportunity:!0},{id:"001Wj00000XS3MX",name:"Flutter",hadOpportunity:!0},{id:"001Hp00003kIrIP",name:"Genworth Financial",hadOpportunity:!0},{id:"001Hp00003kIrIX",name:"Goldman Sachs",hadOpportunity:!0},{id:"001Wj00000rceVp",name:"Hikma",hadOpportunity:!0},{id:"001Hp00003kIrJV",name:"KLA",hadOpportunity:!0},{id:"001Wj00000XkT43",name:"Kaiser Permanente",hadOpportunity:!0},{id:"001Wj00000aLmhe",name:"Macmillan",hadOpportunity:!0},{id:"001Wj00000X6G8q",name:"Mainsail Partners",hadOpportunity:!0},{id:"001Hp00003kIrDb",name:"McKinsey & Company",hadOpportunity:!0},{id:"001Hp00003kIrKL",name:"MetLife",hadOpportunity:!0},{id:"001Hp00003kIrCp",name:"Mosaic",hadOpportunity:!0},{id:"001Hp00003kIrDe",name:"National Grid",hadOpportunity:!0},{id:"001Hp00003kIrKY",name:"Netflix",hadOpportunity:!0},{id:"001Hp00003kIrKj",name:"Nordstrom",hadOpportunity:!0},{id:"001Hp00003kIrL2",name:"O'Reilly Automotive",hadOpportunity:!0},{id:"001Hp00003kIrDv",name:"Oracle",hadOpportunity:!0},{id:"001Hp00003kIrLP",name:"PG&E",hadOpportunity:!1},{id:"001Hp00003kIrLH",name:"PayPal inc.",hadOpportunity:!1},{id:"001Hp00003kIrLN",name:"Petsmart",hadOpportunity:!0},{id:"001Hp00003kIrLZ",name:"Procter & Gamble",hadOpportunity:!0},{id:"001Wj00000XcHEb",name:"Resmed",hadOpportunity:!0},{id:"001Hp00003lhsUY",name:"Rio Tinto Group",hadOpportunity:!0},{id:"001Wj00000svQI3",name:"Safelite",hadOpportunity:!0},{id:"001Wj00000Yfysf",name:"Samsara",hadOpportunity:!0},{id:"001Wj00000fRtLm",name:"State Farm",hadOpportunity:!0},{id:"001Hp00003kIrNH",name:"T-Mobile",hadOpportunity:!0},{id:"001Hp00003kIrCr",name:"TIAA",hadOpportunity:!0},{id:"001Wj00000bIVo1",name:"TSMC",hadOpportunity:!0},{id:"001Wj00000bzz9T",name:"Tailored Brands",hadOpportunity:!0},{id:"001Hp00003kIrNB",name:"The Wonderful Company",hadOpportunity:!0},{id:"001Hp00003kIrNV",name:"Uber",hadOpportunity:!0},{id:"001Wj00000Y6VYk",name:"Verifone",hadOpportunity:!0},{id:"001Hp00003kIrOL",name:"World Wide Technology",hadOpportunity:!0},{id:"001Wj00000bWIza",name:"eBay",hadOpportunity:!1}]},"justin.hills@eudia.com":{email:"justin.hills@eudia.com",name:"Justin Hills",accounts:[{id:"001Wj00000vCx6j",name:"1800 Flowers",hadOpportunity:!1},{id:"001Wj00000Y6VM4",name:"Ares Management Corporation",hadOpportunity:!0},{id:"001Hp00003kIrG8",name:"Centene",hadOpportunity:!0},{id:"001Wj00000c9oCv",name:"Cox Media Group",hadOpportunity:!0},{id:"001Wj00000vCPMs",name:"Crusoe",hadOpportunity:!1},{id:"001Wj00000vCiAw",name:"Deel",hadOpportunity:!1},{id:"001Wj00000Y0jPm",name:"Delinea",hadOpportunity:!0},{id:"001Wj00000iwKGQ",name:"Dominos",hadOpportunity:!0},{id:"001Hp00003kIrDa",name:"Duracell",hadOpportunity:!0},{id:"001Wj00000Y6Vde",name:"EPIC Insurance Brokers & Consultants",hadOpportunity:!1},{id:"001Hp00003kIrIC",name:"Freddie Mac",hadOpportunity:!1},{id:"001Hp00003kJ9gW",name:"Genentech",hadOpportunity:!0},{id:"001Hp00003kIrDV",name:"Intel",hadOpportunity:!0},{id:"001Hp00003kIrJJ",name:"Johnson & Johnson",hadOpportunity:!0},{id:"001Wj00000gnrug",name:"Kraken",hadOpportunity:!0},{id:"001Wj00000op4EW",name:"McCormick & Co Inc",hadOpportunity:!0},{id:"001Wj00000RCeqA",name:"Nielsen",hadOpportunity:!0},{id:"001Wj00000YEMZp",name:"Notion",hadOpportunity:!1},{id:"001Wj00000ix7c2",name:"Nouryon",hadOpportunity:!0},{id:"001Wj00000WYyKI",name:"Ramp",hadOpportunity:!0},{id:"001Wj00000hzxnD",name:"Ro Healthcare",hadOpportunity:!1},{id:"001Hp00003kIrMi",name:"Starbucks",hadOpportunity:!0},{id:"001Wj00000o5G0v",name:"StockX",hadOpportunity:!0},{id:"001Wj00000f3bWU",name:"TransUnion",hadOpportunity:!0},{id:"001Wj00000oqRyc",name:"Walgreens Boots Alliance",hadOpportunity:!0}]},"mike.ayres@eudia.com":{email:"mike.ayres@eudia.com",name:"Mike Ayres",accounts:[{id:"001Wj00000synYD",name:"Barry Callebaut Group",hadOpportunity:!1}]},"mike@eudia.com":{email:"mike@eudia.com",name:"Mike Masiello",accounts:[{id:"001Wj00000celOy",name:"Arizona Gov Office",hadOpportunity:!1},{id:"001Wj00000p1lCP",name:"Army Applications Lab",hadOpportunity:!0},{id:"001Wj00000p1hYb",name:"Army Corps of Engineers",hadOpportunity:!0},{id:"001Wj00000ZxEpD",name:"Army Futures Command",hadOpportunity:!0},{id:"001Hp00003lhZrR",name:"DARPA",hadOpportunity:!0},{id:"001Wj00000bWBlA",name:"Defense Innovation Unit (DIU)",hadOpportunity:!0},{id:"001Hp00003kJzoR",name:"Gov - Civ",hadOpportunity:!1},{id:"001Hp00003kJuJ5",name:"Gov - DOD",hadOpportunity:!0},{id:"001Wj00000p1PVH",name:"IFC",hadOpportunity:!0},{id:"001Wj00000UkYiC",name:"MITRE",hadOpportunity:!1},{id:"001Wj00000VVJ31",name:"NATO",hadOpportunity:!0},{id:"001Wj00000Ukxzt",name:"SIIA",hadOpportunity:!1},{id:"001Wj00000p1Ybm",name:"SOCOM",hadOpportunity:!0},{id:"001Wj00000Zwarp",name:"Second Front",hadOpportunity:!1},{id:"001Hp00003lhcL9",name:"Social Security Administration",hadOpportunity:!0},{id:"001Wj00000p1jH3",name:"State of Alaska",hadOpportunity:!0},{id:"001Wj00000hVa6V",name:"State of Arizona",hadOpportunity:!0},{id:"001Wj00000p0PcE",name:"State of California",hadOpportunity:!0},{id:"001Wj00000bWBke",name:"U.S. Air Force",hadOpportunity:!0},{id:"001Wj00000bWIzN",name:"U.S. Army",hadOpportunity:!0},{id:"001Hp00003kIrDU",name:"U.S. Government",hadOpportunity:!1},{id:"001Wj00000p1SRX",name:"U.S. Marine Corps",hadOpportunity:!0},{id:"001Wj00000hfaDc",name:"U.S. Navy",hadOpportunity:!0},{id:"001Wj00000Rrm5O",name:"UK Government",hadOpportunity:!0},{id:"001Hp00003lieJP",name:"USDA",hadOpportunity:!0},{id:"001Wj00000p1SuZ",name:"Vulcan Special Ops",hadOpportunity:!0}]},"mitch.loquaci@eudia.com":{email:"mitch.loquaci@eudia.com",name:"Mitch Loquaci",accounts:[{id:"001Hp00003kIrCn",name:"Home Depot",hadOpportunity:!0},{id:"001Wj00000wlTbU",name:"Mimecast",hadOpportunity:!1},{id:"001Wj00000cpxt0",name:"Novelis",hadOpportunity:!0}]},"nathan.shine@eudia.com":{email:"nathan.shine@eudia.com",name:"Nathan Shine",accounts:[{id:"001Wj00000xy4hv",name:"ASDA Group",hadOpportunity:!1},{id:"001Wj00000xz26A",name:"Achmea",hadOpportunity:!1},{id:"001Wj00000xyb9C",name:"Adient",hadOpportunity:!1},{id:"001Hp00003kIrEn",name:"Amphenol",hadOpportunity:!0},{id:"001Wj00000mCFr3",name:"Ancestry",hadOpportunity:!0},{id:"001Wj00000xxHhF",name:"Ashtead Group",hadOpportunity:!1},{id:"001Wj00000mCFr5",name:"Boomi",hadOpportunity:!1},{id:"001Wj00000mCFrQ",name:"CaliberAI",hadOpportunity:!1},{id:"001Wj00000WiFP8",name:"Cantor Fitzgerald",hadOpportunity:!0},{id:"001Wj00000mCFrj",name:"CarTrawler",hadOpportunity:!0},{id:"001Wj00000xz2UM",name:"Carnival",hadOpportunity:!1},{id:"001Wj00000pzTPd",name:"Circle K",hadOpportunity:!1},{id:"001Wj00000xyP82",name:"Claas Group",hadOpportunity:!1},{id:"001Wj00000bW3KA",name:"Cloud Software Group",hadOpportunity:!1},{id:"001Wj00000mHDBo",name:"Coimisiun na Mean",hadOpportunity:!0},{id:"001Wj00000mCFqt",name:"CommScope Technologies",hadOpportunity:!0},{id:"001Wj00000xz2ZC",name:"Continental",hadOpportunity:!1},{id:"001Wj00000Y6wFZ",name:"Coursera",hadOpportunity:!1},{id:"001Wj00000xz3DV",name:"Credit Mutuel Group",hadOpportunity:!1},{id:"001Wj00000Y6DDY",name:"Credit Suisse",hadOpportunity:!1},{id:"001Wj00000pzTPZ",name:"CubeMatch",hadOpportunity:!1},{id:"001Wj00000pzTPb",name:"Dawn Meats",hadOpportunity:!1},{id:"001Wj00000xxtwB",name:"Deutsche Telekom",hadOpportunity:!1},{id:"001Hp00003kIrDM",name:"Dropbox",hadOpportunity:!0},{id:"001Wj00000mCFra",name:"Dunnes Stores",hadOpportunity:!0},{id:"001Wj00000xxq75",name:"ELO Group",hadOpportunity:!1},{id:"001Wj00000xyEnj",name:"Engie",hadOpportunity:!1},{id:"001Wj00000mCFqu",name:"Fexco",hadOpportunity:!0},{id:"001Wj00000mCFsA",name:"First Derivatives",hadOpportunity:!1},{id:"001Wj00000mCFtD",name:"Flynn O'Driscoll, Business Lawyers",hadOpportunity:!1},{id:"001Wj00000xyMmu",name:"Forvia",hadOpportunity:!1},{id:"001Wj00000xz3Bt",name:"Freudenberg Group",hadOpportunity:!1},{id:"001Wj00000mCFro",name:"GemCap",hadOpportunity:!0},{id:"001Wj00000xxqjp",name:"Groupama",hadOpportunity:!1},{id:"001Wj00000xyFdR",name:"Groupe Eiffage",hadOpportunity:!1},{id:"001Wj00000xxtuZ",name:"Hays",hadOpportunity:!1},{id:"001Wj00000xy4A2",name:"HelloFresh",hadOpportunity:!1},{id:"001Wj00000mCFrq",name:"ID-Pal",hadOpportunity:!1},{id:"001Wj00000xz3IL",name:"ING Group",hadOpportunity:!1},{id:"001Wj00000xz2xN",name:"Inchcape",hadOpportunity:!1},{id:"001Wj00000mCFs5",name:"Indeed",hadOpportunity:!0},{id:"001Wj00000sooaT",name:"Ipsen",hadOpportunity:!1},{id:"001Wj00000mCFss",name:"Irish League of Credit Unions",hadOpportunity:!0},{id:"001Wj00000mCFrS",name:"Irish Life",hadOpportunity:!0},{id:"001Wj00000mCFsV",name:"Irish Residential Properties REIT Plc",hadOpportunity:!1},{id:"001Hp00003kIrJO",name:"Keurig Dr Pepper",hadOpportunity:!0},{id:"001Wj00000hkk0z",name:"Kingspan",hadOpportunity:!0},{id:"001Wj00000mCFrs",name:"Kitman Labs",hadOpportunity:!0},{id:"001Wj00000xy1VZ",name:"LDC Group",hadOpportunity:!1},{id:"001Wj00000mCFtF",name:"Let's Get Checked",hadOpportunity:!1},{id:"001Hp00003kIrJo",name:"Liberty Insurance",hadOpportunity:!1},{id:"001Wj00000xz2yz",name:"Marks and Spencer Group",hadOpportunity:!1},{id:"001Wj00000mCFsM",name:"McDermott Creed & Martyn",hadOpportunity:!0},{id:"001Hp00003kIrKF",name:"McKesson",hadOpportunity:!1},{id:"001Wj00000mCFso",name:"Mediolanum",hadOpportunity:!0},{id:"001Wj00000xyP9g",name:"Munich Re Group",hadOpportunity:!1},{id:"001Wj00000xxIyF",name:"Nationwide Building Society",hadOpportunity:!1},{id:"001Wj00000xxgZB",name:"Nebius Group",hadOpportunity:!1},{id:"001Wj00000symlp",name:"Nestl\xE9 Health Science",hadOpportunity:!1},{id:"001Wj00000xyYPq",name:"Nexans",hadOpportunity:!1},{id:"001Wj00000xybvb",name:"Next",hadOpportunity:!1},{id:"001Wj00000syczN",name:"Nomad Foods",hadOpportunity:!1},{id:"001Wj00000mCFrF",name:"OKG Payments Services Limited",hadOpportunity:!0},{id:"001Wj00000mCFqy",name:"Oneview Healthcare",hadOpportunity:!1},{id:"001Wj00000aCGRB",name:"Optum",hadOpportunity:!1},{id:"001Wj00000sylmX",name:"Orlen",hadOpportunity:!1},{id:"001Wj00000mCFrL",name:"PROS",hadOpportunity:!1},{id:"001Wj00000ZDPUI",name:"Perrigo Pharma",hadOpportunity:!0},{id:"001Wj00000xz33p",name:"Phoenix Pharma",hadOpportunity:!1},{id:"001Wj00000mCFqz",name:"Phoenix Tower International",hadOpportunity:!0},{id:"001Wj00000pzTPf",name:"Pipedrive",hadOpportunity:!1},{id:"001Wj00000mCFtS",name:"Poe Kiely Hogan Lanigan",hadOpportunity:!0},{id:"001Wj00000xxwys",name:"REWE Group",hadOpportunity:!1},{id:"001Wj00000xz3On",name:"Rexel",hadOpportunity:!1},{id:"001Wj00000xyJLy",name:"Royal BAM Group",hadOpportunity:!1},{id:"001Wj00000xysZq",name:"SPIE",hadOpportunity:!1},{id:"001Wj00000xxuVg",name:"SSE",hadOpportunity:!1},{id:"001Wj00000xxk1y",name:"Schaeffler",hadOpportunity:!1},{id:"001Wj00000syeJe",name:"Schott Pharma",hadOpportunity:!1},{id:"001Wj00000mCFrX",name:"South East Financial Services Cluster",hadOpportunity:!1},{id:"001Wj00000mCFry",name:"Spectrum Wellness Holdings Limited",hadOpportunity:!0},{id:"001Wj00000mCFsq",name:"Speed Fibre Group(enet)",hadOpportunity:!0},{id:"001Wj00000mCFtH",name:"StepStone Group",hadOpportunity:!0},{id:"001Hp00003kIrMp",name:"Stryker",hadOpportunity:!1},{id:"001Wj00000pzTPa",name:"SuperNode Ltd",hadOpportunity:!1},{id:"001Wj00000mCFtI",name:"Swish Fibre",hadOpportunity:!1},{id:"001Wj00000SFiOv",name:"TikTok",hadOpportunity:!0},{id:"001Wj00000ZDXTR",name:"Tinder LLC",hadOpportunity:!0},{id:"001Wj00000mCFrC",name:"Tines Security Services Limited",hadOpportunity:!0},{id:"001Wj00000xxQsc",name:"UDG Healthcare",hadOpportunity:!1},{id:"001Wj00000pzTPe",name:"Udaras na Gaeltachta",hadOpportunity:!1},{id:"001Wj00000bWBlE",name:"Udemy",hadOpportunity:!0},{id:"001Wj00000Y6VMX",name:"Unilever",hadOpportunity:!1},{id:"001Wj00000pzTPc",name:"Urban Volt",hadOpportunity:!1},{id:"001Wj00000xwB2o",name:"Vitesco Technologies Group",hadOpportunity:!1},{id:"001Hp00003liCZY",name:"Workday",hadOpportunity:!1},{id:"001Wj00000xyOlT",name:"X5 Retail Group",hadOpportunity:!1},{id:"001Wj00000xyXQZ",name:"Zalando",hadOpportunity:!1},{id:"001Wj00000Y6VZ3",name:"Ziff Davis",hadOpportunity:!1},{id:"001Wj00000mCFsZ",name:"Zurich Irish Life plc",hadOpportunity:!0}]},"nicola.fratini@eudia.com":{email:"nicola.fratini@eudia.com",name:"Nicola Fratini",accounts:[{id:"001Wj00000mCFqs",name:"AIB",hadOpportunity:!0},{id:"001Wj00000tWwXp",name:"AXIS Capital",hadOpportunity:!1},{id:"001Wj00000tWwXh",name:"Actavo Group Ltd",hadOpportunity:!1},{id:"001Wj00000thuKE",name:"Aer Lingus",hadOpportunity:!0},{id:"001Wj00000tWwXi",name:"Aer Rianta",hadOpportunity:!1},{id:"001Wj00000mCFrG",name:"AerCap",hadOpportunity:!0},{id:"001Wj00000YEMaB",name:"Aligned Incentives, a Bureau Veritas company",hadOpportunity:!1},{id:"001Wj00000mCFs7",name:"Allied Irish Banks plc",hadOpportunity:!0},{id:"001Wj00000mCFsb",name:"Amundi Ireland Limited",hadOpportunity:!0},{id:"001Wj00000uZ7w2",name:"Anna Charles",hadOpportunity:!1},{id:"001Wj00000TUdXw",name:"Anthropic",hadOpportunity:!0},{id:"001Wj00000mCFrD",name:"Applegreen",hadOpportunity:!1},{id:"001Wj00000wvc5a",name:"AppliedAI",hadOpportunity:!0},{id:"001Wj00000socke",name:"Archer The Well Company",hadOpportunity:!1},{id:"001Wj00000tWwXl",name:"Ardagh Glass Sales",hadOpportunity:!1},{id:"001Wj00000sgB1h",name:"Autorek",hadOpportunity:!1},{id:"001Wj00000mCFrh",name:"Avant Money",hadOpportunity:!0},{id:"001Wj00000tWwXT",name:"Avantcard",hadOpportunity:!1},{id:"001Wj00000mI7Na",name:"Aviva Insurance",hadOpportunity:!0},{id:"001Wj00000tWwXo",name:"Avolon",hadOpportunity:!1},{id:"001Wj00000uNUIB",name:"Bank of China",hadOpportunity:!0},{id:"001Hp00003kJ9kN",name:"Barclays",hadOpportunity:!0},{id:"001Wj00000ttPZB",name:"Barings",hadOpportunity:!0},{id:"001Wj00000tWwXW",name:"Beauparc Group",hadOpportunity:!0},{id:"001Wj00000xxRyK",name:"Bertelsmann",hadOpportunity:!1},{id:"001Wj00000tWwXX",name:"Bidx1",hadOpportunity:!1},{id:"001Wj00000soanc",name:"Borr Drilling",hadOpportunity:!1},{id:"001Wj00000tWwXu",name:"Boylesports",hadOpportunity:!1},{id:"001Wj00000uYz0o",name:"Bud Financial",hadOpportunity:!1},{id:"001Wj00000tWwXv",name:"Bunzl",hadOpportunity:!1},{id:"001Wj00000xxtGE",name:"Burelle",hadOpportunity:!1},{id:"001Wj00000mCFr0",name:"CNP Santander Insurance Services Limited",hadOpportunity:!0},{id:"001Wj00000tWwXw",name:"Cairn Homes",hadOpportunity:!0},{id:"001Wj00000uZ2hp",name:"Centrica",hadOpportunity:!1},{id:"001Wj00000uYYWv",name:"Checkout.com",hadOpportunity:!1},{id:"001Wj00000Y64qg",name:"Christian Dior Couture",hadOpportunity:!1},{id:"001Wj00000Y6VLh",name:"Citi",hadOpportunity:!0},{id:"001Wj00000mCFrE",name:"Clanwilliam Group",hadOpportunity:!0},{id:"001Wj00000tWwYl",name:"Clevercards",hadOpportunity:!1},{id:"001Wj00000mCFsm",name:"Coca-Cola HBC Ireland Limited",hadOpportunity:!0},{id:"001Wj00000xz30b",name:"Compagnie de l'Odet",hadOpportunity:!1},{id:"001Wj00000xxtOM",name:"Credit Industriel & Commercial",hadOpportunity:!1},{id:"001Wj00000uZ7RN",name:"Cuvva",hadOpportunity:!1},{id:"001Wj00000tx2MQ",name:"CyberArk",hadOpportunity:!0},{id:"001Wj00000tWwY1",name:"DAA",hadOpportunity:!1},{id:"001Wj00000xyNnm",name:"DS Smith",hadOpportunity:!1},{id:"001Wj00000hkk0s",name:"DSM",hadOpportunity:!1},{id:"001Wj00000hfWMt",name:"Dassault Syst?mes",hadOpportunity:!1},{id:"001Wj00000mCFsB",name:"Datalex",hadOpportunity:!0},{id:"001Wj00000mCFrl",name:"Davy",hadOpportunity:!0},{id:"001Wj00000tWwYm",name:"Deliveroo",hadOpportunity:!1},{id:"001Wj00000w0uVV",name:"Doceree",hadOpportunity:!0},{id:"001Wj00000vbvuX",name:"Dole plc",hadOpportunity:!1},{id:"001Wj00000tWwXZ",name:"EVO Payments",hadOpportunity:!1},{id:"001Wj00000xxsvH",name:"EXOR Group",hadOpportunity:!1},{id:"001Wj00000tWwY4",name:"Easons",hadOpportunity:!1},{id:"001Wj00000xz35R",name:"EasyJet",hadOpportunity:!1},{id:"001Wj00000xx4SK",name:"Edeka Zentrale",hadOpportunity:!1},{id:"001Wj00000uJwxo",name:"Eir",hadOpportunity:!0},{id:"001Wj00000tWwY5",name:"Elavon",hadOpportunity:!1},{id:"001Wj00000pzTPn",name:"Euronext Dublin",hadOpportunity:!1},{id:"001Wj00000sg8Gc",name:"FARFETCH",hadOpportunity:!0},{id:"001Wj00000mIEAX",name:"FNZ Group",hadOpportunity:!0},{id:"001Wj00000tWwY7",name:"First Data",hadOpportunity:!1},{id:"001Wj00000soigL",name:"Fresenius Kabi",hadOpportunity:!1},{id:"001Wj00000xyXyQ",name:"FrieslandCampina",hadOpportunity:!1},{id:"001Wj00000xyAP9",name:"GasTerra",hadOpportunity:!1},{id:"001Wj00000mCFt1",name:"Goodbody Stockbrokers",hadOpportunity:!0},{id:"001Wj00000soN5f",name:"Greencore",hadOpportunity:!1},{id:"001Wj00000xyyli",name:"Groupe BPCE",hadOpportunity:!1},{id:"001Wj00000xz9xF",name:"Haleon",hadOpportunity:!1},{id:"001Wj00000xz3S2",name:"Hapag-Lloyd",hadOpportunity:!1},{id:"001Wj00000tWwY9",name:"Henderson Group",hadOpportunity:!1},{id:"001Wj00000Y6VMb",name:"Henkel",hadOpportunity:!1},{id:"001Hp00003liHvf",name:"Hubspot",hadOpportunity:!0},{id:"001Wj00000sg9MN",name:"INNIO Group",hadOpportunity:!1},{id:"001Wj00000bzz9O",name:"IPG Mediabrands",hadOpportunity:!0},{id:"001Wj00000tWwYA",name:"IPL Plastics",hadOpportunity:!1},{id:"001Wj00000ZDXrd",name:"Intercom",hadOpportunity:!0},{id:"001Wj00000tWwYB",name:"Ires Reit",hadOpportunity:!1},{id:"001Wj00000xy2WS",name:"J. Sainsbury",hadOpportunity:!1},{id:"001Wj00000xyG3B",name:"JD Sports Fashion",hadOpportunity:!1},{id:"001Wj00000ullPp",name:"Jet2 Plc",hadOpportunity:!0},{id:"001Wj00000xyIeR",name:"KION Group",hadOpportunity:!1},{id:"001Wj00000tWwXb",name:"Keywords Studios",hadOpportunity:!1},{id:"001Wj00000xxdOO",name:"Kingfisher",hadOpportunity:!1},{id:"001Wj00000xy0o1",name:"Knorr-Bremse",hadOpportunity:!1},{id:"001Wj00000xxuVi",name:"L'Oreal",hadOpportunity:!1},{id:"001Wj00000xwh4I",name:"Landesbank Baden-Wurttemberg",hadOpportunity:!1},{id:"001Wj00000au3sw",name:"Lenovo",hadOpportunity:!0},{id:"001Wj00000sobq8",name:"MOL Magyarorsz\xE1g",hadOpportunity:!1},{id:"001Wj00000xwrq3",name:"Michelin",hadOpportunity:!1},{id:"001Wj00000xz3i9",name:"Mondi Group",hadOpportunity:!1},{id:"001Wj00000xxaf3",name:"NatWest Group",hadOpportunity:!1},{id:"001Wj00000xzFJV",name:"Norddeutsche Landesbank",hadOpportunity:!1},{id:"001Hp00003kIrKm",name:"Northern Trust Management Services",hadOpportunity:!0},{id:"001Wj00000bWIxi",name:"Novo Nordisk",hadOpportunity:!1},{id:"001Wj00000TV1Wz",name:"OpenAi",hadOpportunity:!0},{id:"001Wj00000tWwYh",name:"Origin Enterprises",hadOpportunity:!1},{id:"001Wj00000xz3dJ",name:"Otto",hadOpportunity:!1},{id:"001Wj00000tWwYs",name:"Panda Waste",hadOpportunity:!1},{id:"001Wj00000tWwYJ",name:"Paysafe",hadOpportunity:!1},{id:"001Wj00000souuM",name:"Premier Foods",hadOpportunity:!1},{id:"001Wj00000xyzrT",name:"RWE",hadOpportunity:!1},{id:"001Wj00000u0eJp",name:"Re-Turn",hadOpportunity:!0},{id:"001Wj00000xyAdg",name:"SGAM La Mondiale",hadOpportunity:!1},{id:"001Wj00000sg2T0",name:"SHEIN",hadOpportunity:!0},{id:"001Wj00000hfaEC",name:"Safran",hadOpportunity:!1},{id:"001Wj00000sonmQ",name:"Sandoz",hadOpportunity:!1},{id:"001Wj00000xz9ik",name:"Savencia",hadOpportunity:!1},{id:"001Wj00000xyGKs",name:"Sodexo",hadOpportunity:!1},{id:"001Wj00000c9oD6",name:"Stripe",hadOpportunity:!0},{id:"001Hp00003kKrS0",name:"Sword Health",hadOpportunity:!0},{id:"001Wj00000soZus",name:"Tate & Lyle",hadOpportunity:!1},{id:"001Wj00000mEEkG",name:"Team Car Care dba Jiffy Lube",hadOpportunity:!0},{id:"001Hp00003kIrN0",name:"Teleperformance",hadOpportunity:!1},{id:"001Wj00000vzG8f",name:"Temu",hadOpportunity:!1},{id:"001Wj00000xy9fz",name:"Tennet Holding",hadOpportunity:!1},{id:"001Wj00000tWwXf",name:"The Est\xE9e Lauder Companies Inc.",hadOpportunity:!1},{id:"001Wj00000Y6DDc",name:"The HEINEKEN Company",hadOpportunity:!1},{id:"001Wj00000tWwYV",name:"The Irish Stock Exchange",hadOpportunity:!1},{id:"001Wj00000xxp7o",name:"Thuga Holding",hadOpportunity:!1},{id:"001Wj00000xyBgC",name:"ThyssenKrupp",hadOpportunity:!1},{id:"001Wj00000tWwYW",name:"Total Produce plc",hadOpportunity:!1},{id:"001Wj00000xxxLU",name:"TotalEnergies",hadOpportunity:!1},{id:"001Wj00000mIBpN",name:"Transworld Business Advisors",hadOpportunity:!0},{id:"001Wj00000mCFs1",name:"Twitter",hadOpportunity:!0},{id:"001Wj00000xV8Vg",name:"UNHCR, the UN Refugee Agency",hadOpportunity:!0},{id:"001Wj00000xxo5I",name:"United Internet",hadOpportunity:!1},{id:"001Wj00000bWIzw",name:"Veolia | Water Tech",hadOpportunity:!1},{id:"001Hp00003kIrDA",name:"Verizon",hadOpportunity:!0},{id:"001Wj00000tWwXd",name:"Virgin Media Ireland Limited",hadOpportunity:!1},{id:"001Wj00000sgaj9",name:"Volkswagon",hadOpportunity:!0},{id:"001Wj00000ZDTG9",name:"Waystone",hadOpportunity:!0},{id:"001Wj00000pB5DX",name:"White Swan Data",hadOpportunity:!0},{id:"001Wj00000xwL2A",name:"Wm. Morrison Supermarkets",hadOpportunity:!1},{id:"001Wj00000mIB6E",name:"Zendesk",hadOpportunity:!0},{id:"001Wj00000S4r49",name:"Zoom",hadOpportunity:!0}]},"olivia.jung@eudia.com":{email:"olivia.jung@eudia.com",name:"Olivia Jung",accounts:[{id:"001Hp00003kIrED",name:"3M",hadOpportunity:!1},{id:"001Hp00003kIrEK",name:"ADP",hadOpportunity:!1},{id:"001Hp00003kIrEO",name:"AES",hadOpportunity:!0},{id:"001Hp00003kIrEG",name:"AbbVie",hadOpportunity:!1},{id:"001Wj00000mCFrd",name:"Airship Group Inc",hadOpportunity:!0},{id:"001Hp00003kIrET",name:"Albemarle",hadOpportunity:!1},{id:"001Hp00003kIrEZ",name:"Ally Financial",hadOpportunity:!1},{id:"001Hp00003kIrEc",name:"Altria Group",hadOpportunity:!1},{id:"001Hp00003kIrEf",name:"Ameren",hadOpportunity:!1},{id:"001Hp00003kIrEi",name:"American Family Insurance Group",hadOpportunity:!1},{id:"001Wj00000YIOI1",name:"Aptiv",hadOpportunity:!0},{id:"001Hp00003kIrFA",name:"Astellas",hadOpportunity:!0},{id:"001Hp00003kIrFD",name:"Autoliv",hadOpportunity:!1},{id:"001Hp00003kIrDJ",name:"Avery Dennison",hadOpportunity:!1},{id:"001Hp00003kIrDG",name:"Bain",hadOpportunity:!0},{id:"001Hp00003kIrFL",name:"Bank of America",hadOpportunity:!0},{id:"001Hp00003kIrFN",name:"Bath & Body Works",hadOpportunity:!1},{id:"001Hp00003kIrFQ",name:"Becton Dickinson",hadOpportunity:!1},{id:"001Hp00003kIrFV",name:"Best Buy",hadOpportunity:!0},{id:"001Hp00003kIrDY",name:"Blackstone",hadOpportunity:!0},{id:"001Hp00003kIrFb",name:"Boeing",hadOpportunity:!0},{id:"001Hp00003kIrFf",name:"BorgWarner",hadOpportunity:!1},{id:"001Hp00003kIrFk",name:"Bristol-Myers Squibb",hadOpportunity:!0},{id:"001Hp00003kIrFo",name:"Burlington Stores",hadOpportunity:!1},{id:"001Wj00000Y6VLn",name:"CHANEL",hadOpportunity:!1},{id:"001Hp00003kIrGK",name:"CHS",hadOpportunity:!0},{id:"001Hp00003kJ9kw",name:"CSL",hadOpportunity:!0},{id:"001Hp00003kIrGq",name:"CVS Health",hadOpportunity:!1},{id:"001Hp00003kIrG7",name:"Cencora (formerly AmerisourceBergen)",hadOpportunity:!1},{id:"001Hp00003kIrGE",name:"Charter Communications",hadOpportunity:!0},{id:"001Hp00003kIrDZ",name:"Ciena",hadOpportunity:!0},{id:"001Hp00003kIrGL",name:"Cintas",hadOpportunity:!1},{id:"001Wj00000c6df9",name:"Clear",hadOpportunity:!0},{id:"001Wj00000eLOI4",name:"Cleveland Clinic",hadOpportunity:!1},{id:"001Hp00003kIrGO",name:"Cleveland-Cliffs",hadOpportunity:!1},{id:"001Hp00003kIrGQ",name:"Coca-Cola",hadOpportunity:!1},{id:"001Hp00003kIrGX",name:"Conagra Brands",hadOpportunity:!1},{id:"001Hp00003kIrGZ",name:"Consolidated Edison",hadOpportunity:!0},{id:"001Wj00000jK5Hl",name:"Crate & Barrel",hadOpportunity:!0},{id:"001Hp00003kIrGo",name:"Cummins",hadOpportunity:!0},{id:"001Hp00003kIrGu",name:"Danaher",hadOpportunity:!1},{id:"001Wj00000bzz9R",name:"Datadog",hadOpportunity:!0},{id:"001Wj00000aZvt9",name:"Dolby",hadOpportunity:!0},{id:"001Hp00003kIrHB",name:"Dominion Energy",hadOpportunity:!1},{id:"001Hp00003kIrHE",name:"Dow",hadOpportunity:!1},{id:"001Hp00003kIrHH",name:"Duke Energy",hadOpportunity:!1},{id:"001Wj00000hkk0j",name:"Etsy",hadOpportunity:!0},{id:"001Hp00003kIrI7",name:"Ford",hadOpportunity:!1},{id:"001Hp00003kIrIL",name:"General Dynamics",hadOpportunity:!1},{id:"001Wj00000ScUQ3",name:"General Electric",hadOpportunity:!1},{id:"001Hp00003kIrIN",name:"General Motors",hadOpportunity:!1},{id:"001Hp00003kIrIS",name:"Gilead Sciences",hadOpportunity:!0},{id:"001Hp00003kIrE8",name:"Graybar Electric",hadOpportunity:!0},{id:"001Hp00003kIrDO",name:"Guardian Life Ins",hadOpportunity:!0},{id:"001Wj00000dvgdb",name:"HealthEquity",hadOpportunity:!0},{id:"001Hp00003kIrJ9",name:"Intuit",hadOpportunity:!0},{id:"001Wj00000aLlyV",name:"J.Crew",hadOpportunity:!0},{id:"001Hp00003kKKMc",name:"JPmorganchase",hadOpportunity:!0},{id:"001Hp00003kIrJI",name:"John Deere",hadOpportunity:!1},{id:"001Hp00003kIrDQ",name:"Jones Lang LaSalle",hadOpportunity:!0},{id:"001Wj00000hfaE1",name:"Lowe",hadOpportunity:!1},{id:"001Hp00003kIrDj",name:"Marsh McLennan",hadOpportunity:!0},{id:"001Hp00003kIrEA",name:"Mastercard",hadOpportunity:!0},{id:"001Wj00000QBapC",name:"Mayo Clinic",hadOpportunity:!1},{id:"001Hp00003kIrD7",name:"McDonald's",hadOpportunity:!1},{id:"001Hp00003kIrD8",name:"Medtronic",hadOpportunity:!0},{id:"001Hp00003kIrKK",name:"Merck",hadOpportunity:!0},{id:"001Hp00003kJ9lG",name:"Meta",hadOpportunity:!0},{id:"001Hp00003kIrKS",name:"Mondelez International",hadOpportunity:!0},{id:"001Hp00003kIrKU",name:"Motorola Solutions",hadOpportunity:!0},{id:"001Wj00000Y6VYj",name:"NBCUniversal",hadOpportunity:!1},{id:"001Wj00000j3QN2",name:"Nasdaq Private Market",hadOpportunity:!1},{id:"001Hp00003kIrCq",name:"Nationwide Insurance",hadOpportunity:!1},{id:"001Wj00000Y6VML",name:"Nestle",hadOpportunity:!1},{id:"001Hp00003kIrLF",name:"Paramount",hadOpportunity:!1},{id:"001Hp00003kIrLO",name:"Pfizer",hadOpportunity:!0},{id:"001Wj00000wzgaP",name:"Philip Morris International",hadOpportunity:!1},{id:"001Hp00003kIrLa",name:"Prudential",hadOpportunity:!1},{id:"001Hp00003kIrLp",name:"Raytheon Technologies",hadOpportunity:!1},{id:"001Hp00003kIrDz",name:"Shopify",hadOpportunity:!0},{id:"001Wj00000eLWPF",name:"Stellantis",hadOpportunity:!1},{id:"001Wj00000iS9AJ",name:"TE Connectivity",hadOpportunity:!0},{id:"001Hp00003kIrMx",name:"Target",hadOpportunity:!1},{id:"001Wj00000PjGDa",name:"The Weir Group PLC",hadOpportunity:!0},{id:"001Hp00003kIrDF",name:"Thermo Fisher Scientific",hadOpportunity:!0},{id:"001Hp00003kIrCw",name:"Toshiba US",hadOpportunity:!0},{id:"001Hp00003kIrNb",name:"Unisys",hadOpportunity:!0},{id:"001Hp00003kIrO7",name:"Wells Fargo",hadOpportunity:!0},{id:"001Wj00000kD7MA",name:"Wellspan Health",hadOpportunity:!0},{id:"001Hp00003kIrOA",name:"Western Digital",hadOpportunity:!0},{id:"001Wj00000kD3s1",name:"White Cap",hadOpportunity:!0}]},"rajeev.patel@eudia.com":{email:"rajeev.patel@eudia.com",name:"Rajeev Patel",accounts:[{id:"001Wj00000fFW35",name:"Alnylam Pharmaceuticals",hadOpportunity:!0},{id:"001Wj00000woNmQ",name:"Beiersdorf",hadOpportunity:!1},{id:"001Wj00000vCOx2",name:"Cambridge Associates",hadOpportunity:!1},{id:"001Wj00000wE56T",name:"Care Vet Health",hadOpportunity:!1},{id:"001Wj00000dIjyB",name:"CareVet, LLC",hadOpportunity:!1},{id:"001Wj00000xZEkY",name:"Modern Treasury",hadOpportunity:!1},{id:"001Wj00000vv2vX",name:"Nextdoor",hadOpportunity:!1}]},"riley.stack@eudia.com":{email:"riley.stack@eudia.com",name:"Riley Stack",accounts:[{id:"001Wj00000XiEDy",name:"Coinbase",hadOpportunity:!0},{id:"001Wj00000YEMa8",name:"Turing",hadOpportunity:!0}]},"sean.boyd@eudia.com":{email:"sean.boyd@eudia.com",name:"Sean Boyd",accounts:[{id:"001Hp00003kIrE9",name:"IQVIA",hadOpportunity:!0}]},"tom.clancy@eudia.com":{email:"tom.clancy@eudia.com",name:"Tom Clancy",accounts:[{id:"001Wj00000pB30V",name:"AIR (Advanced Inhalation Rituals)",hadOpportunity:!0},{id:"001Wj00000qLRqW",name:"ASML",hadOpportunity:!0},{id:"001Wj00000xyA0y",name:"Aegon",hadOpportunity:!1},{id:"001Wj00000xxpcR",name:"Air France-KLM Group",hadOpportunity:!1},{id:"001Wj00000xyIg2",name:"Akzo Nobel",hadOpportunity:!1},{id:"001Wj00000qFynV",name:"Alexion Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000xwuUW",name:"Alstom",hadOpportunity:!1},{id:"001Wj00000xxtL6",name:"Anglo American",hadOpportunity:!1},{id:"001Wj00000syHJt",name:"Aryzta",hadOpportunity:!1},{id:"001Wj00000tWwXq",name:"BAM Ireland",hadOpportunity:!1},{id:"001Wj00000c9oCe",name:"BLDG Management Co., Inc.",hadOpportunity:!0},{id:"001Wj00000hfWN1",name:"Balfour Beatty US",hadOpportunity:!1},{id:"001Wj00000fFuFM",name:"Bank of Ireland",hadOpportunity:!0},{id:"001Wj00000xy23Q",name:"Bayerische Landesbank",hadOpportunity:!1},{id:"001Wj00000tWwXt",name:"Boots",hadOpportunity:!1},{id:"001Wj00000xyIOL",name:"Ceconomy",hadOpportunity:!1},{id:"001Wj00000tWwXx",name:"Chanelle Pharma",hadOpportunity:!1},{id:"001Hp00003kIrD3",name:"Cisco Systems",hadOpportunity:!0},{id:"001Wj00000xyqxq",name:"Computacenter",hadOpportunity:!1},{id:"001Wj00000xy0ss",name:"Constellium",hadOpportunity:!1},{id:"001Wj00000Y6Vk0",name:"Credit Agricole CIB",hadOpportunity:!1},{id:"001Wj00000xwf7G",name:"Daimler Truck Holding",hadOpportunity:!1},{id:"001Wj00000xyaWU",name:"Delivery Hero",hadOpportunity:!1},{id:"001Wj00000mCFsz",name:"Electricity Supply Board",hadOpportunity:!0},{id:"001Wj00000sp0Bl",name:"Ensco PLC",hadOpportunity:!1},{id:"001Wj00000xz374",name:"EssilorLuxottica",hadOpportunity:!1},{id:"001Wj00000hfaDT",name:"Experian",hadOpportunity:!1},{id:"001Wj00000tWwY6",name:"Fineos",hadOpportunity:!1},{id:"001Wj00000mCFsd",name:"Fujitsu",hadOpportunity:!1},{id:"001Wj00000mCFrc",name:"Glanbia",hadOpportunity:!0},{id:"001Wj00000mHuzr",name:"IHRB",hadOpportunity:!1},{id:"001Wj00000xy9Ho",name:"Imperial Brands",hadOpportunity:!1},{id:"001Wj00000sp1nl",name:"Ina Groupa",hadOpportunity:!1},{id:"001Wj00000xz3ev",name:"Infineon",hadOpportunity:!1},{id:"001Wj00000xyMzn",name:"JDE Peet's",hadOpportunity:!1},{id:"001Wj00000hfWN2",name:"Jazz Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000soxsD",name:"Jazz Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000xxtcq",name:"John Lewis Partnership",hadOpportunity:!1},{id:"001Wj00000tWwYo",name:"Just Eat",hadOpportunity:!1},{id:"001Wj00000xz3jl",name:"KfW Group",hadOpportunity:!1},{id:"001Wj00000tWwYD",name:"Ladbrokes",hadOpportunity:!1},{id:"001Wj00000xystC",name:"Lanxess Group",hadOpportunity:!1},{id:"001Wj00000vRNFu",name:"Legal & General",hadOpportunity:!1},{id:"001Wj00000xxgZC",name:"Legrand",hadOpportunity:!1},{id:"001Wj00000Y64qm",name:"Louis Dreyfus Company",hadOpportunity:!1},{id:"001Wj00000xyGRQ",name:"Lufthansa Group",hadOpportunity:!1},{id:"001Wj00000pA6d7",name:"Masdar Future Energy Company",hadOpportunity:!0},{id:"001Wj00000xz0xC",name:"Metro",hadOpportunity:!1},{id:"001Wj00000xzAen",name:"Motability Operations Group",hadOpportunity:!1},{id:"001Wj00000mCFrv",name:"Ornua",hadOpportunity:!1},{id:"001Hp00003kIrLK",name:"Pepsi",hadOpportunity:!1},{id:"001Wj00000qFudS",name:"Pluralsight",hadOpportunity:!1},{id:"001Wj00000xyODc",name:"Puma",hadOpportunity:!1},{id:"001Wj00000iC14Z",name:"RELX",hadOpportunity:!1},{id:"001Wj00000tWwYj",name:"Rabobank",hadOpportunity:!1},{id:"001Wj00000xyU9M",name:"Reckitt Benckiser",hadOpportunity:!1},{id:"001Wj00000xz3bh",name:"Rentokil Initial",hadOpportunity:!1},{id:"001Wj00000sp1hL",name:"SBM Offshore",hadOpportunity:!1},{id:"001Wj00000xybkK",name:"SHV Holdings",hadOpportunity:!1},{id:"001Wj00000xz3gX",name:"SNCF Group",hadOpportunity:!1},{id:"001Wj00000tWwYt",name:"Sage",hadOpportunity:!1},{id:"001Wj00000sGEuO",name:"Sanofi",hadOpportunity:!1},{id:"001Wj00000qL7AG",name:"Seismic",hadOpportunity:!0},{id:"001Wj00000soyhp",name:"Stada Group",hadOpportunity:!1},{id:"001Wj00000xytSg",name:"Standard Chartered",hadOpportunity:!1},{id:"001Wj00000tWwYq",name:"Symantec",hadOpportunity:!1},{id:"001Wj00000pAPW2",name:"Tarmac",hadOpportunity:!0},{id:"001Wj00000xxvA1",name:"Technip Energies",hadOpportunity:!1},{id:"001Wj00000tWwYU",name:"Tegral Building Products",hadOpportunity:!1},{id:"001Wj00000fFuFq",name:"The Boots Group",hadOpportunity:!1},{id:"001Wj00000tWwYk",name:"Three",hadOpportunity:!1},{id:"001Wj00000xy5HP",name:"Trane Technologies",hadOpportunity:!1},{id:"001Wj00000sohCP",name:"Trans Ocean",hadOpportunity:!1},{id:"001Wj00000mCFtO",name:"Uisce Eireann (Irish Water)",hadOpportunity:!0},{id:"001Wj00000xyQ5k",name:"Uniper",hadOpportunity:!1},{id:"001Wj00000xz1GY",name:"Valeo",hadOpportunity:!1},{id:"001Wj00000pBibT",name:"Version1",hadOpportunity:!0},{id:"001Wj00000xy2BT",name:"Vivendi",hadOpportunity:!1},{id:"001Wj00000xyulK",name:"Wacker Chemie",hadOpportunity:!1},{id:"001Wj00000tWwYZ",name:"Wyeth Nutritionals Ireland",hadOpportunity:!1},{id:"001Wj00000mI9qo",name:"XACT Data Discovery",hadOpportunity:!0},{id:"001Wj00000xyq3P",name:"ZF Friedrichshafen",hadOpportunity:!1}]}}},$=class{constructor(a){this.cachedData=null;this.serverUrl=a}async getAccountsForUser(a){return(await this.getAccountsWithProspects(a)).accounts}async getAccountsWithProspects(a){let e=a.toLowerCase().trim(),t=await this.fetchFromServerWithProspects(e);if(t&&(t.accounts.length>0||t.prospects.length>0))return console.log(`[AccountOwnership] Got ${t.accounts.length} active + ${t.prospects.length} prospects from server for ${e}`),t;console.log(`[AccountOwnership] Using static data fallback for ${e}`);let n=this.getAccountsFromStatic(e),s=n.filter(i=>i.hadOpportunity!==!1),r=n.filter(i=>i.hadOpportunity===!1);return{accounts:s,prospects:r}}getAccountsFromStatic(a){if(Ee(a)==="sales_leader"){let r=Ie(a);if(r.length===0)return console.log(`[AccountOwnership] No direct reports found for sales leader: ${a}`),[];let i=new Map;for(let c of r){let d=A.businessLeads[c];if(d)for(let l of d.accounts)i.has(l.id)||i.set(l.id,{...l,isOwned:!1})}let o=Array.from(i.values()).sort((c,d)=>c.name.localeCompare(d.name));return console.log(`[AccountOwnership] Found ${o.length} static accounts for sales leader ${a} (from ${r.length} direct reports)`),o}let t=A.businessLeads[a],n=t?t.accounts.map(r=>({...r,isOwned:!0})):[],s=xe[a];if(s){let r=oe(s),i=new Set(n.map(c=>c.id));for(let c of r){let d=A.businessLeads[c];if(d)for(let l of d.accounts)i.has(l.id)||(n.push({...l,isOwned:!1}),i.add(l.id))}let o=n.sort((c,d)=>c.name.localeCompare(d.name));return console.log(`[AccountOwnership] Pod-view user ${a} (${s}): ${o.length} static accounts (${t?.accounts.length||0} owned + region)`),o}return t?(console.log(`[AccountOwnership] Found ${t.accounts.length} static accounts for ${a} (own accounts only)`),t.accounts):(console.log(`[AccountOwnership] No static mapping found for: ${a}`),[])}async fetchFromServer(a){let e=await this.fetchFromServerWithProspects(a);return e?e.accounts:null}async fetchFromServerWithProspects(a){try{let{requestUrl:e}=await import("obsidian"),t=await e({url:`${this.serverUrl}/api/accounts/ownership/${encodeURIComponent(a)}`,method:"GET",headers:{Accept:"application/json"}});if(t.json?.success){let n=i=>({id:i.id,name:i.name,type:i.type||"Prospect",hadOpportunity:i.hadOpportunity??!0,website:i.website||void 0,industry:i.industry||void 0}),s=(t.json.accounts||[]).map(n),r=(t.json.prospectAccounts||[]).map(n);return{accounts:s,prospects:r}}return null}catch(e){return console.log("[AccountOwnership] Server fetch failed, will use static data:",e),null}}async getNewAccounts(a,e){let t=await this.getAccountsForUser(a),n=e.map(s=>s.toLowerCase().trim());return t.filter(s=>{let r=s.name.toLowerCase().trim();return!n.some(i=>i===r||i.startsWith(r)||r.startsWith(i))})}findTeamLeader(a){let e=a.toLowerCase().trim();for(let[t,n]of Object.entries(q))if(n.includes(e))return t;return null}hasUser(a){return a.toLowerCase().trim()in A.businessLeads}getAllBusinessLeads(){return Object.keys(A.businessLeads)}getBusinessLead(a){let e=a.toLowerCase().trim();return A.businessLeads[e]||null}getDataVersion(){return A.version}async getAllAccountsForAdmin(a){let e=a.toLowerCase().trim();if(!x(e))return console.log(`[AccountOwnership] ${e} is not an admin, returning owned accounts only`),this.getAccountsForUser(e);let t=await this.fetchAllAccountsFromServer();if(t&&t.length>0){let n=await this.getAccountsForUser(e),s=new Set(n.map(r=>r.id));return t.map(r=>({...r,isOwned:s.has(r.id)}))}return console.log("[AccountOwnership] Using static data fallback for admin all-accounts"),this.getAllAccountsFromStatic(e)}getAllAccountsFromStatic(a){let e=new Map,t=new Set,n=A.businessLeads[a];if(n)for(let s of n.accounts)t.add(s.id),e.set(s.id,{...s,isOwned:!0});for(let s of Object.values(A.businessLeads))for(let r of s.accounts)e.has(r.id)||e.set(r.id,{...r,isOwned:!1});return Array.from(e.values()).sort((s,r)=>s.name.localeCompare(r.name))}async fetchAllAccountsFromServer(){try{let{requestUrl:a}=await import("obsidian"),e=await a({url:`${this.serverUrl}/api/accounts/all`,method:"GET",headers:{Accept:"application/json"}});return e.json?.success&&e.json?.accounts?e.json.accounts.map(t=>({id:t.id,name:t.name,type:t.type||"Prospect"})):null}catch(a){return console.log("[AccountOwnership] Server fetch all accounts failed:",a),null}}};var ce=[{value:"America/New_York",label:"Eastern Time (ET)"},{value:"America/Chicago",label:"Central Time (CT)"},{value:"America/Denver",label:"Mountain Time (MT)"},{value:"America/Los_Angeles",label:"Pacific Time (PT)"},{value:"Europe/London",label:"London (GMT/BST)"},{value:"Europe/Dublin",label:"Dublin (GMT/IST)"},{value:"Europe/Paris",label:"Central Europe (CET)"},{value:"Europe/Berlin",label:"Berlin (CET)"},{value:"UTC",label:"UTC"}],Te={serverUrl:"https://gtm-wizard.onrender.com",accountsFolder:"Accounts",recordingsFolder:"Recordings",syncOnStartup:!0,autoSyncAfterTranscription:!0,saveAudioFiles:!0,appendTranscript:!0,lastSyncTime:null,cachedAccounts:[],enableSmartTags:!0,showCalendarView:!0,userEmail:"",setupCompleted:!1,calendarConfigured:!1,salesforceConnected:!1,accountsImported:!1,importedAccountCount:0,timezone:"America/New_York",lastAccountRefreshDate:null,archiveRemovedAccounts:!0,syncAccountsOnStartup:!0,sfAutoSyncEnabled:!0,sfAutoSyncIntervalMinutes:15};var N="eudia-calendar-view",F="eudia-setup-view",K=class extends u.EditorSuggest{constructor(a,e){super(a),this.plugin=e}onTrigger(a,e,t){let n=e.getLine(a.line),s=e.getValue(),r=e.posToOffset(a),i=s.indexOf("---"),o=s.indexOf("---",i+3);if(i===-1||r<i||r>o)return null;let c=n.match(/^account:\s*(.*)$/);if(!c)return null;let d=c[1].trim(),l=n.indexOf(":")+1,h=n.substring(l).match(/^\s*/)?.[0].length||0;return{start:{line:a.line,ch:l+h},end:a,query:d}}getSuggestions(a){let e=a.query.toLowerCase(),t=this.plugin.settings.cachedAccounts;return e?t.filter(n=>n.name.toLowerCase().includes(e)).sort((n,s)=>{let r=n.name.toLowerCase().startsWith(e),i=s.name.toLowerCase().startsWith(e);return r&&!i?-1:i&&!r?1:n.name.localeCompare(s.name)}).slice(0,10):t.slice(0,10)}renderSuggestion(a,e){e.createEl("div",{text:a.name,cls:"suggestion-title"})}selectSuggestion(a,e){this.context&&this.context.editor.replaceRange(a.name,this.context.start,this.context.end)}},J=class{constructor(a,e,t,n){this.containerEl=null;this.waveformBars=[];this.durationEl=null;this.waveformData=new Array(16).fill(0);this.onPause=a,this.onResume=e,this.onStop=t,this.onCancel=n}show(){if(this.containerEl)return;this.containerEl=document.createElement("div"),this.containerEl.className="eudia-transcription-bar active";let a=document.createElement("div");a.className="eudia-recording-dot",this.containerEl.appendChild(a);let e=document.createElement("div");e.className="eudia-waveform",this.waveformBars=[];for(let r=0;r<16;r++){let i=document.createElement("div");i.className="eudia-waveform-bar",i.style.height="2px",e.appendChild(i),this.waveformBars.push(i)}this.containerEl.appendChild(e),this.durationEl=document.createElement("div"),this.durationEl.className="eudia-duration",this.durationEl.textContent="0:00",this.containerEl.appendChild(this.durationEl);let t=document.createElement("div");t.className="eudia-controls-minimal";let n=document.createElement("button");n.className="eudia-control-btn stop",n.innerHTML='<span class="eudia-stop-icon"></span>',n.title="Stop and summarize",n.onclick=()=>this.onStop(),t.appendChild(n);let s=document.createElement("button");s.className="eudia-control-btn cancel",s.textContent="Cancel",s.onclick=()=>this.onCancel(),t.appendChild(s),this.containerEl.appendChild(t),document.body.appendChild(this.containerEl)}hide(){this.containerEl&&(this.containerEl.remove(),this.containerEl=null,this.waveformBars=[],this.durationEl=null)}updateState(a){if(this.containerEl){if(this.waveformData.shift(),this.waveformData.push(a.audioLevel),this.waveformBars.forEach((e,t)=>{let n=this.waveformData[t]||0,s=Math.max(2,Math.min(24,n*.24));e.style.height=`${s}px`}),this.durationEl){let e=Math.floor(a.duration/60),t=Math.floor(a.duration%60);this.durationEl.textContent=`${e}:${t.toString().padStart(2,"0")}`}this.containerEl.className=a.isPaused?"eudia-transcription-bar paused":"eudia-transcription-bar active"}}showProcessing(){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar processing";let a=document.createElement("div");a.className="eudia-processing-spinner",this.containerEl.appendChild(a);let e=document.createElement("div");e.className="eudia-processing-text",e.textContent="Processing...",this.containerEl.appendChild(e)}showComplete(a){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar complete";let e=document.createElement("div");e.className="eudia-complete-checkmark",this.containerEl.appendChild(e);let t=document.createElement("div");if(t.className="eudia-complete-content",a.summaryPreview){let o=document.createElement("div");o.className="eudia-summary-preview",o.textContent=a.summaryPreview.length>80?a.summaryPreview.substring(0,80)+"...":a.summaryPreview,t.appendChild(o)}let n=document.createElement("div");n.className="eudia-complete-stats-row";let s=Math.floor(a.duration/60),r=Math.floor(a.duration%60);n.textContent=`${s}:${r.toString().padStart(2,"0")} recorded`,a.nextStepsCount>0&&(n.textContent+=` | ${a.nextStepsCount} action${a.nextStepsCount>1?"s":""}`),a.meddiccCount>0&&(n.textContent+=` | ${a.meddiccCount} signals`),t.appendChild(n),this.containerEl.appendChild(t);let i=document.createElement("button");i.className="eudia-control-btn close",i.textContent="Dismiss",i.onclick=()=>this.hide(),this.containerEl.appendChild(i),setTimeout(()=>this.hide(),8e3)}};var X=class extends u.Modal{constructor(a,e,t){super(a),this.plugin=e,this.onSelect=t}onOpen(){let{contentEl:a}=this;a.empty(),a.addClass("eudia-account-selector"),a.createEl("h3",{text:"Select Account for Meeting Note"}),this.searchInput=a.createEl("input",{type:"text",placeholder:"Search accounts..."}),this.searchInput.style.cssText="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);",this.resultsContainer=a.createDiv({cls:"eudia-account-results"}),this.resultsContainer.style.cssText="max-height: 300px; overflow-y: auto;",this.updateResults(""),this.searchInput.addEventListener("input",()=>this.updateResults(this.searchInput.value)),this.searchInput.focus()}updateResults(a){this.resultsContainer.empty();let e=this.plugin.settings.cachedAccounts,t=a?e.filter(n=>n.name.toLowerCase().includes(a.toLowerCase())).slice(0,15):e.slice(0,15);if(t.length===0){this.resultsContainer.createDiv({cls:"eudia-no-results",text:"No accounts found"});return}t.forEach(n=>{let s=this.resultsContainer.createDiv({cls:"eudia-account-item",text:n.name});s.onclick=()=>{this.onSelect(n),this.close()}})}onClose(){this.contentEl.empty()}},U=class extends u.Modal{constructor(e,t,n){super(e);this.accountContext=null;this.plugin=t,this.accountContext=n||null}onOpen(){let{contentEl:e}=this;e.empty(),e.addClass("eudia-intelligence-modal");let t=e.createDiv({cls:"eudia-intelligence-header"});t.createEl("h2",{text:this.accountContext?`Ask about ${this.accountContext.name}`:"Ask gtm-brain"}),this.accountContext?t.createEl("p",{text:"Get insights, prep for meetings, or ask about this account.",cls:"eudia-intelligence-subtitle"}):t.createEl("p",{text:"Ask questions about your accounts, deals, or pipeline.",cls:"eudia-intelligence-subtitle"});let n=e.createDiv({cls:"eudia-intelligence-input-container"});this.queryInput=n.createEl("textarea",{placeholder:this.accountContext?`e.g., "What should I know before my next meeting?" or "What's the deal status?"`:`e.g., "Who owns Dolby?" or "What's my late stage pipeline?"`}),this.queryInput.addClass("eudia-intelligence-input"),this.queryInput.rows=3;let r=e.createDiv({cls:"eudia-intelligence-actions"}).createEl("button",{text:"Ask",cls:"eudia-btn-primary"});r.onclick=()=>this.submitQuery(),this.queryInput.onkeydown=c=>{c.key==="Enter"&&!c.shiftKey&&(c.preventDefault(),this.submitQuery())},this.responseContainer=e.createDiv({cls:"eudia-intelligence-response"}),this.responseContainer.style.display="none";let i=e.createDiv({cls:"eudia-intelligence-suggestions"});i.createEl("p",{text:"Suggested:",cls:"eudia-suggestions-label"});let o;if(this.accountContext)o=["What should I know before my next meeting?","Summarize our relationship and deal status","What are the key pain points?"];else{let d=(this.plugin.settings.cachedAccounts||[]).slice(0,3).map(l=>l.name);d.length>=2?o=[`What should I know about ${d[0]} before my next meeting?`,`What's the account history with ${d[1]}?`,"What's my late-stage pipeline?"]:o=["What should I know before my next meeting?","What accounts need attention this week?","What is my late-stage pipeline?"]}o.forEach(c=>{let d=i.createEl("button",{text:c,cls:"eudia-suggestion-btn"});d.onclick=()=>{this.queryInput.value=c,this.submitQuery()}}),setTimeout(()=>this.queryInput.focus(),100)}async submitQuery(){let e=this.queryInput.value.trim();if(!e)return;this.responseContainer.style.display="block";let t=this.accountContext?.name?` about ${this.accountContext.name}`:"";this.responseContainer.innerHTML=`<div class="eudia-intelligence-loading">Gathering intelligence${t}...</div>`;try{let n=await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/intelligence/query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:e,accountId:this.accountContext?.id,accountName:this.accountContext?.name,userEmail:this.plugin.settings.userEmail}),throw:!1,contentType:"application/json"});if(n.status>=400){let s=n.json?.error||`Server error (${n.status}). Please try again.`;this.responseContainer.innerHTML=`<div class="eudia-intelligence-error">${s}</div>`;return}if(n.json?.success){this.responseContainer.innerHTML="";let s=this.responseContainer.createDiv({cls:"eudia-intelligence-answer"});if(s.innerHTML=this.formatResponse(n.json.answer),n.json.context){let r=n.json.context,i=this.responseContainer.createDiv({cls:"eudia-intelligence-context-info"}),o=[];r.accountName&&o.push(r.accountName),r.opportunityCount>0&&o.push(`${r.opportunityCount} opps`),r.hasNotes&&o.push("notes"),r.hasCustomerBrain&&o.push("history");let c=r.dataFreshness==="cached"?" (cached)":"";i.setText(`Based on: ${o.join(" \u2022 ")}${c}`)}n.json.performance}else{let s=n.json?.error||"Could not get an answer. Try rephrasing your question.";this.responseContainer.innerHTML=`<div class="eudia-intelligence-error">${s}</div>`}}catch(n){console.error("[GTM Brain] Intelligence query error:",n);let s="Unable to connect. Please check your internet connection and try again.";n?.message?.includes("timeout")?s="Request timed out. The server may be busy - please try again.":(n?.message?.includes("network")||n?.message?.includes("fetch"))&&(s="Network error. Please check your connection and try again."),this.responseContainer.innerHTML=`<div class="eudia-intelligence-error">${s}</div>`}}formatResponse(e){return e.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu,"").replace(/^#{2,3}\s+(.+)$/gm,'<h3 class="eudia-intel-header">$1</h3>').replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/^[•\-]\s+(.+)$/gm,"<li>$1</li>").replace(/^-\s+\[\s*\]\s+(.+)$/gm,'<li class="eudia-intel-todo">$1</li>').replace(/^-\s+\[x\]\s+(.+)$/gm,'<li class="eudia-intel-done">$1</li>').replace(/(<li[^>]*>.*?<\/li>\s*)+/g,'<ul class="eudia-intel-list">$&</ul>').replace(/\n{2,}/g,`
`).replace(/\n/g,"<br>")}onClose(){this.contentEl.empty()}};var Z=class extends u.ItemView{constructor(e,t){super(e);this.emailInput=null;this.pollInterval=null;this.plugin=t,this.accountOwnershipService=new $(t.settings.serverUrl),this.steps=[{id:"calendar",title:"Connect Your Calendar",description:"View your meetings and create notes with one click",status:"pending"},{id:"salesforce",title:"Connect to Salesforce",description:"Sync notes and access your accounts",status:"pending"},{id:"transcribe",title:"Ready to Transcribe",description:"Record and summarize meetings automatically",status:"pending"}]}getViewType(){return F}getDisplayText(){return"Setup"}getIcon(){return"settings"}async onOpen(){await this.checkExistingStatus(),await this.render()}async onClose(){this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null)}async checkExistingStatus(){if(this.plugin.settings.userEmail){this.steps[0].status="complete";try{(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0&&(this.steps[1].status="complete",this.plugin.settings.salesforceConnected=!0)}catch{}this.plugin.settings.accountsImported&&(this.steps[2].status="complete")}}getCompletionPercentage(){let e=this.steps.filter(t=>t.status==="complete").length;return Math.round(e/this.steps.length*100)}async render(){let e=this.containerEl.children[1];e.empty(),e.addClass("eudia-setup-view"),this.renderHeader(e),this.renderSteps(e),this.renderFooter(e)}renderHeader(e){let t=e.createDiv({cls:"eudia-setup-header"}),n=t.createDiv({cls:"eudia-setup-title-section"});n.createEl("h1",{text:"Welcome to Eudia Sales Vault",cls:"eudia-setup-main-title"}),n.createEl("p",{text:"Complete these steps to unlock your sales superpowers",cls:"eudia-setup-subtitle"});let s=t.createDiv({cls:"eudia-setup-progress-section"}),r=this.getCompletionPercentage(),i=s.createDiv({cls:"eudia-setup-progress-label"});i.createSpan({text:"Setup Progress"}),i.createSpan({text:`${r}%`,cls:"eudia-setup-progress-value"});let c=s.createDiv({cls:"eudia-setup-progress-bar"}).createDiv({cls:"eudia-setup-progress-fill"});c.style.width=`${r}%`}renderSteps(e){let t=e.createDiv({cls:"eudia-setup-steps-container"});this.renderCalendarStep(t),this.renderSalesforceStep(t),this.renderTranscribeStep(t)}renderCalendarStep(e){let t=this.steps[0],n=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),s=n.createDiv({cls:"eudia-setup-step-header"}),r=s.createDiv({cls:"eudia-setup-step-number"});r.setText(t.status==="complete"?"":"1"),t.status==="complete"&&r.addClass("eudia-step-complete");let i=s.createDiv({cls:"eudia-setup-step-info"});i.createEl("h3",{text:t.title}),i.createEl("p",{text:t.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(t.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:`Connected as ${this.plugin.settings.userEmail}`});else{let c=o.createDiv({cls:"eudia-setup-input-group"});this.emailInput=c.createEl("input",{type:"email",placeholder:"yourname@eudia.com",cls:"eudia-setup-input"}),this.plugin.settings.userEmail&&(this.emailInput.value=this.plugin.settings.userEmail);let d=c.createEl("button",{text:"Connect",cls:"eudia-setup-btn primary"});d.onclick=async()=>{await this.handleCalendarConnect()},this.emailInput.onkeydown=async l=>{l.key==="Enter"&&await this.handleCalendarConnect()},o.createDiv({cls:"eudia-setup-validation-message"}),o.createEl("p",{cls:"eudia-setup-help-text",text:"Your calendar syncs automatically via Microsoft 365. We use your email to identify your meetings."})}}async handleCalendarConnect(){if(!this.emailInput)return;let e=this.emailInput.value.trim().toLowerCase(),t=this.containerEl.querySelector(".eudia-setup-validation-message");if(!e){t&&(t.textContent="Please enter your email",t.className="eudia-setup-validation-message error");return}if(!e.endsWith("@eudia.com")){t&&(t.textContent="Please use your @eudia.com email address",t.className="eudia-setup-validation-message error");return}t&&(t.textContent="Validating...",t.className="eudia-setup-validation-message loading");try{let n=await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${encodeURIComponent(e)}`,method:"GET",throw:!1});if(n.status===200&&n.json?.authorized){this.plugin.settings.userEmail=e,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),this.steps[0].status="complete",new u.Notice("Calendar connected successfully!"),t&&(t.textContent="Importing your accounts...",t.className="eudia-setup-validation-message loading");try{let s,r=[];if(x(e))console.log("[Eudia] Admin user detected - importing all accounts"),s=await this.accountOwnershipService.getAllAccountsForAdmin(e);else{let i=await this.accountOwnershipService.getAccountsWithProspects(e);s=i.accounts,r=i.prospects}if(s.length>0||r.length>0){let i=[...s,...r],o=await this.plugin.fetchEnrichmentData(i);x(e)?await this.plugin.createAdminAccountFolders(s):(await this.plugin.createTailoredAccountFolders(s,o),r.length>0&&await this.plugin.createProspectAccountFiles(r)),this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length+r.length,await this.plugin.saveSettings(),new u.Notice(`Imported ${s.length} active accounts + ${r.length} prospects!`)}}catch(s){console.error("[Eudia] Account import failed:",s)}await this.render()}else t&&(t.innerHTML=`<strong>${e}</strong> is not authorized for calendar access. Contact your admin.`,t.className="eudia-setup-validation-message error")}catch{t&&(t.textContent="Connection failed. Please try again.",t.className="eudia-setup-validation-message error")}}renderSalesforceStep(e){let t=this.steps[1],n=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),s=n.createDiv({cls:"eudia-setup-step-header"}),r=s.createDiv({cls:"eudia-setup-step-number"});r.setText(t.status==="complete"?"":"2"),t.status==="complete"&&r.addClass("eudia-step-complete");let i=s.createDiv({cls:"eudia-setup-step-info"});i.createEl("h3",{text:t.title}),i.createEl("p",{text:t.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(!this.plugin.settings.userEmail){o.createDiv({cls:"eudia-setup-disabled-message",text:"Complete the calendar step first"});return}if(t.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:"Salesforce connected successfully"}),this.plugin.settings.accountsImported&&o.createDiv({cls:"eudia-setup-account-status",text:`${this.plugin.settings.importedAccountCount} accounts imported`});else{let d=o.createDiv({cls:"eudia-setup-button-group"}).createEl("button",{text:"Connect to Salesforce",cls:"eudia-setup-btn primary"}),l=o.createDiv({cls:"eudia-setup-sf-status"});d.onclick=async()=>{let h=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(h,"_blank"),l.textContent="Complete the login in the popup window...",l.className="eudia-setup-sf-status loading",new u.Notice("Complete the Salesforce login in the popup window",5e3),this.startSalesforcePolling(l)},o.createEl("p",{cls:"eudia-setup-help-text",text:"This links your Obsidian notes to your Salesforce account for automatic sync."})}}startSalesforcePolling(e){this.pollInterval&&window.clearInterval(this.pollInterval);let t=0,n=60;this.pollInterval=window.setInterval(async()=>{t++;try{(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),this.steps[1].status="complete",new u.Notice("Salesforce connected successfully!"),await this.importTailoredAccounts(e),await this.render()):t>=n&&(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),e.textContent="Connection timed out. Please try again.",e.className="eudia-setup-sf-status error")}catch{}},5e3)}async importTailoredAccounts(e){e.textContent="Importing your accounts...",e.className="eudia-setup-sf-status loading";try{let t=this.plugin.settings.userEmail,n,s=[];if(x(t))console.log("[Eudia] Admin user detected - importing all accounts"),e.textContent="Admin detected - importing all accounts...",n=await this.accountOwnershipService.getAllAccountsForAdmin(t);else{let l=await this.accountOwnershipService.getAccountsWithProspects(t);n=l.accounts,s=l.prospects}if(n.length===0&&s.length===0){e.textContent="No accounts found for your email. Contact your admin.",e.className="eudia-setup-sf-status warning";return}e.textContent="Loading account intelligence from Salesforce...";let r=[...n,...s],i=await this.plugin.fetchEnrichmentData(r);x(t)?await this.plugin.createAdminAccountFolders(n):(await this.plugin.createTailoredAccountFolders(n,i),s.length>0&&await this.plugin.createProspectAccountFiles(s)),this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=n.length+s.length,await this.plugin.saveSettings(),this.steps[2].status="complete";let o=n.filter(l=>l.isOwned!==!1).length,c=n.filter(l=>l.isOwned===!1).length,d=Object.keys(i).length;x(t)&&c>0?e.textContent=`${o} owned + ${c} view-only accounts imported!`:e.textContent=`${n.length} active + ${s.length} prospect accounts imported (${d} enriched)!`,e.className="eudia-setup-sf-status success"}catch{e.textContent="Failed to import accounts. Please try again.",e.className="eudia-setup-sf-status error"}}renderTranscribeStep(e){let t=this.steps[2],n=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),s=n.createDiv({cls:"eudia-setup-step-header"}),r=s.createDiv({cls:"eudia-setup-step-number"});r.setText(t.status==="complete"?"":"3"),t.status==="complete"&&r.addClass("eudia-step-complete");let i=s.createDiv({cls:"eudia-setup-step-info"});i.createEl("h3",{text:t.title}),i.createEl("p",{text:t.description});let o=n.createDiv({cls:"eudia-setup-step-content"}),c=o.createDiv({cls:"eudia-setup-instructions"}),d=c.createDiv({cls:"eudia-setup-instruction"});d.createSpan({cls:"eudia-setup-instruction-icon",text:"\u{1F399}"}),d.createSpan({text:"Click the microphone icon in the left sidebar during a call"});let l=c.createDiv({cls:"eudia-setup-instruction"});l.createSpan({cls:"eudia-setup-instruction-icon",text:"\u2328"}),l.createSpan({text:'Or press Cmd/Ctrl+P and search for "Transcribe Meeting"'});let h=c.createDiv({cls:"eudia-setup-instruction"});h.createSpan({cls:"eudia-setup-instruction-icon",text:"\u{1F4DD}"}),h.createSpan({text:"AI will summarize and extract key insights automatically"}),t.status!=="complete"&&o.createEl("p",{cls:"eudia-setup-help-text muted",text:"This step completes automatically after connecting to Salesforce and importing accounts."})}renderFooter(e){let t=e.createDiv({cls:"eudia-setup-footer"});if(this.steps.every(r=>r.status==="complete")){let r=t.createDiv({cls:"eudia-setup-completion"});r.createEl("h2",{text:"\u{1F389} You're all set!"}),r.createEl("p",{text:"Your sales vault is ready. Click below to start using Eudia."});let i=t.createEl("button",{text:"Open Calendar \u2192",cls:"eudia-setup-btn primary large"});i.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(F),await this.plugin.activateCalendarView()}}else{let r=t.createEl("button",{text:"Skip Setup (I'll do this later)",cls:"eudia-setup-btn secondary"});r.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(F),new u.Notice("You can complete setup anytime from Settings \u2192 Eudia Sync")}}let s=t.createEl("a",{text:"Advanced Settings",cls:"eudia-setup-settings-link"});s.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")}}},Q=class extends u.ItemView{constructor(e,t){super(e);this.refreshInterval=null;this.lastError=null;this.plugin=t}getViewType(){return N}getDisplayText(){return"Calendar"}getIcon(){return"calendar"}async onOpen(){await this.render(),this.refreshInterval=window.setInterval(()=>this.render(),5*60*1e3)}async onClose(){this.refreshInterval&&window.clearInterval(this.refreshInterval)}async render(){let e=this.containerEl.children[1];if(e.empty(),e.addClass("eudia-calendar-view"),!this.plugin.settings.userEmail){this.renderSetupPanel(e);return}this.renderHeader(e),await this.renderCalendarContent(e)}renderHeader(e){let t=e.createDiv({cls:"eudia-calendar-header"}),n=t.createDiv({cls:"eudia-calendar-title-row"});n.createEl("h4",{text:"Your Meetings"});let s=n.createDiv({cls:"eudia-calendar-actions"}),r=s.createEl("button",{cls:"eudia-btn-icon",text:"\u21BB"});r.title="Refresh (fetches latest from calendar)",r.onclick=async()=>{r.addClass("spinning"),this._forceRefresh=!0,await this.render(),r.removeClass("spinning")};let i=s.createEl("button",{cls:"eudia-btn-icon",text:"\u2699"});i.title="Settings",i.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")};let o=t.createDiv({cls:"eudia-status-bar"});this.renderConnectionStatus(o)}async renderConnectionStatus(e){let t={server:"connecting",calendar:"not_configured",salesforce:"not_configured"},n=this.plugin.settings.serverUrl,s=this.plugin.settings.userEmail;try{(await(0,u.requestUrl)({url:`${n}/api/health`,method:"GET",throw:!1})).status===200?(t.server="connected",t.serverMessage="Server online"):(t.server="error",t.serverMessage="Server unavailable")}catch{t.server="error",t.serverMessage="Cannot reach server"}if(s&&t.server==="connected")try{let l=await(0,u.requestUrl)({url:`${n}/api/calendar/validate/${encodeURIComponent(s)}`,method:"GET",throw:!1});l.status===200&&l.json?.authorized?(t.calendar="connected",t.calendarMessage="Calendar synced"):(t.calendar="not_authorized",t.calendarMessage="Not authorized")}catch{t.calendar="error",t.calendarMessage="Error checking access"}if(s&&t.server==="connected")try{let l=await(0,u.requestUrl)({url:`${n}/api/sf/auth/status?email=${encodeURIComponent(s)}`,method:"GET",throw:!1});l.status===200&&l.json?.connected?(t.salesforce="connected",t.salesforceMessage="Salesforce connected"):(t.salesforce="not_configured",t.salesforceMessage="Not connected")}catch{t.salesforce="not_configured"}let r=e.createDiv({cls:"eudia-status-indicators"}),i=r.createSpan({cls:`eudia-status-dot ${t.server}`});i.title=t.serverMessage||"Server";let o=r.createSpan({cls:`eudia-status-dot ${t.calendar}`});o.title=t.calendarMessage||"Calendar";let c=r.createSpan({cls:`eudia-status-dot ${t.salesforce}`});if(c.title=t.salesforceMessage||"Salesforce",e.createDiv({cls:"eudia-status-labels"}).createSpan({cls:"eudia-status-label",text:this.plugin.settings.userEmail}),t.calendar==="not_authorized"){let l=e.createDiv({cls:"eudia-status-warning"});l.innerHTML=`<strong>${s}</strong> is not authorized for calendar access. Contact your admin.`}}async renderCalendarContent(e){let t=e.createDiv({cls:"eudia-calendar-content"}),n=t.createDiv({cls:"eudia-calendar-loading"});n.innerHTML='<div class="eudia-spinner"></div><span>Loading meetings...</span>';try{let s=new I(this.plugin.settings.serverUrl,this.plugin.settings.userEmail,this.plugin.settings.timezone||"America/New_York"),r=this._forceRefresh||!1;this._forceRefresh=!1;let i=await s.getWeekMeetings(r);if(n.remove(),!i.success){this.renderError(t,i.error||"Failed to load calendar");return}let o=Object.keys(i.byDay||{}).sort();if(o.length===0){this.renderEmptyState(t);return}await this.renderCurrentMeeting(t,s);for(let c of o){let d=i.byDay[c];!d||d.length===0||this.renderDaySection(t,c,d)}}catch(s){n.remove(),this.renderError(t,s.message||"Failed to load calendar")}}async renderCurrentMeeting(e,t){try{let n=await t.getCurrentMeeting();if(n.meeting){let s=e.createDiv({cls:"eudia-now-card"});n.isNow?s.createDiv({cls:"eudia-now-badge",text:"\u25CF NOW"}):s.createDiv({cls:"eudia-now-badge soon",text:`In ${n.minutesUntilStart}m`});let r=s.createDiv({cls:"eudia-now-content"});r.createEl("div",{cls:"eudia-now-subject",text:n.meeting.subject}),n.meeting.accountName&&r.createEl("div",{cls:"eudia-now-account",text:n.meeting.accountName});let i=s.createEl("button",{cls:"eudia-now-action",text:"Create Note"});i.onclick=()=>this.createNoteForMeeting(n.meeting)}}catch{}}renderDaySection(e,t,n){let s=e.createDiv({cls:"eudia-calendar-day"});s.createEl("div",{cls:"eudia-calendar-day-header",text:I.getDayName(t)});for(let r of n){let i=s.createDiv({cls:`eudia-calendar-meeting ${r.isCustomerMeeting?"customer":"internal"}`});i.createEl("div",{cls:"eudia-calendar-time",text:I.formatTime(r.start,this.plugin.settings.timezone)});let o=i.createDiv({cls:"eudia-calendar-details"});if(o.createEl("div",{cls:"eudia-calendar-subject",text:r.subject}),r.accountName)o.createEl("div",{cls:"eudia-calendar-account",text:r.accountName});else if(r.attendees&&r.attendees.length>0){let c=r.attendees.slice(0,2).map(d=>d.name||d.email?.split("@")[0]||"Unknown").join(", ");o.createEl("div",{cls:"eudia-calendar-attendees",text:c})}i.onclick=()=>this.createNoteForMeeting(r),i.title="Click to create meeting note"}}renderEmptyState(e){let t=e.createDiv({cls:"eudia-calendar-empty"});t.innerHTML=`
      <div class="eudia-empty-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <p class="eudia-empty-title">No meetings this week</p>
      <p class="eudia-empty-subtitle">Enjoy your focus time!</p>
    `}renderError(e,t){let n=e.createDiv({cls:"eudia-calendar-error"}),s="",r="Unable to load calendar",i="";t.includes("not authorized")||t.includes("403")?(s="\u{1F512}",r="Calendar Access Required",i="Contact your admin to be added to the authorized users list."):t.includes("network")||t.includes("fetch")?(s="\u{1F4E1}",r="Connection Issue",i="Check your internet connection and try again."):(t.includes("server")||t.includes("500"))&&(s="\u{1F527}",r="Server Unavailable",i="The server may be waking up. Try again in 30 seconds."),n.innerHTML=`
      <div class="eudia-error-icon">${s}</div>
      <p class="eudia-error-title">${r}</p>
      <p class="eudia-error-message">${t}</p>
      ${i?`<p class="eudia-error-action">${i}</p>`:""}
    `;let o=n.createEl("button",{cls:"eudia-btn-retry",text:"Try Again"});o.onclick=()=>this.render()}renderSetupPanel(e){let t=e.createDiv({cls:"eudia-calendar-setup-panel"});t.innerHTML=`
      <div class="eudia-setup-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <h3 class="eudia-setup-title">Connect Your Calendar</h3>
      <p class="eudia-setup-desc">Enter your Eudia email to see your meetings and create notes with one click.</p>
    `;let n=t.createDiv({cls:"eudia-setup-input-group"}),s=n.createEl("input",{type:"email",placeholder:"yourname@eudia.com"});s.addClass("eudia-setup-email");let r=n.createEl("button",{cls:"eudia-setup-connect",text:"Connect"}),i=t.createDiv({cls:"eudia-setup-status"});r.onclick=async()=>{let o=s.value.trim().toLowerCase();if(!o||!o.endsWith("@eudia.com")){i.textContent="Please use your @eudia.com email",i.className="eudia-setup-status error";return}r.disabled=!0,r.textContent="Connecting...",i.textContent="";try{if(!(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${o}`,method:"GET"})).json?.authorized){i.innerHTML=`<strong>${o}</strong> is not authorized. Contact your admin to be added.`,i.className="eudia-setup-status error",r.disabled=!1,r.textContent="Connect";return}this.plugin.settings.userEmail=o,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),i.textContent="Connected",i.className="eudia-setup-status success",this.plugin.scanLocalAccountFolders().catch(()=>{}),setTimeout(()=>this.render(),500)}catch(c){let d=c.message||"Connection failed";d.includes("403")?i.innerHTML=`<strong>${o}</strong> is not authorized for calendar access.`:i.textContent=d,i.className="eudia-setup-status error",r.disabled=!1,r.textContent="Connect"}},s.onkeydown=o=>{o.key==="Enter"&&r.click()},t.createEl("p",{cls:"eudia-setup-help",text:"Your calendar syncs automatically via Microsoft 365."})}extractCompanyFromDomain(e){let t=e.toLowerCase().split("."),n=["mail","email","app","portal","crm","www","smtp","sales","support","login","sso","auth","api","my"],s=["com","org","net","io","co","ai","gov","edu","uk","us","de","fr","jp","au","ca"],r=t.filter(o=>!s.includes(o)&&o.length>1);if(r.length===0)return t[0]||"";if(r.length>1&&n.includes(r[0]))return r[1].charAt(0).toUpperCase()+r[1].slice(1);let i=r[r.length-1];return i.charAt(0).toUpperCase()+i.slice(1)}getExternalDomainsFromAttendees(e){if(!e||e.length===0)return[];let t=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com","live.com","msn.com","aol.com","protonmail.com","googlemail.com","mail.com","zoho.com","ymail.com"],n=new Set,s=[];for(let r of e){if(!r.email)continue;let o=r.email.toLowerCase().match(/@([a-z0-9.-]+)/);if(o){let c=o[1];if(c.includes("eudia.com")||t.includes(c)||n.has(c))continue;n.add(c);let d=this.extractCompanyFromDomain(c);d.length>=2&&s.push({domain:c,company:d})}}return s}findBestAccountMatch(e,t,n){let s=this.plugin.settings.accountsFolder||"Accounts",r=this.app.vault.getAbstractFileByPath(s);if(!(r instanceof u.TFolder))return null;let i=[];for(let c of r.children)c instanceof u.TFolder&&i.push(c.name);if(i.length===0)return null;let o=[];for(let{domain:c,company:d}of e){let l=this.findAccountFolder(d),h=l?1:0;o.push({domain:c,company:d,folder:l,score:h})}if(o.sort((c,d)=>d.score-c.score),o.length>0&&o[0].folder){let c=o[0],d=c.folder.split("/").pop()||c.company;return console.log(`[Eudia Calendar] Best domain match: "${c.company}" from ${c.domain} -> ${c.folder}`),{folder:c.folder,accountName:d,source:"domain"}}if(t){let c=this.findAccountFolder(t);if(c){let d=c.split("/").pop()||t;return console.log(`[Eudia Calendar] Server account match: "${t}" -> ${c}`),{folder:c,accountName:d,source:"server"}}}if(n){let c=this.findAccountFolder(n);if(c){let d=c.split("/").pop()||n;return console.log(`[Eudia Calendar] Subject match: "${n}" -> ${c}`),{folder:c,accountName:d,source:"subject"}}}for(let{company:c}of e){let d=i.find(l=>{let h=l.toLowerCase(),g=c.toLowerCase();return h.includes(g)||g.includes(h)});if(d){let l=`${s}/${d}`;return console.log(`[Eudia Calendar] Partial domain match: "${c}" -> ${l}`),{folder:l,accountName:d,source:"domain-partial"}}}return null}extractAccountFromAttendees(e){let t=this.getExternalDomainsFromAttendees(e);if(t.length===0)return null;let n=t[0];return console.log(`[Eudia Calendar] Extracted company "${n.company}" from attendee domain ${n.domain}`),n.company}extractAccountFromSubject(e){if(!e)return null;let t=e.match(/^([^\/]+)\s*\/\s*Eudia|Eudia\s*\/\s*([^\/\-|]+)/i);if(t){let s=(t[1]||t[2]||"").trim();if(s.toLowerCase()!=="eudia")return s}let n=e.match(/^Eudia\s*[-–]\s*([^|]+)|^([^-–]+)\s*[-–]\s*Eudia/i);if(n){let r=(n[1]||n[2]||"").trim().replace(/\s+(Connect|Weekly|Call|Meeting|Intro|Demo|Check\s*in|Sync).*$/i,"").trim();if(r.toLowerCase()!=="eudia"&&r.length>0)return r}if(!e.toLowerCase().includes("eudia")){let s=e.match(/^([^-–|]+)/);if(s){let r=s[1].trim();if(r.length>2&&r.length<50)return r}}return null}findAccountFolder(e){if(!e)return null;let t=this.plugin.settings.accountsFolder||"Accounts",n=this.app.vault.getAbstractFileByPath(t);if(!(n instanceof u.TFolder))return console.log(`[Eudia Calendar] Accounts folder "${t}" not found`),null;let s=e.toLowerCase().trim(),r=[];for(let h of n.children)h instanceof u.TFolder&&r.push(h.name);console.log(`[Eudia Calendar] Searching for "${s}" in ${r.length} folders`);let i=r.find(h=>h.toLowerCase()===s);if(i)return console.log(`[Eudia Calendar] Exact match found: ${i}`),`${t}/${i}`;let o=r.find(h=>h.toLowerCase().startsWith(s));if(o)return console.log(`[Eudia Calendar] Folder starts with match: ${o}`),`${t}/${o}`;let c=r.find(h=>s.startsWith(h.toLowerCase()));if(c)return console.log(`[Eudia Calendar] Search starts with folder match: ${c}`),`${t}/${c}`;let d=r.find(h=>{let g=h.toLowerCase();return g.length>=3&&s.includes(g)});if(d)return console.log(`[Eudia Calendar] Search contains folder match: ${d}`),`${t}/${d}`;let l=r.find(h=>{let g=h.toLowerCase();return s.length>=3&&g.includes(s)});return l?(console.log(`[Eudia Calendar] Folder contains search match: ${l}`),`${t}/${l}`):(console.log(`[Eudia Calendar] No folder match found for "${s}"`),null)}async createNoteForMeeting(e){let t=e.start.split("T")[0],n=this.plugin.settings.eudiaEmail||"",s=x(n),r=(e.attendees||[]).map(v=>v.email).filter(Boolean),i=ae(e.subject,r);if(s&&i.isPipelineMeeting&&i.confidence>=60){await this._createPipelineNote(e,t);return}let o=e.subject.replace(/[<>:"/\\|?*]/g,"_").substring(0,50),c=`${t} - ${o}.md`,d=null,l=e.accountName||null,h=null;console.log(`[Eudia Calendar] === Creating note for meeting: "${e.subject}" ===`),console.log(`[Eudia Calendar] Attendees: ${JSON.stringify(e.attendees?.map(v=>v.email)||[])}`);let g=this.getExternalDomainsFromAttendees(e.attendees||[]);console.log(`[Eudia Calendar] External domains found: ${JSON.stringify(g)}`);let m=this.extractAccountFromSubject(e.subject);console.log(`[Eudia Calendar] Subject-extracted name: "${m||"none"}"`);let p=this.findBestAccountMatch(g,e.accountName,m||void 0);if(p&&(d=p.folder,l=p.accountName,console.log(`[Eudia Calendar] Best match (${p.source}): "${l}" -> ${d}`)),!d){let v=this.plugin.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(v)instanceof u.TFolder&&(d=v,console.log(`[Eudia Calendar] No match found, using Accounts root: ${d}`))}if(l){let v=this.plugin.settings.cachedAccounts.find(T=>T.name.toLowerCase()===l?.toLowerCase());v&&(h=v.id,l=v.name,console.log(`[Eudia Calendar] Matched to cached account: ${v.name} (${v.id})`))}let y=d?`${d}/${c}`:c,w=this.app.vault.getAbstractFileByPath(y);if(w instanceof u.TFile){await this.app.workspace.getLeaf().openFile(w),new u.Notice(`Opened existing note: ${c}`);return}let S=(e.attendees||[]).map(v=>v.name||v.email?.split("@")[0]||"Unknown").slice(0,5).join(", "),C=`---
title: "${e.subject}"
date: ${t}
attendees: [${S}]
account: "${l||""}"
account_id: "${h||""}"
meeting_start: ${e.start}
meeting_type: discovery
sync_to_salesforce: false
clo_meeting: false
source: ""
transcribed: false
---

# ${e.subject}

## Attendees
${(e.attendees||[]).map(v=>`- ${v.name||v.email}`).join(`
`)}

## Pre-Call Notes

*Add any prep notes, context, or questions before the meeting*



---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` \u2192 **"Transcribe Meeting"**

---

`;try{let v=await this.app.vault.create(y,C);await this.app.workspace.getLeaf().openFile(v),new u.Notice(`Created: ${y}`)}catch(v){console.error("[Eudia Calendar] Failed to create note:",v),new u.Notice(`Could not create note: ${v.message||"Unknown error"}`)}}async _createPipelineNote(e,t){let n=new Date(t+"T00:00:00"),s=String(n.getMonth()+1).padStart(2,"0"),r=String(n.getDate()).padStart(2,"0"),i=String(n.getFullYear()).slice(-2),o=`${s}.${r}.${i}`,c=`Team Pipeline Meeting - ${o}.md`,d="Pipeline Meetings";this.app.vault.getAbstractFileByPath(d)||await this.app.vault.createFolder(d);let h=`${d}/${c}`,g=this.app.vault.getAbstractFileByPath(h);if(g instanceof u.TFile){await this.app.workspace.getLeaf().openFile(g),new u.Notice(`Opened existing: ${c}`);return}let m=(e.attendees||[]).map(y=>y.name||y.email?.split("@")[0]||"Unknown"),p=`---
title: "Team Pipeline Meeting - ${o}"
date: ${t}
attendees: [${m.slice(0,10).join(", ")}]
meeting_type: pipeline_review
meeting_start: ${e.start}
transcribed: false
---

# Weekly Pipeline Review | ${n.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"})}

## Attendees
${m.map(y=>`- ${y}`).join(`
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

`;try{let y=await this.app.vault.create(h,p);await this.app.workspace.getLeaf().openFile(y),new u.Notice(`Created pipeline note: ${c}`),console.log(`[Eudia Pipeline] Created pipeline meeting note: ${h}`)}catch(y){console.error("[Eudia Pipeline] Failed to create pipeline note:",y),new u.Notice(`Could not create pipeline note: ${y.message||"Unknown error"}`)}}},z=class extends u.Plugin{constructor(){super(...arguments);this.audioRecorder=null;this.recordingStatusBar=null;this.micRibbonIcon=null;this.liveTranscript="";this.liveTranscriptChunkInterval=null;this.isTranscribingChunk=!1;this.sfSyncStatusBarEl=null;this.sfSyncIntervalId=null}async onload(){await this.loadSettings(),this.transcriptionService=new B(this.settings.serverUrl),this.calendarService=new I(this.settings.serverUrl,this.settings.userEmail,this.settings.timezone||"America/New_York"),this.smartTagService=new G,this.checkForPluginUpdate(),this.registerView(N,e=>new Q(e,this)),this.registerView(F,e=>new Z(e,this)),this.addRibbonIcon("calendar","Open Calendar",()=>this.activateCalendarView()),this.micRibbonIcon=this.addRibbonIcon("microphone","Transcribe Meeting",async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}),this.addRibbonIcon("message-circle","Ask GTM Brain",()=>{this.openIntelligenceQueryForCurrentNote()}),this.addCommand({id:"transcribe-meeting",name:"Transcribe Meeting",callback:async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}}),this.addCommand({id:"open-calendar",name:"Open Calendar",callback:()=>this.activateCalendarView()}),this.addCommand({id:"sync-accounts",name:"Sync Salesforce Accounts",callback:()=>this.syncAccounts()}),this.addCommand({id:"sync-note",name:"Sync Note to Salesforce",callback:()=>this.syncNoteToSalesforce()}),this.addCommand({id:"new-meeting-note",name:"New Meeting Note",callback:()=>this.createMeetingNote()}),this.addCommand({id:"ask-gtm-brain",name:"Ask gtm-brain",callback:()=>this.openIntelligenceQueryForCurrentNote()}),this.addCommand({id:"enrich-accounts",name:"Enrich Account Folders with Salesforce Data",callback:async()=>{if(!this.settings.userEmail){new u.Notice("Please set up your email first.");return}let t=await new $(this.settings.serverUrl).getAccountsWithProspects(this.settings.userEmail),n=[...t.accounts,...t.prospects];if(n.length===0){new u.Notice("No accounts found to enrich.");return}await this.enrichAccountFolders(n)}}),this.addCommand({id:"refresh-analytics",name:"Refresh Analytics Dashboard",callback:async()=>{let e=this.app.workspace.getActiveFile();e?await this.refreshAnalyticsDashboard(e):new u.Notice("No active file")}}),this.addCommand({id:"live-query-transcript",name:"Query Current Transcript (Live)",callback:async()=>{if(!this.audioRecorder?.isRecording()){new u.Notice("No active recording. Start recording first to use live query.");return}if(!this.liveTranscript||this.liveTranscript.length<50){new u.Notice("Not enough transcript captured yet. Keep recording for a few more minutes.");return}this.openLiveQueryModal()}}),this.sfSyncStatusBarEl=this.addStatusBarItem(),this.sfSyncStatusBarEl.setText("SF Sync: Idle"),this.sfSyncStatusBarEl.addClass("eudia-sf-sync-status"),this.addSettingTab(new ee(this.app,this)),this.registerEditorSuggest(new K(this.app,this)),this.app.workspace.onLayoutReady(async()=>{if(this.settings.setupCompleted){if(this.settings.syncOnStartup){if(await this.scanLocalAccountFolders(),this.settings.userEmail&&this.settings.syncAccountsOnStartup){let e=new Date().toISOString().split("T")[0];this.settings.lastAccountRefreshDate!==e&&setTimeout(async()=>{try{console.log("[Eudia] Startup account sync - checking for changes...");let n=await this.syncAccountFolders();if(n.success){if(this.settings.lastAccountRefreshDate=e,await this.saveSettings(),n.added>0||n.archived>0){let s=[];n.added>0&&s.push(`${n.added} added`),n.archived>0&&s.push(`${n.archived} archived`),new u.Notice(`Account folders synced: ${s.join(", ")}`)}}else console.log("[Eudia] Sync failed:",n.error)}catch{console.log("[Eudia] Startup sync skipped (server unreachable), will retry tomorrow")}},2e3)}this.settings.showCalendarView&&this.settings.userEmail&&await this.activateCalendarView(),this.settings.userEmail&&this.settings.cachedAccounts.length>0&&setTimeout(async()=>{try{await this.checkAndAutoEnrich()}catch{console.log("[Eudia] Auto-enrich skipped (server unreachable)")}},5e3),this.settings.userEmail&&this.telemetry?setTimeout(async()=>{try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),t=0;e&&e instanceof u.TFolder&&(t=e.children.filter(r=>r instanceof u.TFolder&&!r.name.startsWith("_")).length);let n={salesforce:this.settings.salesforceConnected?"connected":"not_configured",calendar:this.settings.calendarConfigured?"connected":"not_configured"};await this.telemetry.sendHeartbeat(t,n);let s=await this.telemetry.checkForPushedConfig();if(s.length>0){let r=!1;for(let i of s)i.key&&this.settings.hasOwnProperty(i.key)&&(this.settings[i.key]=i.value,r=!0,console.log(`[Eudia] Applied pushed config: ${i.key} = ${i.value}`));r&&(await this.saveSettings(),new u.Notice("Settings updated by admin"))}await this.checkAndConsumeSyncFlags(),this.startSalesforceSyncScanner()}catch{console.log("[Eudia] Heartbeat/config check skipped"),this.startSalesforceSyncScanner()}},3e3):this.settings.sfAutoSyncEnabled&&this.settings.salesforceConnected&&setTimeout(()=>this.startSalesforceSyncScanner(),5e3)}}else{await new Promise(t=>setTimeout(t,100));let e=document.querySelector(".modal-container .modal");if(e){let t=e.querySelector(".modal-close-button");t&&t.click()}await this.activateSetupView()}this.app.workspace.on("file-open",async e=>{if(e&&(e.path.includes("_Analytics/")||e.path.includes("_Customer Health/")))try{let t=await this.app.vault.read(e);if(t.includes("type: analytics_dashboard")){let s=t.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/)?.[1],r=new Date().toISOString().split("T")[0];s!==r&&(console.log(`[Eudia] Auto-refreshing analytics: ${e.name}`),await this.refreshAnalyticsDashboard(e))}}catch{}})})}async onunload(){this.app.workspace.detachLeavesOfType(N)}async checkForPluginUpdate(){try{let e=this.settings.serverUrl||"https://gtm-wizard.onrender.com",t=await(0,u.requestUrl)({url:`${e}/api/plugin/version`,method:"GET",headers:{"Content-Type":"application/json"}});if(!t.json?.success)return;let n=t.json.currentVersion,s=this.manifest?.version||"0.0.0",r=n.split(".").map(Number),i=s.split(".").map(Number),o=!1;for(let c=0;c<3;c++){if((r[c]||0)>(i[c]||0)){o=!0;break}if((r[c]||0)<(i[c]||0))break}o?(console.log(`[Eudia Update] New version available: ${n} (current: ${s})`),await this.performAutoUpdate(e,n,s)):console.log(`[Eudia Update] Plugin is up to date (v${s})`)}catch(e){console.log("[Eudia Update] Could not check for updates:",e.message||e)}}async performAutoUpdate(e,t,n){try{if(this.audioRecorder?.isRecording()){console.log("[Eudia Update] Skipping auto-update \u2014 recording in progress"),new u.Notice(`Eudia update v${t} available.
Finish your recording, then restart Obsidian to update.`,1e4);return}let s=this.manifest.dir;if(!s){console.log("[Eudia Update] Cannot determine plugin directory \u2014 skipping");return}let r=this.app.vault.adapter;console.log("[Eudia Update] Downloading plugin files...");let[i,o,c]=await Promise.all([(0,u.requestUrl)({url:`${e}/api/plugin/main.js`}),(0,u.requestUrl)({url:`${e}/api/plugin/manifest.json`}),(0,u.requestUrl)({url:`${e}/api/plugin/styles.css`})]),d=i.text,l=o.text,h=c.text,g=1024,m=5*1024*1024;for(let[C,v]of[["main.js",d],["manifest.json",l],["styles.css",h]])if(!v||v.length<g||v.length>m){console.log(`[Eudia Update] Downloaded ${C} failed validation (${v?.length??0} bytes) \u2014 aborting`);return}try{let C=await r.read(`${s}/main.js`);await r.write(`${s}/main.js.bak`,C),console.log("[Eudia Update] Backed up current main.js")}catch{console.log("[Eudia Update] Could not back up main.js \u2014 continuing")}await r.write(`${s}/main.js`,d),await r.write(`${s}/manifest.json`,l),await r.write(`${s}/styles.css`,h),console.log(`[Eudia Update] Files written \u2014 v${n} \u2192 v${t}`);try{(0,u.requestUrl)({url:`${e}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"info",message:`Auto-updated from v${n} to v${t}`,userEmail:this.settings.userEmail||"anonymous",pluginVersion:t,platform:"obsidian",context:{fromVersion:n,toVersion:t}})}).catch(()=>{})}catch{}let p=document.createDocumentFragment(),y=document.createElement("div");y.style.cssText="display:flex;flex-direction:column;gap:8px;";let w=document.createElement("span");w.textContent=`Eudia updated to v${t}. Reload to apply.`,y.appendChild(w);let S=document.createElement("button");S.textContent="Reload now",S.style.cssText="padding:4px 12px;border-radius:4px;border:1px solid var(--interactive-accent);background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:12px;align-self:flex-start;",S.addEventListener("click",()=>{this.app.commands.executeCommandById("app:reload")}),y.appendChild(S),p.appendChild(y),new u.Notice(p,0)}catch(s){console.log("[Eudia Update] Auto-update failed:",s.message||s)}}async loadSettings(){this.settings=Object.assign({},Te,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}async activateCalendarView(){let e=this.app.workspace,t=e.getLeavesOfType(N);if(t.length>0)e.revealLeaf(t[0]);else{let n=e.getRightLeaf(!1);n&&(await n.setViewState({type:N,active:!0}),e.revealLeaf(n))}}async activateSetupView(){let e=this.app.workspace,t=e.getLeavesOfType(F);if(t.length>0)e.revealLeaf(t[0]);else{let n=e.getLeaf(!0);n&&(await n.setViewState({type:F,active:!0}),e.revealLeaf(n))}}async createTailoredAccountFolders(e,t){let n=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);let r=0;for(let i of e){let o=i.name.replace(/[<>:"/\\|?*]/g,"_").trim(),c=`${n}/${o}`;if(this.app.vault.getAbstractFileByPath(c)instanceof u.TFolder){console.log(`[Eudia] Account folder already exists: ${o}`);continue}try{await this.app.vault.createFolder(c);let l=t?.[i.id],h=!!l,g=new Date().toISOString().split("T")[0],m=this.buildContactsContent(i,l,g),p=this.buildIntelligenceContent(i,l,g),y=this.buildMeetingNotesContent(i,l),w=this.buildNextStepsContent(i,l,g),S=[{name:"Note 1.md",content:`---
account: "${i.name}"
account_id: "${i.id}"
type: meeting_note
sync_to_salesforce: false
created: ${g}
---

# ${i.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 2.md",content:`---
account: "${i.name}"
account_id: "${i.id}"
type: meeting_note
sync_to_salesforce: false
created: ${g}
---

# ${i.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 3.md",content:`---
account: "${i.name}"
account_id: "${i.id}"
type: meeting_note
sync_to_salesforce: false
created: ${g}
---

# ${i.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Meeting Notes.md",content:y},{name:"Contacts.md",content:m},{name:"Intelligence.md",content:p},{name:"Next Steps.md",content:w}];for(let v of S){let T=`${c}/${v.name}`;await this.app.vault.create(T,v.content)}r++,console.log(`[Eudia] Created account folder with subnotes${h?" (enriched)":""}: ${o}`)}catch(l){console.error(`[Eudia] Failed to create folder for ${o}:`,l)}}this.settings.cachedAccounts=e.map(i=>({id:i.id,name:i.name})),await this.saveSettings(),r>0&&new u.Notice(`Created ${r} account folders`),await this.ensureNextStepsFolderExists()}buildContactsContent(e,t,n){let s=t?`
enriched_at: "${new Date().toISOString()}"`:"",r=`---
account: "${e.name}"
account_id: "${e.id}"
type: contacts
sync_to_salesforce: false${s}
---`;return t?.contacts?`${r}

# ${e.name} - Key Contacts

${t.contacts}

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`:`${r}

# ${e.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
| *No contacts on record yet* | | | | |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`}buildIntelligenceContent(e,t,n){let s=t?`
enriched_at: "${new Date().toISOString()}"`:"",r=`---
account: "${e.name}"
account_id: "${e.id}"
type: intelligence
sync_to_salesforce: false${s}
---`;return t?.intelligence?`${r}

# ${e.name} - Account Intelligence

${t.intelligence}

## News & Signals

*Recent news, earnings mentions, leadership changes.*
`:`${r}

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
enriched_at: "${new Date().toISOString()}"`:"",s=`---
account: "${e.name}"
account_id: "${e.id}"
type: meetings_index
sync_to_salesforce: false${n}
---`,r=[];return t?.opportunities&&r.push(t.opportunities),t?.recentActivity&&r.push(t.recentActivity),r.length>0?`${s}

# ${e.name} - Meeting Notes

${r.join(`

`)}

## Quick Start

1. Open **Note 1** for your next meeting
2. Click the **microphone** to record and transcribe
3. **Next Steps** are auto-extracted after transcription
4. Set \`sync_to_salesforce: true\` to sync to Salesforce
`:`${s}

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
`}buildNextStepsContent(e,t,n){let s=n||new Date().toISOString().split("T")[0],r=t?`
enriched_at: "${new Date().toISOString()}"`:"",i=`---
account: "${e.name}"
account_id: "${e.id}"
type: next_steps
auto_updated: true
last_updated: ${s}
sync_to_salesforce: false${r}
---`;return t?.nextSteps?`${i}

# ${e.name} - Next Steps

${t.nextSteps}

---

## History

*Previous next steps will be archived here.*
`:`${i}

# ${e.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}async fetchEnrichmentData(e){let t=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=e.filter(i=>i.id&&i.id.length>=15);if(n.length===0)return{};let s={},r=20;console.log(`[Eudia Enrich] Fetching enrichment data for ${n.length} accounts`);for(let i=0;i<n.length;i+=r){let c=n.slice(i,i+r).map(d=>d.id);try{let d=await(0,u.requestUrl)({url:`${t}/api/accounts/enrich-batch`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountIds:c,userEmail:this.settings.userEmail})});d.json?.success&&d.json?.enrichments&&Object.assign(s,d.json.enrichments)}catch(d){console.error(`[Eudia Enrich] Batch fetch failed (batch ${i/r+1}):`,d)}i+r<n.length&&await new Promise(d=>setTimeout(d,300))}return console.log(`[Eudia Enrich] Got enrichment data for ${Object.keys(s).length}/${n.length} accounts`),s}async createProspectAccountFiles(e){if(!e||e.length===0)return 0;let t=this.settings.accountsFolder||"Accounts",n=`${t}/_Prospects`;if(!this.app.vault.getAbstractFileByPath(n))try{await this.app.vault.createFolder(n)}catch{}let r=0;for(let i of e){let o=i.name.replace(/[<>:"/\\|?*]/g,"_").trim(),c=`${n}/${o}`;if(this.app.vault.getAbstractFileByPath(c)instanceof u.TFolder)continue;let l=`${t}/${o}`;if(this.app.vault.getAbstractFileByPath(l)instanceof u.TFolder)continue;let g=`${n}/${o}.md`,m=this.app.vault.getAbstractFileByPath(g);if(m instanceof u.TFile)try{await this.app.vault.delete(m)}catch{}try{await this.app.vault.createFolder(c);let p=new Date().toISOString().split("T")[0],y=[{name:"Note 1.md",content:`---
account: "${i.name}"
account_id: "${i.id}"
type: meeting_note
tier: prospect
sync_to_salesforce: false
created: ${p}
---

# ${i.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 2.md",content:`---
account: "${i.name}"
account_id: "${i.id}"
type: meeting_note
tier: prospect
sync_to_salesforce: false
created: ${p}
---

# ${i.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 3.md",content:`---
account: "${i.name}"
account_id: "${i.id}"
type: meeting_note
tier: prospect
sync_to_salesforce: false
created: ${p}
---

# ${i.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Meeting Notes.md",content:`---
account: "${i.name}"
account_id: "${i.id}"
type: meetings_index
tier: prospect
sync_to_salesforce: false
---

# ${i.name} - Meeting Notes

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
account: "${i.name}"
account_id: "${i.id}"
type: contacts
tier: prospect
sync_to_salesforce: false
---

# ${i.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
|      |       |       |       |       |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`},{name:"Intelligence.md",content:`---
account: "${i.name}"
account_id: "${i.id}"
type: intelligence
tier: prospect
sync_to_salesforce: false
---

# ${i.name} - Account Intelligence

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
account: "${i.name}"
account_id: "${i.id}"
type: next_steps
tier: prospect
auto_updated: true
last_updated: ${p}
sync_to_salesforce: false
---

# ${i.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}];for(let w of y){let S=`${c}/${w.name}`;await this.app.vault.create(S,w.content)}r++}catch(p){console.log(`[Eudia] Failed to create prospect folder for ${i.name}:`,p)}}return r>0&&console.log(`[Eudia] Created ${r} prospect account folders in _Prospects/`),r}async createAdminAccountFolders(e){let t=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t),await this.ensurePipelineFolderExists();let s=0,r=0,i=new Date().toISOString().split("T")[0];for(let o of e){let c=o.name.replace(/[<>:"/\\|?*]/g,"_").trim(),d=`${t}/${c}`;if(!(this.app.vault.getAbstractFileByPath(d)instanceof u.TFolder))try{await this.app.vault.createFolder(d),await this.createExecAccountSubnotes(d,o,i),o.isOwned?s++:r++,console.log(`[Eudia Admin] Created ${o.isOwned?"owned":"view-only"} folder: ${c}`)}catch(h){console.error(`[Eudia Admin] Failed to create folder for ${c}:`,h)}}this.settings.cachedAccounts=e.map(o=>({id:o.id,name:o.name})),await this.saveSettings(),s+r>0&&new u.Notice(`Created ${s} owned + ${r} view-only account folders`),await this.ensureNextStepsFolderExists()}async createExecAccountSubnotes(e,t,n){let s=t.ownerName||"Unknown",r=[{name:"Note 1.md",content:`---
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
owner: "${s}"
sync_to_salesforce: false
---

# ${t.name} - Meeting Notes

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
`}];for(let i of r){let o=`${e}/${i.name}`;await this.app.vault.create(o,i.content)}}async createFullAccountSubnotes(e,t,n){let s=[{name:"Note 1.md",content:`---
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
`}];for(let r of s){let i=`${e}/${r.name}`;await this.app.vault.create(i,r.content)}}async ensurePipelineFolderExists(){let e="Pipeline",t=`${e}/Pipeline Review Notes.md`;if(this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e),!this.app.vault.getAbstractFileByPath(t)){let i=`---
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
`;await this.app.vault.create(t,i)}}async ensureNextStepsFolderExists(){let e="Next Steps",t=`${e}/All Next Steps.md`;if(this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e),!this.app.vault.getAbstractFileByPath(t)){let r=new Date().toISOString().split("T")[0],i=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${r}
---

# All Next Steps Dashboard

*Last updated: ${r} ${i}*

---

## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;await this.app.vault.create(t,o)}}async updateAccountNextSteps(e,t,n){try{console.log(`[Eudia] updateAccountNextSteps called for: ${e}`),console.log(`[Eudia] Content length: ${t?.length||0} chars`);let s=e.replace(/[<>:"/\\|?*]/g,"_").trim(),r=`${this.settings.accountsFolder}/${s}/Next Steps.md`;console.log(`[Eudia] Looking for Next Steps file at: ${r}`);let i=this.app.vault.getAbstractFileByPath(r);if(!i||!(i instanceof u.TFile)){console.log(`[Eudia] \u274C Next Steps file NOT FOUND at: ${r}`);let S=this.app.vault.getAbstractFileByPath(`${this.settings.accountsFolder}/${s}`);S&&S instanceof u.TFolder?console.log(`[Eudia] Files in ${s} folder:`,S.children.map(C=>C.name)):console.log(`[Eudia] Account folder also not found: ${this.settings.accountsFolder}/${s}`);return}console.log("[Eudia] Found Next Steps file, updating...");let o=new Date().toISOString().split("T")[0],c=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),d=n.split("/").pop()?.replace(".md","")||"Meeting",l=t;!t.includes("- [ ]")&&!t.includes("- [x]")&&(l=t.split(`
`).filter(S=>S.trim()).map(S=>{let C=S.replace(/^[-•*]\s*/,"").trim();return C?`- [ ] ${C}`:""}).filter(Boolean).join(`
`));let h=await this.app.vault.read(i),g="",m=h.match(/## History\n\n\*Previous next steps are archived below\.\*\n\n([\s\S]*?)$/);m&&m[1]&&(g=m[1].trim());let p=`### ${o} - ${d}
${l||"*None*"}`,y=g?`${p}

---

${g}`:p,w=`---
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

*Last updated: ${o} ${c} from ${d}*

${l||"*No next steps identified*"}

---

## History

*Previous next steps are archived below.*

${y}
`;await this.app.vault.modify(i,w),console.log(`[Eudia] Updated Next Steps for ${e} (history preserved)`),await this.regenerateNextStepsDashboard()}catch(s){console.error(`[Eudia] Failed to update Next Steps for ${e}:`,s)}}async regenerateNextStepsDashboard(){try{let t=this.app.vault.getAbstractFileByPath("Next Steps/All Next Steps.md");if(!t||!(t instanceof u.TFile)){await this.ensureNextStepsFolderExists();return}let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!n||!(n instanceof u.TFolder))return;let s=[];for(let c of n.children)if(c instanceof u.TFolder){let d=`${c.path}/Next Steps.md`,l=this.app.vault.getAbstractFileByPath(d);if(l instanceof u.TFile){let h=await this.app.vault.read(l),g=h.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/),m=g?g[1]:"Unknown",p=h.split(`
`).filter(y=>y.match(/^- \[[ x]\]/)).slice(0,5);(p.length>0||m!=="Unknown")&&s.push({account:c.name,lastUpdated:m,nextSteps:p})}}s.sort((c,d)=>d.lastUpdated.localeCompare(c.lastUpdated));let r=new Date().toISOString().split("T")[0],i=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${r}
---

# All Next Steps Dashboard

*Last updated: ${r} ${i}*

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
`;for(let c of s){let d=c.nextSteps.filter(l=>l.includes("- [ ]")).length;o+=`| ${c.account} | ${c.lastUpdated} | ${d} |
`}}await this.app.vault.modify(t,o),console.log("[Eudia] Regenerated All Next Steps dashboard")}catch(e){console.error("[Eudia] Failed to regenerate Next Steps dashboard:",e)}}async startRecording(){if(!E.isSupported()){new u.Notice("Audio transcription is not supported in this browser");return}let e=this.app.workspace.getActiveFile();if(e||(await this.createMeetingNote(),e=this.app.workspace.getActiveFile()),!e){new u.Notice("Please open or create a note first");return}this.audioRecorder=new E,this.recordingStatusBar=new J(()=>this.audioRecorder?.pause(),()=>this.audioRecorder?.resume(),()=>this.stopRecording(),()=>this.cancelRecording());try{await this.audioRecorder.start(),this.recordingStatusBar.show(),this.micRibbonIcon?.addClass("eudia-ribbon-recording");let t=setInterval(()=>{if(this.audioRecorder?.isRecording()){let n=this.audioRecorder.getState();this.recordingStatusBar?.updateState(n)}else clearInterval(t)},100);this.liveTranscript="",this.startLiveTranscription(),new u.Notice("Transcription started. Click stop when finished.")}catch(t){new u.Notice(`Failed to start transcription: ${t.message}`),this.recordingStatusBar?.hide(),this.recordingStatusBar=null}}async stopRecording(){if(!this.audioRecorder?.isRecording())return;let e=this.app.workspace.getActiveFile();if(!e){new u.Notice("No active file to save transcription"),this.cancelRecording();return}this.recordingStatusBar?.showProcessing();try{let t=await this.audioRecorder.stop();await this.processRecording(t,e)}catch(t){new u.Notice(`Transcription failed: ${t.message}`)}finally{this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null}}async cancelRecording(){this.audioRecorder?.isRecording()&&this.audioRecorder.cancel(),this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null,new u.Notice("Transcription cancelled")}startLiveTranscription(){this.stopLiveTranscription();let e=12e4;this.liveTranscriptChunkInterval=setInterval(async()=>{await this.transcribeCurrentChunk()},e),setTimeout(async()=>{this.audioRecorder?.isRecording()&&await this.transcribeCurrentChunk()},3e4),console.log("[Eudia] Live transcription started")}stopLiveTranscription(){this.liveTranscriptChunkInterval&&(clearInterval(this.liveTranscriptChunkInterval),this.liveTranscriptChunkInterval=null),console.log("[Eudia] Live transcription stopped")}async transcribeCurrentChunk(){if(!this.audioRecorder?.isRecording()||this.isTranscribingChunk)return;let e=this.audioRecorder.extractNewChunks();if(!(!e||e.size<5e3)){this.isTranscribingChunk=!0,console.log(`[Eudia] Transcribing chunk: ${e.size} bytes`);try{let t=new FileReader,s=await new Promise((o,c)=>{t.onload=()=>{let l=t.result.split(",")[1];o(l)},t.onerror=c,t.readAsDataURL(e)}),r=this.audioRecorder.getMimeType(),i=await this.transcriptionService.transcribeChunk(s,r);i.success&&i.text&&(this.liveTranscript+=(this.liveTranscript?`

`:"")+i.text,console.log(`[Eudia] Chunk transcribed, total transcript length: ${this.liveTranscript.length}`))}catch(t){console.error("[Eudia] Chunk transcription error:",t)}finally{this.isTranscribingChunk=!1}}}openLiveQueryModal(){let e=new u.Modal(this.app);e.titleEl.setText("Query Live Transcript");let t=e.contentEl;t.addClass("eudia-live-query-modal"),t.createDiv({cls:"eudia-live-query-instructions"}).setText(`Ask a question about what has been discussed so far (${Math.round(this.liveTranscript.length/4)} words captured):`);let s=t.createEl("textarea",{cls:"eudia-live-query-input",attr:{placeholder:'e.g., "What did Tom say about pricing?" or "What were the main concerns raised?"',rows:"3"}}),r=t.createDiv({cls:"eudia-live-query-response"});r.style.display="none";let i=t.createEl("button",{text:"Ask",cls:"eudia-btn-primary"});i.addEventListener("click",async()=>{let o=s.value.trim();if(!o){new u.Notice("Please enter a question");return}i.disabled=!0,i.setText("Searching..."),r.style.display="block",r.setText("Searching transcript..."),r.addClass("eudia-loading");try{let c=await this.transcriptionService.liveQueryTranscript(o,this.liveTranscript,this.getAccountNameFromActiveFile());r.removeClass("eudia-loading"),c.success?r.setText(c.answer):(r.setText(c.error||"Failed to query transcript"),r.addClass("eudia-error"))}catch(c){r.removeClass("eudia-loading"),r.setText(`Error: ${c.message}`),r.addClass("eudia-error")}finally{i.disabled=!1,i.setText("Ask")}}),s.addEventListener("keydown",o=>{o.key==="Enter"&&!o.shiftKey&&(o.preventDefault(),i.click())}),e.open(),s.focus()}getAccountNameFromActiveFile(){let e=this.app.workspace.getActiveFile();if(!e)return;let t=e.path.match(/Accounts\/([^\/]+)\//i);if(t)return t[1]}async processRecording(e,t){let n=e.audioBlob?.size||0;if(console.log(`[Eudia] Audio blob size: ${n} bytes, duration: ${e.duration}s`),n<1e3){new u.Notice("Recording too short or no audio captured. Please try again.");return}try{let c=await E.analyzeAudioBlob(e.audioBlob);console.log(`[Eudia] Audio diagnostic: hasAudio=${c.hasAudio}, peak=${c.peakLevel}, silent=${c.silentPercent}%`),c.warning&&(console.warn(`[Eudia] Audio warning: ${c.warning}`),c.hasAudio?new u.Notice(`Warning: ${c.warning.split(":")[0]}`,5e3):new u.Notice("Warning: Audio appears to be silent. Transcription may not work correctly. Check your microphone settings.",8e3))}catch(c){console.warn("[Eudia] Audio diagnostic failed, continuing anyway:",c)}let s=Math.ceil(e.duration/60),r=Math.max(1,Math.ceil(s/5));new u.Notice(`Transcription started. Estimated ${r}-${r+1} minutes.`);let i=await this.app.vault.read(t),o=`

---
**Transcription in progress...**
Started: ${new Date().toLocaleTimeString()}
Estimated completion: ${r}-${r+1} minutes

*You can navigate away. Check back shortly.*
---
`;await this.app.vault.modify(t,i+o),this.processTranscriptionAsync(e,t).catch(c=>{console.error("Background transcription failed:",c),new u.Notice(`Transcription failed: ${c.message}`)})}async processTranscriptionAsync(e,t){try{let n={},s=t.path.split("/");console.log(`[Eudia] Processing transcription for: ${t.path}`),console.log(`[Eudia] Path parts: ${JSON.stringify(s)}, accountsFolder: ${this.settings.accountsFolder}`);let r=s[0]==="Pipeline Meetings",i=!1;try{let p=(await this.app.vault.read(t)).match(/^---\n([\s\S]*?)\n---/);p&&(i=/meeting_type:\s*pipeline_review/.test(p[1]))}catch{}if(!i&&r&&(i=!0),i){console.log("[Eudia Pipeline] Detected pipeline review meeting, using pipeline prompt");let m="";try{let p=await(0,u.requestUrl)({url:`${this.settings.serverUrl||"https://gtm-brain.onrender.com"}/api/pipeline-context`,method:"GET",headers:{"Content-Type":"application/json"}});p.json?.success&&p.json?.context&&(m=p.json.context,console.log(`[Eudia Pipeline] Loaded Salesforce pipeline context (${m.length} chars)`))}catch(p){console.warn("[Eudia Pipeline] Could not fetch pipeline context:",p)}n={meetingType:"pipeline_review",pipelineContext:m}}else if(s.length>=2&&s[0]===this.settings.accountsFolder){let m=s[1];console.log(`[Eudia] Detected account folder: ${m}`);let p=this.settings.cachedAccounts.find(y=>y.name.toLowerCase()===m.toLowerCase());p?(n={accountName:p.name,accountId:p.id},console.log(`[Eudia] Found cached account: ${p.name} (${p.id})`)):(n={accountName:m,accountId:""},console.log(`[Eudia] Account not in cache, using folder name: ${m}`))}else console.log("[Eudia] File not in Accounts folder, skipping account context");let o=[];try{let m=await this.calendarService.getCurrentMeeting();m.meeting?.attendees&&(o=m.meeting.attendees.map(p=>p.name||p.email.split("@")[0]).filter(Boolean).slice(0,10))}catch{}let c=await this.transcriptionService.transcribeAudio(e.audioBlob,{...n,speakerHints:o}),d=m=>m?!!(m.summary?.trim()||m.nextSteps?.trim()):!1,l=c.sections;if(d(l)||c.text?.trim()&&(l=await this.transcriptionService.processTranscription(c.text,n)),!d(l)&&!c.text?.trim()){let p=(await this.app.vault.read(t)).replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g,"");await this.app.vault.modify(t,p+`

**Transcription failed:** No audio detected.
`),new u.Notice("Transcription failed: No audio detected.");return}let h;i?h=this.buildPipelineNoteContent(l,c,t.path):h=this.buildNoteContent(l,c),await this.app.vault.modify(t,h);let g=Math.floor(e.duration/60);if(new u.Notice(`Transcription complete (${g} min recording)`),!i){let m=l.nextSteps||l.actionItems;console.log(`[Eudia] Next Steps extraction - accountContext: ${n?.accountName||"undefined"}`),console.log(`[Eudia] Next Steps content found: ${m?"YES ("+m.length+" chars)":"NO"}`),console.log(`[Eudia] sections.nextSteps: ${l.nextSteps?"YES":"NO"}, sections.actionItems: ${l.actionItems?"YES":"NO"}`),m&&n?.accountName?(console.log(`[Eudia] Calling updateAccountNextSteps for ${n.accountName}`),await this.updateAccountNextSteps(n.accountName,m,t.path)):console.log("[Eudia] Skipping Next Steps update - missing content or account context")}this.settings.autoSyncAfterTranscription&&await this.syncNoteToSalesforce()}catch(n){try{let r=(await this.app.vault.read(t)).replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g,"");await this.app.vault.modify(t,r+`

**Transcription failed:** ${n.message}
`)}catch{}throw n}}buildPipelineNoteContent(e,t,n){let s=new Date,r=String(s.getMonth()+1).padStart(2,"0"),i=String(s.getDate()).padStart(2,"0"),o=String(s.getFullYear()).slice(-2),c=s.toISOString().split("T")[0],d=`${r}.${i}.${o}`,l=p=>p==null?"":Array.isArray(p)?p.map(String).join(`
`):typeof p=="object"?JSON.stringify(p,null,2):String(p),h=l(e.summary),g=t.transcript||t.text||"",m=`---
title: "Team Pipeline Meeting - ${d}"
date: ${c}
meeting_type: pipeline_review
transcribed: true
---

# Weekly Pipeline Review | ${s.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"})}

`;if(h)m+=h;else{let p=[e.painPoints,e.productInterest,e.nextSteps,e.actionItems].filter(Boolean).map(l).join(`

`);p?m+=p:m+="*Pipeline summary could not be generated. See transcript below.*"}return g&&(m+=`

---

<details>
<summary><strong>Full Transcript</strong> (${Math.ceil(g.length/1e3)}k chars)</summary>

${g}

</details>
`),m}buildNoteContent(e,t){let n=y=>y==null?"":Array.isArray(y)?y.map(w=>typeof w=="object"?w.category?`**${w.category}**: ${w.signal||w.insight||""}`:JSON.stringify(w):String(w)).join(`
`):typeof y=="object"?JSON.stringify(y):String(y),s=n(e.title)||"Meeting Notes",r=n(e.summary),i=n(e.painPoints),o=n(e.productInterest),c=n(e.meddiccSignals),d=n(e.nextSteps),l=n(e.actionItems),h=n(e.keyDates),g=n(e.risksObjections),m=n(e.attendees),p=`---
title: "${s}"
date: ${new Date().toISOString().split("T")[0]}
transcribed: true
sync_to_salesforce: false
clo_meeting: false
source: ""
confidence: ${t.confidence}
---

# ${s}

## Summary

${r||"*AI summary will appear here*"}

`;return i&&!i.includes("None explicitly")&&(p+=`## Pain Points

${i}

`),o&&!o.includes("None identified")&&(p+=`## Product Interest

${o}

`),c&&(p+=`## MEDDICC Signals

${c}

`),d&&(p+=`## Next Steps

${d}

`),l&&(p+=`## Action Items

${l}

`),h&&!h.includes("No specific dates")&&(p+=`## Key Dates

${h}

`),g&&!g.includes("None raised")&&(p+=`## Risks and Objections

${g}

`),m&&(p+=`## Attendees

${m}

`),this.settings.appendTranscript&&t.text&&(p+=`---

## Full Transcript

${t.text}
`),p}openIntelligenceQuery(){new U(this.app,this).open()}openIntelligenceQueryForCurrentNote(){let e=this.app.workspace.getActiveFile(),t;if(e){let n=this.app.metadataCache.getFileCache(e)?.frontmatter;if(n?.account_id&&n?.account)t={id:n.account_id,name:n.account};else if(n?.account){let s=this.settings.cachedAccounts.find(r=>r.name.toLowerCase()===n.account.toLowerCase());s?t={id:s.id,name:s.name}:t={id:"",name:n.account}}else{let s=e.path.split("/");if(s.length>=2&&s[0]===this.settings.accountsFolder){let r=s[1],i=this.settings.cachedAccounts.find(o=>o.name.replace(/[<>:"/\\|?*]/g,"_").trim()===r);i?t={id:i.id,name:i.name}:t={id:"",name:r}}}}new U(this.app,this,t).open()}async syncAccounts(e=!1){e||new u.Notice("Syncing Salesforce accounts...");try{let n=(await(0,u.requestUrl)({url:`${this.settings.serverUrl}/api/accounts/obsidian`,method:"GET",headers:{Accept:"application/json"}})).json;if(!n.success||!n.accounts){e||new u.Notice("Failed to fetch accounts from server");return}this.settings.cachedAccounts=n.accounts.map(s=>({id:s.id,name:s.name})),this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings(),e||new u.Notice(`Synced ${n.accounts.length} accounts for matching`)}catch(t){e||new u.Notice(`Failed to sync accounts: ${t.message}`)}}async scanLocalAccountFolders(){try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!e||!(e instanceof u.TFolder))return;let t=[];for(let n of e.children)n instanceof u.TFolder&&t.push({id:`local-${n.name.replace(/\s+/g,"-").toLowerCase()}`,name:n.name});this.settings.cachedAccounts=t,this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings()}catch(e){console.error("Failed to scan local account folders:",e)}}async refreshAccountFolders(){if(!this.settings.userEmail)throw new Error("Please configure your email first");let e=new $(this.settings.serverUrl);if((await e.getAccountsForUser(this.settings.userEmail)).length===0)return console.log("[Eudia] No accounts found for user"),0;let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),s=[];if(n&&n instanceof u.TFolder)for(let o of n.children)o instanceof u.TFolder&&s.push(o.name);let r=await e.getNewAccounts(this.settings.userEmail,s);if(r.length===0)return console.log("[Eudia] All account folders exist"),0;console.log(`[Eudia] Creating ${r.length} new account folders`);let i=await this.fetchEnrichmentData(r);return await this.createTailoredAccountFolders(r,i),r.length}async checkAndConsumeSyncFlags(){if(!this.settings.userEmail)return;let e=encodeURIComponent(this.settings.userEmail.toLowerCase().trim()),t=this.settings.serverUrl||"https://gtm-wizard.onrender.com";try{let r=((await(0,u.requestUrl)({url:`${t}/api/admin/users/${e}/sync-flags`,method:"GET"})).json?.flags||[]).filter(o=>!o.consumed_at);if(r.length===0)return;console.log(`[Eudia] Found ${r.length} pending sync flag(s)`);let i=!1;for(let o of r)if(o.flag==="resync_accounts"){i=!0;let c=o.payload||{},d=c.added?.length||0,l=c.removed?.length||0;console.log(`[Eudia] Sync flag: resync_accounts (+${d} / -${l})`)}else o.flag==="update_plugin"?new u.Notice("A plugin update is available. Please download the latest vault."):o.flag==="reset_setup"&&(console.log("[Eudia] Sync flag: reset_setup received"),this.settings.setupCompleted=!1,await this.saveSettings(),new u.Notice("Setup has been reset by admin. Please re-run the setup wizard."));if(i){console.log("[Eudia] Triggering account folder resync from sync flag..."),new u.Notice("Syncing account updates...");let o=await this.syncAccountFolders();o.success?new u.Notice(`Account sync complete: ${o.added} new, ${o.archived} archived`):console.log(`[Eudia] Account resync error: ${o.error}`)}try{await(0,u.requestUrl)({url:`${t}/api/admin/users/${e}/sync-flags/consume`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagIds:r.map(o=>o.id)})}),console.log(`[Eudia] Consumed ${r.length} sync flag(s)`)}catch{console.log("[Eudia] Failed to consume sync flags (will retry next startup)")}}catch{console.log("[Eudia] Sync flag check skipped (endpoint not available)")}}async syncAccountFolders(){if(!this.settings.userEmail)return{success:!1,added:0,archived:0,error:"No email configured"};let e=this.settings.userEmail.toLowerCase().trim();console.log(`[Eudia] Syncing account folders for: ${e}`);try{let t=await fetch(`${this.settings.serverUrl}/api/bl-accounts/${encodeURIComponent(e)}`);if(!t.ok){let O=await t.json().catch(()=>({}));throw new Error(O.error||`Server returned ${t.status}`)}let n=await t.json();if(!n.success||!n.accounts)throw new Error(n.error||"Invalid response from server");let s=n.meta?.userGroup||"bl",r=n.meta?.queryDescription||"accounts",i=n.meta?.region||null;console.log(`[Eudia] User group: ${s}, accounts: ${n.accounts.length} (${r})`),i&&console.log(`[Eudia] Sales Leader region: ${i}`);let o=n.accounts||[],c=n.prospectAccounts||[],d=o.length+c.length;console.log(`[Eudia] Server returned: ${o.length} active + ${c.length} prospects = ${d} total`);let l=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),h=new Map,g=`${this.settings.accountsFolder}/_Prospects`,m=this.app.vault.getAbstractFileByPath(g),p=new Map,y=new Map;if(l&&l instanceof u.TFolder)for(let O of l.children)O instanceof u.TFolder&&!O.name.startsWith("_")&&h.set(O.name.toLowerCase().trim(),O);if(m&&m instanceof u.TFolder)for(let O of m.children)O instanceof u.TFolder?p.set(O.name.toLowerCase().trim(),O):O instanceof u.TFile&&O.extension==="md"&&y.set(O.basename.toLowerCase().trim(),O);let w=new Set(o.map(O=>O.name.toLowerCase().trim())),S=o.filter(O=>{let W=O.name.toLowerCase().trim();return!h.has(W)}),C=c.filter(O=>{let W=O.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();return!p.has(W)&&!y.has(W)&&!h.has(O.name.toLowerCase().trim())}),v=[];for(let O of o){let W=O.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();(p.has(W)||y.has(W))&&!h.has(O.name.toLowerCase().trim())&&v.push(O)}let T=new Set([...o.map(O=>O.name.toLowerCase().trim()),...c.map(O=>O.name.toLowerCase().trim())]),D=[];if(s==="bl")for(let[O,W]of h.entries())T.has(O)||D.push(W);let M=0,L=0,R=0,Y=0;if(v.length>0){console.log(`[Eudia] Promoting ${v.length} accounts from prospect to active`);for(let O of v){let W=O.name.replace(/[<>:"/\\|?*]/g,"_").trim(),j=p.get(W.toLowerCase()),b=y.get(W.toLowerCase());try{if(j){let P=`${this.settings.accountsFolder}/${W}`;await this.app.vault.rename(j,P),R++,new u.Notice(`${O.name} promoted to active`)}else if(b){await this.app.vault.delete(b);let P=[{id:O.id,name:O.name,type:O.customerType,isOwned:!0,hadOpportunity:!0}],de=await this.fetchEnrichmentData(P);await this.createTailoredAccountFolders(P,de),R++,new u.Notice(`${O.name} promoted to active -- full account folder created`)}}catch(P){console.error(`[Eudia] Failed to promote ${O.name}:`,P)}}}if(S.length>0){console.log(`[Eudia] Creating ${S.length} new active account folders for ${s}`);let O=new Set(v.map(j=>j.name.toLowerCase().trim())),W=S.filter(j=>!O.has(j.name.toLowerCase().trim()));if(W.length>0){let j=W.map(b=>({id:b.id,name:b.name,type:b.customerType,isOwned:s==="bl",ownerName:b.ownerName,hadOpportunity:!0}));if(s==="admin"||s==="exec")await this.createAdminAccountFolders(j);else{let b=await this.fetchEnrichmentData(j);await this.createTailoredAccountFolders(j,b)}M=W.length}this.telemetry&&this.telemetry.reportInfo("Accounts synced - added",{count:M,userGroup:s,region:i||void 0})}return C.length>0&&s==="bl"&&(console.log(`[Eudia] Creating ${C.length} new prospect files`),Y=await this.createProspectAccountFiles(C.map(O=>({id:O.id,name:O.name,type:"Prospect",hadOpportunity:!1,website:O.website,industry:O.industry})))),this.settings.archiveRemovedAccounts&&D.length>0&&(console.log(`[Eudia] Archiving ${D.length} removed account folders`),L=await this.archiveAccountFolders(D),this.telemetry&&this.telemetry.reportInfo("Accounts synced - archived",{count:L})),console.log(`[Eudia] Sync complete: ${M} active added, ${Y} prospects added, ${R} promoted, ${L} archived (group: ${s})`),{success:!0,added:M+Y+R,archived:L,userGroup:s}}catch(t){return console.error("[Eudia] Account sync error:",t),this.telemetry&&this.telemetry.reportError("Account sync failed",{error:t.message}),{success:!1,added:0,archived:0,error:t.message}}}async archiveAccountFolders(e){let t=0,n=`${this.settings.accountsFolder}/_Archived`;this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);for(let r of e)try{let i=`${n}/${r.name}`;if(this.app.vault.getAbstractFileByPath(i)){let l=new Date().toISOString().split("T")[0];await this.app.fileManager.renameFile(r,`${n}/${r.name}_${l}`)}else await this.app.fileManager.renameFile(r,i);let c=`${n}/${r.name}/_archived.md`,d=`---
archived_date: ${new Date().toISOString()}
reason: Account no longer in book of business
---

This account folder was archived because it no longer appears in your Salesforce book of business.

To restore, move this folder back to the Accounts directory.
`;try{await this.app.vault.create(c,d)}catch{}t++,console.log(`[Eudia] Archived: ${r.name}`)}catch(i){console.error(`[Eudia] Failed to archive ${r.name}:`,i)}return t}async syncSpecificNoteToSalesforce(e){let t=await this.app.vault.read(e),n=this.app.metadataCache.getFileCache(e)?.frontmatter;if(!n?.sync_to_salesforce)return{success:!1,error:"sync_to_salesforce not enabled"};let s=n.account_id,r=n.account;if(!s&&r){let i=this.settings.cachedAccounts.find(o=>o.name.toLowerCase()===r.toLowerCase());i&&(s=i.id)}if(!s){let i=e.path.split("/");if(i.length>=2&&i[0]===this.settings.accountsFolder){let o=i[1]==="_Prospects"&&i.length>=3?i[2]:i[1],c=this.settings.cachedAccounts.find(d=>d.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);c&&(s=c.id,r=c.name)}}if(!s)return{success:!1,error:`Could not determine account for ${e.path}`};try{let i=await(0,u.requestUrl)({url:`${this.settings.serverUrl}/api/notes/sync`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:s,accountName:r,noteTitle:e.basename,notePath:e.path,content:t,frontmatter:n,syncedAt:new Date().toISOString(),userEmail:this.settings.userEmail})});return i.json?.success?{success:!0}:{success:!1,error:i.json?.error||"Unknown error",authRequired:i.json?.authRequired}}catch(i){return{success:!1,error:i.message}}}async syncNoteToSalesforce(){let e=this.app.workspace.getActiveFile();if(!e){new u.Notice("No active file to sync");return}if(!this.app.metadataCache.getFileCache(e)?.frontmatter?.sync_to_salesforce){new u.Notice("Set sync_to_salesforce: true in frontmatter to enable sync");return}new u.Notice("Syncing to Salesforce...");let n=await this.syncSpecificNoteToSalesforce(e);n.success?new u.Notice("Synced to Salesforce"):n.authRequired?new u.Notice("Salesforce authentication required. Please reconnect."):new u.Notice("Failed to sync: "+(n.error||"Unknown error"))}async checkAndAutoEnrich(){let e=this.settings.accountsFolder||"Accounts",t=this.app.vault.getAbstractFileByPath(e);if(!t||!(t instanceof u.TFolder))return;let n=[];for(let s of t.children){if(!(s instanceof u.TFolder)||s.name.startsWith("_"))continue;let r=`${s.path}/Contacts.md`,i=this.app.vault.getAbstractFileByPath(r);if(!(!i||!(i instanceof u.TFile))){if(this.app.metadataCache.getFileCache(i)?.frontmatter?.enriched_at)continue}let o=s.name,c=this.settings.cachedAccounts.find(d=>d.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);c&&c.id&&n.push({id:c.id,name:c.name,owner:"",ownerEmail:""})}if(n.length===0){console.log("[Eudia] Auto-enrich: all account folders already enriched");return}console.log(`[Eudia] Auto-enrich: ${n.length} accounts need enrichment`);try{await this.enrichAccountFolders(n)}catch(s){console.error("[Eudia] Auto-enrich failed:",s)}}async enrichAccountFolders(e){if(!e||e.length===0)return;let t=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=this.settings.accountsFolder||"Accounts",s=e.filter(l=>l.id&&l.id.length>=15);if(s.length===0)return;let r=s.length,i=0,o=0;console.log(`[Eudia Enrich] Starting enrichment for ${r} accounts`),new u.Notice(`Enriching account data: 0/${r}...`);let c=20;for(let l=0;l<s.length;l+=c){let h=s.slice(l,l+c),g=h.map(p=>p.id);try{let p=await(0,u.requestUrl)({url:`${t}/api/accounts/enrich-batch`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountIds:g,userEmail:this.settings.userEmail})});if(p.json?.success&&p.json?.enrichments){let y=p.json.enrichments;for(let w of h){let S=y[w.id];if(S)try{await this.writeEnrichmentToAccount(w,S,n),i++}catch(C){o++,console.error(`[Eudia Enrich] Write failed for ${w.name}:`,C)}}}}catch(p){o+=h.length,console.error("[Eudia Enrich] Batch fetch failed:",p)}let m=Math.min(l+c,r);new u.Notice(`Enriching account data: ${m}/${r}...`),l+c<s.length&&await new Promise(p=>setTimeout(p,500))}let d=o>0?`Account enrichment complete: ${i} enriched, ${o} skipped`:`Account enrichment complete: ${i} accounts enriched with Salesforce data`;console.log(`[Eudia Enrich] ${d}`),new u.Notice(d)}async writeEnrichmentToAccount(e,t,n){let s=e.name.replace(/[<>:"/\\|?*]/g,"_").trim(),r=`${n}/${s}`,i=this.app.vault.getAbstractFileByPath(r);if(i instanceof u.TFolder||(r=`${n}/_Prospects/${s}`,i=this.app.vault.getAbstractFileByPath(r)),!(i instanceof u.TFolder))return;let o=new Date().toISOString(),c=async(d,l)=>{let h=`${r}/${d}`,g=this.app.vault.getAbstractFileByPath(h);if(!(g instanceof u.TFile))return;let m=await this.app.vault.read(g),p="",y=m;if(m.startsWith("---")){let v=m.indexOf("---",3);v!==-1&&(p=m.substring(0,v+3),y=m.substring(v+3),p.includes("enriched_at:")?p=p.replace(/enriched_at:.*/,`enriched_at: "${o}"`):p=p.substring(0,v)+`enriched_at: "${o}"
---`)}let w=y.match(/^(\s*#[^\n]+)/),C=`${w?w[1]:""}

${l}
`;await this.app.vault.modify(g,`${p}
${C}`)};if(t.contacts&&await c("Contacts.md",`${t.contacts}

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*`),t.intelligence&&await c("Intelligence.md",t.intelligence),t.nextSteps&&await c("Next Steps.md",t.nextSteps),t.opportunities||t.recentActivity){let d=`${r}/Meeting Notes.md`,l=this.app.vault.getAbstractFileByPath(d);if(l instanceof u.TFile){let h=await this.app.vault.read(l),g="",m=h;if(h.startsWith("---")){let S=h.indexOf("---",3);S!==-1&&(g=h.substring(0,S+3),m=h.substring(S+3),g.includes("enriched_at:")?g=g.replace(/enriched_at:.*/,`enriched_at: "${o}"`):g=g.substring(0,S)+`enriched_at: "${o}"
---`)}let p=m.match(/^(\s*#[^\n]+)/),w=[p?p[1]:`
# ${e.name} - Meeting Notes`,""];t.opportunities&&w.push(t.opportunities,""),t.recentActivity&&w.push(t.recentActivity,""),w.push("## Quick Start","","1. Open **Note 1** for your next meeting","2. Click the **microphone** to record and transcribe","3. **Next Steps** are auto-extracted after transcription","4. Set `sync_to_salesforce: true` to sync to Salesforce"),await this.app.vault.modify(l,`${g}
${w.join(`
`)}
`)}}}startSalesforceSyncScanner(){if(!this.settings.sfAutoSyncEnabled){console.log("[Eudia SF Sync] Auto-sync is disabled in settings"),this.updateSfSyncStatusBar("SF Sync: Off");return}let e=(this.settings.sfAutoSyncIntervalMinutes||15)*60*1e3;console.log(`[Eudia SF Sync] Starting scanner \u2014 interval: ${this.settings.sfAutoSyncIntervalMinutes}min`),this.updateSfSyncStatusBar("SF Sync: Idle");let t=window.setTimeout(()=>{this.runSalesforceSyncScan()},3e4);this.registerInterval(t),this.sfSyncIntervalId=window.setInterval(()=>{this.runSalesforceSyncScan()},e),this.registerInterval(this.sfSyncIntervalId)}async runSalesforceSyncScan(){if(!(!this.settings.sfAutoSyncEnabled||!this.settings.userEmail)){console.log("[Eudia SF Sync] Running scan...");try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!(e instanceof u.TFolder)){console.log("[Eudia SF Sync] Accounts folder not found");return}let t=[],n=l=>{for(let h of l.children)h instanceof u.TFile&&h.extension==="md"?t.push(h):h instanceof u.TFolder&&n(h)};n(e);let s=[];for(let l of t){let g=this.app.metadataCache.getFileCache(l)?.frontmatter;if(!g?.sync_to_salesforce)continue;let m=g.last_sf_sync?new Date(g.last_sf_sync).getTime():0;l.stat.mtime>m&&s.push(l)}if(s.length===0){console.log("[Eudia SF Sync] No flagged notes need syncing"),this.updateSfSyncStatusBar("SF Sync: Idle");return}console.log(`[Eudia SF Sync] ${s.length} note(s) queued for sync`),this.updateSfSyncStatusBar(`SF Sync: Syncing ${s.length}...`);let r=0,i=0;for(let l of s){let h=await this.syncSpecificNoteToSalesforce(l);if(h.success)r++,await this.updateNoteSyncTimestamp(l);else if(i++,console.log(`[Eudia SF Sync] Failed to sync ${l.path}: ${h.error}`),h.authRequired){new u.Notice("Salesforce authentication expired. Please reconnect to resume auto-sync."),this.updateSfSyncStatusBar("SF Sync: Auth required");return}}let c=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}),d=i>0?`SF Sync: ${r} synced, ${i} failed at ${c}`:`SF Sync: ${r} note${r!==1?"s":""} synced at ${c}`;console.log(`[Eudia SF Sync] ${d}`),this.updateSfSyncStatusBar(d),r>0&&new u.Notice(d)}catch(e){console.error("[Eudia SF Sync] Scan error:",e),this.updateSfSyncStatusBar("SF Sync: Error")}}}async updateNoteSyncTimestamp(e){try{let t=await this.app.vault.read(e),n=new Date().toISOString();if(t.startsWith("---")){let s=t.indexOf("---",3);if(s!==-1){let r=t.substring(0,s),i=t.substring(s);if(r.includes("last_sf_sync:")){let o=r.replace(/last_sf_sync:.*/,`last_sf_sync: "${n}"`)+i;await this.app.vault.modify(e,o)}else{let o=r+`last_sf_sync: "${n}"
`+i;await this.app.vault.modify(e,o)}}}}catch(t){console.error(`[Eudia SF Sync] Failed to update sync timestamp for ${e.path}:`,t)}}updateSfSyncStatusBar(e){this.sfSyncStatusBarEl&&this.sfSyncStatusBarEl.setText(e)}async createMeetingNote(){return new Promise(e=>{new X(this.app,this,async n=>{if(!n){e();return}let s=new Date().toISOString().split("T")[0],r=n.name.replace(/[<>:"/\\|?*]/g,"_").trim(),i=`${this.settings.accountsFolder}/${r}`,o=`${s} Meeting.md`,c=`${i}/${o}`;this.app.vault.getAbstractFileByPath(i)||await this.app.vault.createFolder(i);let d=`---
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

`,l=await this.app.vault.create(c,d);await this.app.workspace.getLeaf().openFile(l),new u.Notice(`Created meeting note for ${n.name}`),e()}).open()})}async fetchAndInsertContext(){new u.Notice("Fetching pre-call context...")}async refreshAnalyticsDashboard(e){if(!this.settings.userEmail){console.log("[Eudia] Cannot refresh analytics - no email configured");return}let n=(await this.app.vault.read(e)).match(/^---\n([\s\S]*?)\n---/);if(!n)return;let s=n[1];if(!s.includes("type: analytics_dashboard"))return;let r=s.match(/category:\s*(\w+)/)?.[1]||"team";console.log(`[Eudia] Refreshing analytics dashboard: ${e.name} (${r})`);try{let i=null,o=this.settings.serverUrl,c=encodeURIComponent(this.settings.userEmail);switch(r){case"pain_points":i=(await(0,u.requestUrl)({url:`${o}/api/analytics/pain-points?days=30`,method:"GET"})).json,i.success&&await this.updatePainPointNote(e,i.painPoints);break;case"objections":i=(await(0,u.requestUrl)({url:`${o}/api/analytics/objection-playbook?days=90`,method:"GET"})).json,i.success&&await this.updateObjectionNote(e,i);break;case"coaching":case"team":default:i=(await(0,u.requestUrl)({url:`${o}/api/analytics/team-trends?managerId=${c}`,method:"GET"})).json,i.success&&await this.updateTeamPerformanceNote(e,i.trends);break}i?.success&&new u.Notice(`Analytics refreshed: ${e.name}`)}catch(i){console.error("[Eudia] Analytics refresh error:",i)}}async updatePainPointNote(e,t){if(!t||t.length===0)return;let n=new Date().toISOString().split("T")[0],s=t.slice(0,10).map(d=>`| ${d.painPoint||"--"} | ${d.count||0} | ${d.category||"--"} | ${d.averageSeverity||"medium"} |`).join(`
`),r={};for(let d of t){let l=d.category||"other";r[l]||(r[l]=[]),r[l].push(d)}let i="";for(let[d,l]of Object.entries(r)){i+=`
### ${d.charAt(0).toUpperCase()+d.slice(1)}
`;for(let h of l.slice(0,3))i+=`- ${h.painPoint}
`}let o=t.filter(d=>d.exampleQuotes&&d.exampleQuotes.length>0).slice(0,5).map(d=>`> "${d.exampleQuotes[0]}" - on ${d.painPoint}`).join(`

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
${i}

---

## Example Quotes

${o||"*No quotes available*"}

---

> **Tip:** Use these pain points to prepare for customer calls.
`;await this.app.vault.modify(e,c)}async updateObjectionNote(e,t){if(!t.objections||t.objections.length===0)return;let n=new Date().toISOString().split("T")[0],s=t.objections.slice(0,10).map(o=>{let c=o.handleRatePercent>=75?"\u2705 Strong":o.handleRatePercent>=50?"\u26A0\uFE0F Moderate":"\u274C Needs Work";return`| ${o.objection?.substring(0,40)||"--"}... | ${o.count||0} | ${o.handleRatePercent||0}% | ${c} |`}).join(`
`),r="";for(let o of t.objections.slice(0,5))if(o.bestResponses&&o.bestResponses.length>0){r+=`
### Objection: "${o.objection?.substring(0,50)}..."

`,r+=`**Frequency:** ${o.count} times  
`,r+=`**Handle Rate:** ${o.handleRatePercent}%

`,r+=`**Best Responses:**
`;for(let c of o.bestResponses.slice(0,2))r+=`1. *"${c.response}"* - ${c.rep||"Team member"}
`;r+=`
`}let i=`---
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
${r||"*No best practices available yet*"}

---

## Coaching Notes

*Objections with <50% handle rate need training focus*

Average handle rate: ${t.avgHandleRate||0}%

---

> **Tip:** Review this playbook before important calls.
`;await this.app.vault.modify(e,i)}async updateTeamPerformanceNote(e,t){if(!t)return;let n=new Date().toISOString().split("T")[0],s=i=>i>0?`\u2191 ${Math.abs(i).toFixed(1)}%`:i<0?`\u2193 ${Math.abs(i).toFixed(1)}%`:"--",r=`---
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
| Avg Score | ${t.avgScore?.toFixed(1)||"--"} | ${s(t.scoreTrend)} |
| Talk Ratio | ${t.avgTalkRatio?Math.round(t.avgTalkRatio*100):"--"}% | ${s(t.talkRatioTrend)} |
| Value Score | ${t.avgValueScore?.toFixed(1)||"--"} | ${s(t.valueScoreTrend)} |
| Next Step Rate | ${t.nextStepRate?Math.round(t.nextStepRate*100):"--"}% | -- |

---

## Top Pain Points

${t.topPainPoints?.slice(0,5).map(i=>`- **${i.painPoint}** (${i.count} mentions)`).join(`
`)||"*No pain points captured yet*"}

---

## Trending Topics

${t.trendingTopics?.slice(0,8).map(i=>`- ${i.topic} (${i.count})`).join(`
`)||"*No topics captured yet*"}

---

## Top Objections

${t.topObjections?.slice(0,5).map(i=>`- ${i.objection} - ${i.handleRatePercent}% handled`).join(`
`)||"*No objections captured yet*"}

---

> **Note:** This dashboard refreshes automatically when you open it.
> Data is aggregated from all analyzed calls in your region.
`;await this.app.vault.modify(e,r)}},ee=class extends u.PluginSettingTab{constructor(a,e){super(a,e),this.plugin=e}display(){let{containerEl:a}=this;a.empty(),a.createEl("h2",{text:"Eudia Sync & Scribe"}),a.createEl("h3",{text:"Your Profile"});let e=a.createDiv();e.style.cssText="padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px; margin-top: 16px;";let t=e.createDiv();t.style.cssText="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";let n=t.createSpan(),s=t.createSpan(),r=e.createDiv();r.style.cssText="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;",r.setText("Connect with Salesforce to sync notes with your user attribution.");let i=e.createEl("button");i.style.cssText="padding: 10px 20px; cursor: pointer; border-radius: 6px;";let o=null,c=async()=>{if(!this.plugin.settings.userEmail)return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);",s.setText("Enter email above first"),i.setText("Setup Required"),i.disabled=!0,i.style.opacity="0.5",i.style.cursor="not-allowed",!1;i.disabled=!1,i.style.opacity="1",i.style.cursor="pointer";try{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); animation: pulse 1s infinite;",s.setText("Checking..."),(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;",s.setText("Connected to Salesforce"),i.setText("Reconnect"),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),!0):(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;",s.setText("Not connected"),i.setText("Connect to Salesforce"),!1)}catch{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;",s.setText("Status unavailable"),i.setText("Connect to Salesforce"),!1}};new u.Setting(a).setName("Eudia Email").setDesc("Your @eudia.com email address for calendar and Salesforce sync").addText(m=>m.setPlaceholder("yourname@eudia.com").setValue(this.plugin.settings.userEmail).onChange(async p=>{let y=p.trim().toLowerCase();this.plugin.settings.userEmail=y,await this.plugin.saveSettings(),await c()})),new u.Setting(a).setName("Timezone").setDesc("Your local timezone for calendar event display").addDropdown(m=>{ce.forEach(p=>{m.addOption(p.value,p.label)}),m.setValue(this.plugin.settings.timezone),m.onChange(async p=>{this.plugin.settings.timezone=p,await this.plugin.saveSettings(),this.plugin.calendarService?.setTimezone(p),new u.Notice(`Timezone set to ${ce.find(y=>y.value===p)?.label||p}`)})}),a.createEl("h3",{text:"Salesforce Connection"}),a.appendChild(e);let d=()=>{o&&window.clearInterval(o);let m=0,p=30;o=window.setInterval(async()=>{m++,await c()?(o&&(window.clearInterval(o),o=null),new u.Notice("Salesforce connected successfully!")):m>=p&&o&&(window.clearInterval(o),o=null)},5e3)};i.onclick=async()=>{if(!this.plugin.settings.userEmail){new u.Notice("Please enter your email first");return}let m=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(m,"_blank"),new u.Notice("Complete the Salesforce login in the popup window",5e3),d()},c(),a.createEl("h3",{text:"Server"}),new u.Setting(a).setName("GTM Brain Server").setDesc("Server URL for calendar, accounts, and sync").addText(m=>m.setValue(this.plugin.settings.serverUrl).onChange(async p=>{this.plugin.settings.serverUrl=p,await this.plugin.saveSettings()}));let l=a.createDiv({cls:"settings-advanced-collapsed"}),h=l.createDiv({cls:"eudia-transcription-status"});h.style.cssText="padding: 12px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;",h.innerHTML='<span style="color: var(--text-muted);">Checking server transcription status...</span>',(async()=>{try{(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/plugin/config`,method:"GET"})).json?.capabilities?.serverTranscription?h.innerHTML='<span class="eudia-check-icon"></span> Server transcription is available. No local API key needed.':h.innerHTML='<span class="eudia-warn-icon"></span> Server transcription unavailable. Add a local API key below.'}catch{h.innerHTML='<span style="color: #f59e0b;">\u26A0</span> Could not check server status. Local API key recommended as backup.'}})();let g=new u.Setting(a).setName("Advanced Options").setDesc("Show fallback API key (usually not needed)").addToggle(m=>m.setValue(!1).onChange(p=>{l.style.display=p?"block":"none"}));l.style.display="none",a.createEl("h3",{text:"Transcription"}),new u.Setting(a).setName("Save Audio Files").setDesc("Keep original audio recordings").addToggle(m=>m.setValue(this.plugin.settings.saveAudioFiles).onChange(async p=>{this.plugin.settings.saveAudioFiles=p,await this.plugin.saveSettings()})),new u.Setting(a).setName("Append Full Transcript").setDesc("Include complete transcript in notes").addToggle(m=>m.setValue(this.plugin.settings.appendTranscript).onChange(async p=>{this.plugin.settings.appendTranscript=p,await this.plugin.saveSettings()})),a.createEl("h3",{text:"Sync"}),new u.Setting(a).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle(m=>m.setValue(this.plugin.settings.syncOnStartup).onChange(async p=>{this.plugin.settings.syncOnStartup=p,await this.plugin.saveSettings()})),new u.Setting(a).setName("Auto-Sync After Transcription").setDesc("Push notes to Salesforce after transcription").addToggle(m=>m.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async p=>{this.plugin.settings.autoSyncAfterTranscription=p,await this.plugin.saveSettings()})),new u.Setting(a).setName("Auto-Sync Flagged Notes").setDesc("Periodically push notes with sync_to_salesforce: true to Salesforce").addToggle(m=>m.setValue(this.plugin.settings.sfAutoSyncEnabled).onChange(async p=>{this.plugin.settings.sfAutoSyncEnabled=p,await this.plugin.saveSettings(),p?this.plugin.startSalesforceSyncScanner():this.plugin.updateSfSyncStatusBar("SF Sync: Off")})),new u.Setting(a).setName("Auto-Sync Interval").setDesc("How often to scan for flagged notes (in minutes)").addDropdown(m=>{m.addOption("5","Every 5 minutes"),m.addOption("15","Every 15 minutes"),m.addOption("30","Every 30 minutes"),m.setValue(String(this.plugin.settings.sfAutoSyncIntervalMinutes)),m.onChange(async p=>{this.plugin.settings.sfAutoSyncIntervalMinutes=parseInt(p),await this.plugin.saveSettings(),new u.Notice(`SF auto-sync interval set to ${p} minutes. Restart Obsidian for changes to take effect.`)})}),a.createEl("h3",{text:"Folders"}),new u.Setting(a).setName("Accounts Folder").setDesc("Where account folders are stored").addText(m=>m.setValue(this.plugin.settings.accountsFolder).onChange(async p=>{this.plugin.settings.accountsFolder=p||"Accounts",await this.plugin.saveSettings()})),new u.Setting(a).setName("Recordings Folder").setDesc("Where audio files are saved").addText(m=>m.setValue(this.plugin.settings.recordingsFolder).onChange(async p=>{this.plugin.settings.recordingsFolder=p||"Recordings",await this.plugin.saveSettings()})),a.createEl("h3",{text:"Actions"}),new u.Setting(a).setName("Sync Accounts Now").setDesc(`${this.plugin.settings.cachedAccounts.length} accounts available for matching`).addButton(m=>m.setButtonText("Sync").setCta().onClick(async()=>{await this.plugin.syncAccounts(),this.display()})),new u.Setting(a).setName("Refresh Account Folders").setDesc("Check for new account assignments and create folders for them").addButton(m=>m.setButtonText("Refresh Folders").onClick(async()=>{m.setButtonText("Checking..."),m.setDisabled(!0);try{let p=await this.plugin.refreshAccountFolders();p>0?new u.Notice(`Created ${p} new account folder${p>1?"s":""}`):new u.Notice("All account folders are up to date")}catch(p){new u.Notice("Failed to refresh folders: "+p.message)}m.setButtonText("Refresh Folders"),m.setDisabled(!1),this.display()})),this.plugin.settings.lastSyncTime&&a.createEl("p",{text:`Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()}`,cls:"setting-item-description"}),a.createEl("p",{text:`Audio transcription: ${E.isSupported()?"Supported":"Not supported"}`,cls:"setting-item-description"})}};
