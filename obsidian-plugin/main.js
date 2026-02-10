var Y=Object.create;var $=Object.defineProperty;var J=Object.getOwnPropertyDescriptor;var Q=Object.getOwnPropertyNames;var Z=Object.getPrototypeOf,X=Object.prototype.hasOwnProperty;var ee=(y,s)=>{for(var e in s)$(y,e,{get:s[e],enumerable:!0})},U=(y,s,e,t)=>{if(s&&typeof s=="object"||typeof s=="function")for(let n of Q(s))!X.call(y,n)&&n!==e&&$(y,n,{get:()=>s[n],enumerable:!(t=J(s,n))||t.enumerable});return y};var B=(y,s,e)=>(e=y!=null?Y(Z(y)):{},U(s||!y||!y.__esModule?$(e,"default",{value:y,enumerable:!0}):e,y)),te=y=>U($({},"__esModule",{value:!0}),y);var he={};ee(he,{default:()=>F});module.exports=te(he);var d=require("obsidian");var S=class y{constructor(){this.mediaRecorder=null;this.audioChunks=[];this.stream=null;this.startTime=0;this.pausedDuration=0;this.pauseStartTime=0;this.durationInterval=null;this.audioContext=null;this.analyser=null;this.levelInterval=null;this.lastExtractedChunkIndex=0;this.mimeTypeCache="audio/webm";this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0};this.stateCallback=null;this.levelHistory=[];this.trackingLevels=!1}onStateChange(s){this.stateCallback=s}static isIOSOrSafari(){let s=navigator.userAgent,e=/iPad|iPhone|iPod/.test(s)&&!window.MSStream,t=/^((?!chrome|android).)*safari/i.test(s);return e||t}getSupportedMimeType(){let s=y.isIOSOrSafari(),e=s?["audio/mp4","audio/mp4;codecs=aac","audio/aac","audio/webm;codecs=opus","audio/webm"]:["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];for(let t of e)if(MediaRecorder.isTypeSupported(t))return console.log(`[AudioRecorder] Using MIME type: ${t} (iOS/Safari: ${s})`),t;return s?"audio/mp4":"audio/webm"}async startRecording(){if(this.state.isRecording)throw new Error("Already recording");try{let s=y.isIOSOrSafari(),e=s?{echoCancellation:!0,noiseSuppression:!0}:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0,sampleRate:48e3,channelCount:1};this.stream=await navigator.mediaDevices.getUserMedia({audio:e}),console.log(`[AudioRecorder] Microphone access granted (iOS/Safari: ${s})`),this.setupAudioAnalysis();let t=this.getSupportedMimeType();this.mimeTypeCache=t,this.mediaRecorder=new MediaRecorder(this.stream,{mimeType:t,audioBitsPerSecond:96e3}),this.audioChunks=[],this.lastExtractedChunkIndex=0,this.mediaRecorder.ondataavailable=n=>{n.data.size>0&&this.audioChunks.push(n.data)},this.mediaRecorder.start(1e3),this.startTime=Date.now(),this.pausedDuration=0,this.state={isRecording:!0,isPaused:!1,duration:0,audioLevel:0},this.startDurationTracking(),this.startLevelTracking(),this.notifyStateChange()}catch(s){throw this.cleanup(),new Error(`Failed to start recording: ${s.message}`)}}setupAudioAnalysis(){if(this.stream)try{this.audioContext=new AudioContext;let s=this.audioContext.createMediaStreamSource(this.stream);this.analyser=this.audioContext.createAnalyser(),this.analyser.fftSize=256,s.connect(this.analyser)}catch(s){console.warn("Failed to set up audio analysis:",s)}}startDurationTracking(){this.durationInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused){let s=Date.now()-this.startTime-this.pausedDuration;this.state.duration=Math.floor(s/1e3),this.notifyStateChange()}},100)}startLevelTracking(){if(!this.analyser)return;let s=new Uint8Array(this.analyser.frequencyBinCount);this.levelInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused&&this.analyser){this.analyser.getByteFrequencyData(s);let e=0;for(let n=0;n<s.length;n++)e+=s[n];let t=e/s.length;this.state.audioLevel=Math.min(100,Math.round(t/255*100*2)),this.notifyStateChange()}},50)}pauseRecording(){!this.state.isRecording||this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="recording"&&(this.mediaRecorder.pause(),this.pauseStartTime=Date.now(),this.state.isPaused=!0,this.notifyStateChange())}resumeRecording(){!this.state.isRecording||!this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="paused"&&(this.mediaRecorder.resume(),this.pausedDuration+=Date.now()-this.pauseStartTime,this.state.isPaused=!1,this.notifyStateChange())}async stopRecording(){return new Promise((s,e)=>{if(!this.mediaRecorder||!this.state.isRecording){e(new Error("Not currently recording"));return}let t=this.mediaRecorder.mimeType,n=this.state.duration,a=!1,i=setTimeout(()=>{if(!a){a=!0,console.warn("AudioRecorder: onstop timeout, forcing completion");try{let r=new Blob(this.audioChunks,{type:t}),o=new Date,c=o.toISOString().split("T")[0],l=o.toTimeString().split(" ")[0].replace(/:/g,"-"),u=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm",p=`recording-${c}-${l}.${u}`;this.cleanup(),s({audioBlob:r,duration:n,mimeType:t,filename:p})}catch{this.cleanup(),e(new Error("Failed to process recording after timeout"))}}},1e4);this.mediaRecorder.onstop=()=>{if(!a){a=!0,clearTimeout(i);try{console.log(`[AudioRecorder] Chunks collected: ${this.audioChunks.length}`);let r=new Blob(this.audioChunks,{type:t});console.log(`[AudioRecorder] Blob size: ${r.size} bytes`);let o=new Date,c=o.toISOString().split("T")[0],l=o.toTimeString().split(" ")[0].replace(/:/g,"-"),u=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm",p=`recording-${c}-${l}.${u}`;this.cleanup(),s({audioBlob:r,duration:n,mimeType:t,filename:p})}catch(r){this.cleanup(),e(r)}}},this.mediaRecorder.onerror=r=>{a||(a=!0,clearTimeout(i),this.cleanup(),e(new Error("Recording error occurred")))},this.mediaRecorder.state==="recording"&&this.mediaRecorder.requestData(),setTimeout(()=>{this.mediaRecorder&&this.mediaRecorder.state!=="inactive"&&this.mediaRecorder.stop()},100)})}cancelRecording(){this.cleanup()}cleanup(){this.durationInterval&&(clearInterval(this.durationInterval),this.durationInterval=null),this.levelInterval&&(clearInterval(this.levelInterval),this.levelInterval=null),this.audioContext&&(this.audioContext.close().catch(()=>{}),this.audioContext=null,this.analyser=null),this.stream&&(this.stream.getTracks().forEach(s=>s.stop()),this.stream=null),this.mediaRecorder=null,this.audioChunks=[],this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0},this.notifyStateChange()}getState(){return{...this.state}}static isSupported(){if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder)return!1;let e=["audio/webm","audio/mp4","audio/ogg","audio/webm;codecs=opus"].some(t=>MediaRecorder.isTypeSupported(t));return e||console.warn("[AudioRecorder] No supported audio formats found"),e}static getMobileInstructions(){return this.isIOSOrSafari()?"For best results on iOS, ensure you have granted microphone permissions in Settings > Privacy > Microphone.":null}notifyStateChange(){this.stateCallback&&this.stateCallback({...this.state})}static formatDuration(s){let e=Math.floor(s/60),t=s%60;return`${e.toString().padStart(2,"0")}:${t.toString().padStart(2,"0")}`}static async blobToBase64(s){return new Promise((e,t)=>{let n=new FileReader;n.onload=()=>{let i=n.result.split(",")[1];e(i)},n.onerror=t,n.readAsDataURL(s)})}static async blobToArrayBuffer(s){return s.arrayBuffer()}async start(){return this.startRecording()}async stop(){return this.stopRecording()}pause(){return this.pauseRecording()}resume(){return this.resumeRecording()}cancel(){return this.cancelRecording()}isRecording(){return this.state.isRecording}extractNewChunks(){if(!this.state.isRecording||this.audioChunks.length===0)return null;let s=this.audioChunks.slice(this.lastExtractedChunkIndex);return s.length===0?null:(this.lastExtractedChunkIndex=this.audioChunks.length,new Blob(s,{type:this.mimeTypeCache}))}getAllChunksAsBlob(){return this.audioChunks.length===0?null:new Blob(this.audioChunks,{type:this.mimeTypeCache})}getDuration(){return this.state.duration}getMimeType(){return this.mimeTypeCache}startLevelHistoryTracking(){this.levelHistory=[],this.trackingLevels=!0}recordLevelSample(){this.trackingLevels&&this.levelHistory.push(this.state.audioLevel)}getAudioDiagnostic(){if(this.levelHistory.length===0)return{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:100,warning:"Unable to analyze audio levels - recording may be too short"};let s=this.levelHistory.reduce((i,r)=>i+r,0)/this.levelHistory.length,e=Math.max(...this.levelHistory),t=this.levelHistory.filter(i=>i<5).length,n=Math.round(t/this.levelHistory.length*100),a=null;return e<5?a="SILENT AUDIO: No audio was detected during recording. Check your microphone settings and ensure Obsidian has microphone permission.":s<10&&n>80?a="VERY LOW AUDIO: Audio levels were extremely low. The transcription may not be accurate. Check your microphone or move closer to it.":n>90&&(a="MOSTLY SILENT: Over 90% of the recording had no audio. Make sure you're capturing the meeting audio, not just silence."),{hasAudio:e>=5,averageLevel:Math.round(s),peakLevel:e,silentPercent:n,warning:a}}static async analyzeAudioBlob(s){try{let e=new AudioContext,t=await s.arrayBuffer(),n;try{n=await e.decodeAudioData(t)}catch{return await e.close(),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:"Could not analyze audio format. Proceeding with transcription."}}let a=n.getChannelData(0),i=0,r=0,o=0,c=.01,l=100,u=0;for(let v=0;v<a.length;v+=l){let A=Math.abs(a[v]);i+=A,A>r&&(r=A),A<c&&o++,u++}await e.close();let p=i/u,f=Math.round(o/u*100),m=Math.round(p*100*10),g=Math.round(r*100),h=null;return r<.01?h='SILENT AUDIO DETECTED: The recording appears to contain only silence. This typically causes Whisper to hallucinate random text like "Yes. Yes. Yes." Check your audio input source.':p<.005&&f>95?h="NEAR-SILENT AUDIO: The recording is almost entirely silent. The transcription will likely be inaccurate.":f>90&&(h="MOSTLY SILENT: Over 90% of the recording is silent. Consider checking your audio setup."),{hasAudio:r>=.01,averageLevel:m,peakLevel:g,silentPercent:f,warning:h}}catch(e){return console.error("Audio analysis failed:",e),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:null}}}};var C=require("obsidian");var R=class{constructor(){this.salesforceAccounts=[]}setAccounts(s){this.salesforceAccounts=s}detectAccount(s,e,t){if(s){let n=this.detectFromTitle(s);if(n.confidence>=70)return n}if(t){let n=this.detectFromFilePath(t);if(n.confidence>=70)return n}if(e&&e.length>0){let n=this.detectFromAttendees(e);if(n.confidence>=50)return n}return{account:null,accountId:null,confidence:0,source:"none",evidence:"No account detected from available context"}}detectFromTitle(s){if(!s)return{account:null,accountId:null,confidence:0,source:"title",evidence:"No title"};let e=[{regex:/^([A-Za-z0-9][^-–—]+?)\s*[-–—]\s*(?:[A-Z][a-z]+|[A-Za-z]{2,})/,confidence:85},{regex:/(?:call|meeting|sync|check-in|demo|discovery)\s+(?:with|re:?|@)\s+([^-–—]+?)(?:\s*[-–—]|$)/i,confidence:80},{regex:/^([A-Za-z][^-–—]+?)\s+(?:discovery|demo|review|kickoff|intro|onboarding|sync)\s*(?:call)?$/i,confidence:75},{regex:/^([^:]+?):\s+/i,confidence:70},{regex:/^\[([^\]]+)\]/,confidence:75}],t=["weekly","daily","monthly","internal","team","1:1","one on one","standup","sync","meeting","call","notes","monday","tuesday","wednesday","thursday","friday","untitled","new","test"];for(let n of e){let a=s.match(n.regex);if(a&&a[1]){let i=a[1].trim();if(t.some(o=>i.toLowerCase()===o)||i.length<2)continue;let r=this.fuzzyMatchSalesforce(i);return r?{account:r.name,accountId:r.id,confidence:Math.min(n.confidence+10,100),source:"salesforce_match",evidence:`Matched "${i}" from title to Salesforce account "${r.name}"`}:{account:i,accountId:null,confidence:n.confidence,source:"title",evidence:"Extracted from meeting title pattern"}}}return{account:null,accountId:null,confidence:0,source:"title",evidence:"No pattern matched"}}detectFromFilePath(s){let e=s.match(/Accounts\/([^\/]+)\//i);if(e&&e[1]){let t=e[1].trim(),n=this.fuzzyMatchSalesforce(t);return n?{account:n.name,accountId:n.id,confidence:95,source:"salesforce_match",evidence:`File in account folder "${t}" matched to "${n.name}"`}:{account:t,accountId:null,confidence:85,source:"title",evidence:`File located in Accounts/${t} folder`}}return{account:null,accountId:null,confidence:0,source:"none",evidence:"Not in Accounts folder"}}detectFromAttendees(s){let e=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com"],t=new Set;for(let r of s){let c=r.toLowerCase().match(/@([a-z0-9.-]+)/);if(c){let l=c[1];!l.includes("eudia.com")&&!e.includes(l)&&t.add(l)}}if(t.size===0)return{account:null,accountId:null,confidence:0,source:"attendee_domain",evidence:"No external domains"};for(let r of t){let o=r.split(".")[0],c=o.charAt(0).toUpperCase()+o.slice(1),l=this.fuzzyMatchSalesforce(c);if(l)return{account:l.name,accountId:l.id,confidence:75,source:"salesforce_match",evidence:`Matched attendee domain ${r} to "${l.name}"`}}let n=Array.from(t)[0],a=n.split(".")[0];return{account:a.charAt(0).toUpperCase()+a.slice(1),accountId:null,confidence:50,source:"attendee_domain",evidence:`Guessed from external attendee domain: ${n}`}}fuzzyMatchSalesforce(s){if(!s||this.salesforceAccounts.length===0)return null;let e=s.toLowerCase().trim();for(let t of this.salesforceAccounts)if(t.name?.toLowerCase()===e)return t;for(let t of this.salesforceAccounts)if(t.name?.toLowerCase().startsWith(e))return t;for(let t of this.salesforceAccounts)if(t.name?.toLowerCase().includes(e))return t;for(let t of this.salesforceAccounts)if(e.includes(t.name?.toLowerCase()))return t;return null}suggestAccounts(s,e=10){if(!s||s.length<2)return this.salesforceAccounts.slice(0,e).map(a=>({...a,score:0}));let t=s.toLowerCase(),n=[];for(let a of this.salesforceAccounts){let i=a.name?.toLowerCase()||"",r=0;i===t?r=100:i.startsWith(t)?r=90:i.includes(t)?r=70:t.includes(i)&&(r=50),r>0&&n.push({...a,score:r})}return n.sort((a,i)=>i.score-a.score).slice(0,e)}},ve=new R;function ne(y,s){let e="";return(s?.account||s?.opportunities?.length)&&(e=`
ACCOUNT CONTEXT (use to inform your analysis):
${s.account?`- Account: ${s.account.name}`:""}
${s.account?.owner?`- Account Owner: ${s.account.owner}`:""}
${s.opportunities?.length?`- Open Opportunities: ${s.opportunities.map(t=>`${t.name} (${t.stage}, $${(t.acv/1e3).toFixed(0)}k)`).join("; ")}`:""}
${s.contacts?.length?`- Known Contacts: ${s.contacts.slice(0,5).map(t=>`${t.name} - ${t.title}`).join("; ")}`:""}
`),`You are a senior sales intelligence analyst for Eudia, an AI-powered legal technology company. Your role is to extract precise, actionable intelligence from sales meeting transcripts.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies. Our products help in-house legal teams work faster on contracting, compliance, and M&A due diligence. We sell to CLOs, General Counsels, VP Legal, Legal Ops Directors, and Deputy GCs.

${y?`CURRENT ACCOUNT: ${y}`:""}
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
- Action items have clear owners`}var N=class{constructor(s){this.serverUrl=s}setServerUrl(s){this.serverUrl=s}async transcribeAndSummarize(s,e,t,n,a){try{let i=await(0,C.requestUrl)({url:`${this.serverUrl}/api/transcribe-and-summarize`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:s,mimeType:e,accountName:t,accountId:n,context:a?{customerBrain:a.account?.customerBrain,opportunities:a.opportunities,contacts:a.contacts}:void 0,systemPrompt:ne(t,a)})});return i.json.success?{success:!0,transcript:i.json.transcript||"",sections:this.normalizeSections(i.json.sections),duration:i.json.duration||0}:{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:i.json.error||"Transcription failed"}}catch(i){console.error("Server transcription error:",i),i.response&&console.error("Server response:",i.response);let r="";try{i.response?.json?.error?r=i.response.json.error:typeof i.response=="string"&&(r=JSON.parse(i.response).error||"")}catch{}let o=r||`Transcription failed: ${i.message}`;return i.message?.includes("413")?o="Audio file too large for server. Try a shorter recording.":i.message?.includes("500")?o=r||"Server error during transcription. Please try again.":(i.message?.includes("Failed to fetch")||i.message?.includes("NetworkError"))&&(o="Could not reach transcription server. Check your internet connection."),console.error("Final error message:",o),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:o}}}parseSections(s){let e=this.getEmptySections(),t={summary:"summary",attendees:"attendees","meddicc signals":"meddiccSignals","product interest":"productInterest","pain points":"painPoints","buying triggers":"buyingTriggers","key dates":"keyDates","next steps":"nextSteps","action items":"actionItems","action items (internal)":"actionItems","deal signals":"dealSignals","risks & objections":"risksObjections","risks and objections":"risksObjections","competitive intelligence":"competitiveIntel"},n=/## ([^\n]+)\n([\s\S]*?)(?=## |$)/g,a;for(;(a=n.exec(s))!==null;){let i=a[1].trim().toLowerCase(),r=a[2].trim(),o=t[i];o&&(e[o]=r)}return e}normalizeSections(s){let e=this.getEmptySections();return s?{...e,...s}:e}async getMeetingContext(s){try{let e=await(0,C.requestUrl)({url:`${this.serverUrl}/api/meeting-context/${s}`,method:"GET",headers:{Accept:"application/json"}});return e.json.success?{success:!0,account:e.json.account,opportunities:e.json.opportunities,contacts:e.json.contacts,lastMeeting:e.json.lastMeeting}:{success:!1,error:e.json.error||"Failed to fetch context"}}catch(e){return console.error("Meeting context error:",e),{success:!1,error:e.message||"Network error"}}}async syncToSalesforce(s,e,t,n,a,i){try{let r=await(0,C.requestUrl)({url:`${this.serverUrl}/api/transcription/sync-to-salesforce`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:s,accountName:e,noteTitle:t,sections:n,transcript:a,meetingDate:i||new Date().toISOString(),syncedAt:new Date().toISOString()})});return r.json.success?{success:!0,customerBrainUpdated:r.json.customerBrainUpdated,eventCreated:r.json.eventCreated,eventId:r.json.eventId,contactsCreated:r.json.contactsCreated,tasksCreated:r.json.tasksCreated}:{success:!1,error:r.json.error||"Sync failed"}}catch(r){return console.error("Salesforce sync error:",r),{success:!1,error:r.message||"Network error"}}}getEmptySections(){return{summary:"",attendees:"",meddiccSignals:"",productInterest:"",painPoints:"",buyingTriggers:"",keyDates:"",nextSteps:"",actionItems:"",dealSignals:"",risksObjections:"",competitiveIntel:""}}async liveQueryTranscript(s,e,t){if(!e||e.trim().length<50)return{success:!1,answer:"",error:"Not enough transcript captured yet. Keep recording for a few more minutes."};try{let n=await(0,C.requestUrl)({url:`${this.serverUrl}/api/live-query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:s,transcript:e,accountName:t,systemPrompt:this.buildLiveQueryPrompt()})});return n.json.success?{success:!0,answer:n.json.answer||"No relevant information found in the transcript."}:{success:!1,answer:"",error:n.json.error||"Query failed"}}catch(n){return console.error("Live query error:",n),{success:!1,answer:"",error:n.message||"Failed to query transcript"}}}async transcribeChunk(s,e){try{let t=await(0,C.requestUrl)({url:`${this.serverUrl}/api/transcribe-chunk`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:s,mimeType:e})});return t.json.success?{success:!0,text:t.json.text||""}:{success:!1,text:"",error:t.json.error||"Chunk transcription failed"}}catch(t){return console.error("Chunk transcription error:",t),{success:!1,text:"",error:t.message||"Failed to transcribe chunk"}}}buildLiveQueryPrompt(){return`You are an AI assistant helping a salesperson during an active customer call. 
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

`;let i=t.talkTime.repPercent,r=t.talkTime.customerPercent,o=t.talkTime.isHealthyRatio?"\u2705":"\u26A0\uFE0F";n+=`**Talk Time:** Rep ${i}% / Customer ${r}% ${o}
`;let c=Math.round(i/5),l=Math.round(r/5);if(n+=`\`${"\u2588".repeat(c)}${"\u2591".repeat(20-c)}\` Rep
`,n+=`\`${"\u2588".repeat(l)}${"\u2591".repeat(20-l)}\` Customer

`,t.coaching){let u=t.coaching;if(u.totalQuestions>0){let p=Math.round(u.openQuestions/u.totalQuestions*100);n+=`**Questions:** ${u.totalQuestions} total (${u.openQuestions} open, ${u.closedQuestions} closed - ${p}% open)
`}if(u.objections&&u.objections.length>0){let p=u.objections.filter(f=>f.handled).length;n+=`**Objections:** ${u.objections.length} raised, ${p} handled
`}u.valueScore!==void 0&&(n+=`**Value Articulation:** ${u.valueScore}/10
`),u.nextStepClear!==void 0&&(n+=`**Next Step Clarity:** ${u.nextStepClear?"\u2705 Clear":"\u26A0\uFE0F Unclear"}
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

`);let a=t?.enabled&&t?.formattedTranscript?t.formattedTranscript:e;if(a){let i=t?.enabled?"Full Transcript (Speaker-Attributed)":"Full Transcript";n+=`---

<details>
<summary><strong>${i}</strong></summary>

${a}

</details>
`}return n}static formatSectionsWithAudio(s,e,t,n){let a=this.formatSectionsForNote(s,e,n);return t&&(a+=`
---

## Recording

![[${t}]]
`),a}static formatContextForNote(s){if(!s.success)return"";let e=`## Pre-Call Context

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

`,e}async blobToBase64(s){return new Promise((e,t)=>{let n=new FileReader;n.onload=()=>{let i=n.result.split(",")[1];e(i)},n.onerror=t,n.readAsDataURL(s)})}async transcribeAudio(s,e){try{let t=await this.blobToBase64(s),n=s.type||"audio/webm",a=await this.transcribeAndSummarize(t,n,e?.accountName,e?.accountId);return{text:a.transcript,confidence:a.success?.95:0,duration:a.duration,sections:a.sections}}catch(t){return console.error("transcribeAudio error:",t),{text:"",confidence:0,duration:0,sections:this.getEmptySections()}}}async processTranscription(s,e){if(!s||s.trim().length===0)return this.getEmptySections();try{let t=await(0,C.requestUrl)({url:`${this.serverUrl}/api/process-sections`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript:s,accountName:e?.accountName,context:e})});if(t.json?.success&&t.json?.sections){let n=t.json.sections;return{summary:n.summary||"",painPoints:n.painPoints||n.keyPoints||"",productInterest:n.productInterest||"",meddiccSignals:n.meddiccSignals||"",nextSteps:n.nextSteps||"",actionItems:n.actionItems||"",keyDates:n.keyDates||"",buyingTriggers:n.buyingTriggers||"",dealSignals:n.dealSignals||"",risksObjections:n.risksObjections||n.concerns||"",competitiveIntel:n.competitiveIntel||"",attendees:n.attendees||"",transcript:s}}return console.warn("Server process-sections returned no sections, using fallback"),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:s}}catch(t){return console.error("processTranscription server error:",t),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:s}}}};var P=require("obsidian"),b=class y{constructor(s,e,t="America/New_York"){this.serverUrl=s,this.userEmail=e.toLowerCase(),this.timezone=t}setUserEmail(s){this.userEmail=s.toLowerCase()}setServerUrl(s){this.serverUrl=s}setTimezone(s){this.timezone=s}async getTodaysMeetings(s=!1){if(!this.userEmail)return{success:!1,date:new Date().toISOString().split("T")[0],email:"",meetingCount:0,meetings:[],error:"User email not configured"};try{let e=encodeURIComponent(this.timezone),t=s?"&forceRefresh=true":"";return(await(0,P.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/today?timezone=${e}${t}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(e){return console.error("Failed to fetch today's meetings:",e),{success:!1,date:new Date().toISOString().split("T")[0],email:this.userEmail,meetingCount:0,meetings:[],error:e.message||"Failed to fetch calendar"}}}async getWeekMeetings(s=!1){if(!this.userEmail)return{success:!1,startDate:"",endDate:"",email:"",totalMeetings:0,byDay:{},error:"User email not configured"};try{let e=encodeURIComponent(this.timezone),t=s?"&forceRefresh=true":"";return(await(0,P.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/week?timezone=${e}${t}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(e){return console.error("Failed to fetch week's meetings:",e),{success:!1,startDate:"",endDate:"",email:this.userEmail,totalMeetings:0,byDay:{},error:e.message||"Failed to fetch calendar"}}}async getMeetingsInRange(s,e){if(!this.userEmail)return[];try{let t=s.toISOString().split("T")[0],n=e.toISOString().split("T")[0],a=await(0,P.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${t}&end=${n}`,method:"GET",headers:{Accept:"application/json"}});return a.json.success?a.json.meetings||[]:[]}catch(t){return console.error("Failed to fetch calendar range:",t),[]}}async getCurrentMeeting(){let s=await this.getTodaysMeetings();if(!s.success||s.meetings.length===0)return{meeting:null,isNow:!1};let e=new Date;for(let t of s.meetings){let n=y.safeParseDate(t.start),a=y.safeParseDate(t.end);if(e>=n&&e<=a)return{meeting:t,isNow:!0};let i=(n.getTime()-e.getTime())/(1e3*60);if(i>0&&i<=15)return{meeting:t,isNow:!1,minutesUntilStart:Math.ceil(i)}}return{meeting:null,isNow:!1}}async getMeetingsForAccount(s){let e=await this.getWeekMeetings();if(!e.success)return[];let t=[];Object.values(e.byDay).forEach(a=>{t.push(...a)});let n=s.toLowerCase();return t.filter(a=>a.accountName?.toLowerCase().includes(n)||a.subject.toLowerCase().includes(n)||a.attendees.some(i=>i.email.toLowerCase().includes(n.split(" ")[0])))}static formatMeetingForNote(s){let e=s.attendees.filter(t=>t.isExternal!==!1).map(t=>t.name||t.email.split("@")[0]).slice(0,5).join(", ");return{title:s.subject,attendees:e,meetingStart:s.start,accountName:s.accountName}}static getDayName(s){let e;s.length===10&&s.includes("-")?e=new Date(s+"T00:00:00"):e=new Date(s);let t=new Date;t.setHours(0,0,0,0);let n=new Date(e);n.setHours(0,0,0,0);let a=Math.round((n.getTime()-t.getTime())/(1e3*60*60*24));return a===0?"Today":a===1?"Tomorrow":e.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}static formatTime(s,e){let t=s;t&&!t.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(t)&&(t=t+"Z");let n=new Date(t);if(isNaN(n.getTime()))return s;let a={hour:"numeric",minute:"2-digit",hour12:!0};return e&&(a.timeZone=e),n.toLocaleTimeString("en-US",a)}static safeParseDate(s){if(!s)return new Date(NaN);let e=s;return!e.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(e)&&(e=e+"Z"),new Date(e)}static getMeetingDuration(s,e){let t=y.safeParseDate(s),n=y.safeParseDate(e);return Math.round((n.getTime()-t.getTime())/(1e3*60))}};var se=["ai-contracting-tech","ai-contracting-services","ai-compliance-tech","ai-compliance-services","ai-ma-tech","ai-ma-services","sigma"],ie=["metrics-identified","economic-buyer-identified","decision-criteria-discussed","decision-process-discussed","pain-confirmed","champion-identified","competition-mentioned"],ae=["progressing","stalled","at-risk","champion-engaged","early-stage"],re=["discovery","demo","negotiation","qbr","implementation","follow-up"],oe=`You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

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
}`,D=class{constructor(s,e){this.openaiApiKey=null;this.serverUrl=s,this.openaiApiKey=e||null}setOpenAIKey(s){this.openaiApiKey=s}setServerUrl(s){this.serverUrl=s}async extractTags(s){let e=this.buildTagContext(s);if(!e.trim())return{success:!1,tags:this.getEmptyTags(),error:"No content to analyze"};try{return await this.extractTagsViaServer(e)}catch(t){return console.warn("Server tag extraction failed, trying local:",t.message),this.openaiApiKey?await this.extractTagsLocal(e):this.extractTagsRuleBased(s)}}buildTagContext(s){let e=[];return s.summary&&e.push(`SUMMARY:
${s.summary}`),s.productInterest&&e.push(`PRODUCT INTEREST:
${s.productInterest}`),s.meddiccSignals&&e.push(`MEDDICC SIGNALS:
${s.meddiccSignals}`),s.dealSignals&&e.push(`DEAL SIGNALS:
${s.dealSignals}`),s.painPoints&&e.push(`PAIN POINTS:
${s.painPoints}`),s.attendees&&e.push(`ATTENDEES:
${s.attendees}`),e.join(`

`)}async extractTagsViaServer(s){let e=await fetch(`${this.serverUrl}/api/extract-tags`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:s,openaiApiKey:this.openaiApiKey})});if(!e.ok)throw new Error(`Server returned ${e.status}`);let t=await e.json();if(!t.success)throw new Error(t.error||"Tag extraction failed");return{success:!0,tags:this.validateAndNormalizeTags(t.tags)}}async extractTagsLocal(s){if(!this.openaiApiKey)return{success:!1,tags:this.getEmptyTags(),error:"No OpenAI API key configured"};try{let e=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:oe},{role:"user",content:`Extract tags from this meeting content:

${s}`}],temperature:.1,response_format:{type:"json_object"}})});if(!e.ok)throw new Error(`OpenAI returned ${e.status}`);let n=(await e.json()).choices?.[0]?.message?.content;if(!n)throw new Error("No content in response");let a=JSON.parse(n);return{success:!0,tags:this.validateAndNormalizeTags(a)}}catch(e){return console.error("Local tag extraction error:",e),{success:!1,tags:this.getEmptyTags(),error:e.message||"Tag extraction failed"}}}extractTagsRuleBased(s){let e=Object.values(s).join(" ").toLowerCase(),t={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:.4};return(e.includes("contract")||e.includes("contracting"))&&(e.includes("service")?t.product_interest.push("ai-contracting-services"):t.product_interest.push("ai-contracting-tech")),e.includes("compliance")&&t.product_interest.push("ai-compliance-tech"),(e.includes("m&a")||e.includes("due diligence")||e.includes("acquisition"))&&t.product_interest.push("ai-ma-tech"),e.includes("sigma")&&t.product_interest.push("sigma"),(e.includes("metric")||e.includes("%")||e.includes("roi")||e.includes("save"))&&t.meddicc_signals.push("metrics-identified"),(e.includes("budget")||e.includes("cfo")||e.includes("economic buyer"))&&t.meddicc_signals.push("economic-buyer-identified"),(e.includes("pain")||e.includes("challenge")||e.includes("problem")||e.includes("struggle"))&&t.meddicc_signals.push("pain-confirmed"),(e.includes("champion")||e.includes("advocate")||e.includes("sponsor"))&&t.meddicc_signals.push("champion-identified"),(e.includes("competitor")||e.includes("alternative")||e.includes("vs")||e.includes("compared to"))&&t.meddicc_signals.push("competition-mentioned"),(e.includes("next step")||e.includes("follow up")||e.includes("schedule"))&&(t.deal_health="progressing"),(e.includes("concern")||e.includes("objection")||e.includes("hesitant")||e.includes("risk"))&&(t.deal_health="at-risk"),e.includes("demo")||e.includes("show you")||e.includes("demonstration")?t.meeting_type="demo":e.includes("pricing")||e.includes("negotiat")||e.includes("contract terms")?t.meeting_type="negotiation":e.includes("quarterly")||e.includes("qbr")||e.includes("review")?t.meeting_type="qbr":(e.includes("implementation")||e.includes("onboard")||e.includes("rollout"))&&(t.meeting_type="implementation"),{success:!0,tags:t}}validateAndNormalizeTags(s){let e={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:s.confidence||.8};return Array.isArray(s.product_interest)&&(e.product_interest=s.product_interest.filter(t=>se.includes(t))),Array.isArray(s.meddicc_signals)&&(e.meddicc_signals=s.meddicc_signals.filter(t=>ie.includes(t))),ae.includes(s.deal_health)&&(e.deal_health=s.deal_health),re.includes(s.meeting_type)&&(e.meeting_type=s.meeting_type),Array.isArray(s.key_stakeholders)&&(e.key_stakeholders=s.key_stakeholders.slice(0,10)),e}getEmptyTags(){return{product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:0}}static formatTagsForFrontmatter(s){return{product_interest:s.product_interest.length>0?s.product_interest:null,meddicc_signals:s.meddicc_signals.length>0?s.meddicc_signals:null,deal_health:s.deal_health,meeting_type:s.meeting_type,key_stakeholders:s.key_stakeholders.length>0?s.key_stakeholders:null,tag_confidence:Math.round(s.confidence*100)}}static generateTagSummary(s){let e=[];return s.product_interest.length>0&&e.push(`**Products:** ${s.product_interest.join(", ")}`),s.meddicc_signals.length>0&&e.push(`**MEDDICC:** ${s.meddicc_signals.join(", ")}`),e.push(`**Deal Health:** ${s.deal_health}`),e.push(`**Meeting Type:** ${s.meeting_type}`),e.join(" | ")}};var z=["keigan.pesenti@eudia.com","michael.ayers@eudia.com","zach@eudia.com"],K=["omar@eudia.com","david@eudia.com","ashish@eudia.com","siddharth.saxena@eudia.com"],q={"mitchell.loquaci@eudia.com":{name:"Mitchell Loquaci",region:"US",role:"RVP Sales"},"stephen.mulholland@eudia.com":{name:"Stephen Mulholland",region:"EMEA",role:"VP Sales"},"riona.mchale@eudia.com":{name:"Riona McHale",region:"IRE_UK",role:"Head of Sales"}},ce=["nikhita.godiwala@eudia.com","jon.dedych@eudia.com","farah.haddad@eudia.com"],le={US:["asad.hussain@eudia.com","nathan.shine@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com"],EMEA:["greg.machale@eudia.com","tom.clancy@eudia.com","nicola.fratini@eudia.com","stephen.mulholland@eudia.com"],IRE_UK:["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com","riona.mchale@eudia.com"]},G={"mitchell.loquaci@eudia.com":["justin.hills@eudia.com","olivia@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com"],"stephen.mulholland@eudia.com":["tom.clancy@eudia.com","conor.molloy@eudia.com","nathan.shine@eudia.com","nicola.fratini@eudia.com"],"riona.mchale@eudia.com":["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com"]};function de(y){let s=y.toLowerCase().trim();return z.includes(s)?"admin":K.includes(s)?"exec":s in q?"sales_leader":ce.includes(s)?"cs":"bl"}function ue(y){let s=y.toLowerCase().trim();return q[s]?.region||null}function pe(y){return le[y]||[]}function me(y){let s=y.toLowerCase().trim();if(G[s])return G[s];let e=ue(s);return e?pe(e):[]}function I(y){let s=y.toLowerCase().trim();return z.includes(s)||K.includes(s)}var w={version:"2026-02",lastUpdated:"2026-02-03",businessLeads:{"alex.fox@eudia.com":{email:"alex.fox@eudia.com",name:"Alex Fox",accounts:[{id:"001Wj00000mCFsTIAW",name:"Arabic Computer Systems"},{id:"001Wj00000fFuFMIA0",name:"Bank of Ireland"},{id:"001Wj00000mCFsuIAG",name:"Corrigan & Corrigan Solicitors LLP"},{id:"001Wj00000mCFscIAG",name:"Department of Children, Disability and Equality"},{id:"001Wj00000mCFsNIAW",name:"Department of Climate, Energy and the Environment"},{id:"001Wj00000mCFsUIAW",name:"ESB NI/Electric Ireland"},{id:"001Wj00000TV1WzIAL",name:"OpenAi"},{id:"001Wj00000mCFrMIAW",name:"Sisk Group"}]},"ananth@eudia.com":{email:"ananth@eudia.com",name:"Ananth Cherukupally",accounts:[{id:"001Wj00000RjuhjIAB",name:"Citadel"},{id:"001Wj00000cejJzIAI",name:"CVC"},{id:"001Wj00000Y64qhIAB",name:"Emigrant Bank"},{id:"001Hp00003kIrIIIA0",name:"GE Healthcare"},{id:"001Hp00003kIrIJIA0",name:"GE Vernova"},{id:"001Wj00000Z6zhPIAR",name:"Liberty Mutual Insurance"},{id:"001Wj00000bWBlQIAW",name:"Pegasystems"},{id:"001Wj00000bzz9MIAQ",name:"Peregrine Hospitality"},{id:"001Hp00003ljCJ8IAM",name:"Petco"},{id:"001Hp00003kKXSIIA4",name:"Pure Storage"},{id:"001Wj00000lxbYRIAY",name:"Spark Brighter Thinking"},{id:"001Wj00000tOAoEIAW",name:"TA Associates"},{id:"001Wj00000bn8VSIAY",name:"Vista Equity Partners"}]},"asad.hussain@eudia.com":{email:"asad.hussain@eudia.com",name:"Asad Hussain",accounts:[{id:"001Hp00003kIrCyIAK",name:"Airbnb"},{id:"001Hp00003kIrEeIAK",name:"Amazon"},{id:"001Hp00003kIrCzIAK",name:"American Express"},{id:"001Wj00000TUdXwIAL",name:"Anthropic"},{id:"001Wj00000Y0g8ZIAR",name:"Asana"},{id:"001Wj00000c0wRAIAY",name:"Away"},{id:"001Wj00000WTMCRIA5",name:"BNY Mellon"},{id:"001Wj00000mosEXIAY",name:"Carta"},{id:"001Wj00000ah6dkIAA",name:"Charlesbank Capital Partners"},{id:"001Hp00003kIrE5IAK",name:"Coherent"},{id:"001Hp00003kIrGzIAK",name:"Deloitte"},{id:"001Hp00003kIrE6IAK",name:"DHL"},{id:"001Wj00000W8ZKlIAN",name:"Docusign"},{id:"001Hp00003kIrHNIA0",name:"Ecolab"},{id:"001Hp00003kIrI3IAK",name:"Fluor"},{id:"001Hp00003kIrIAIA0",name:"Fox"},{id:"001Hp00003kJ9oeIAC",name:"Fresh Del Monte"},{id:"001Hp00003kIrIKIA0",name:"Geico"},{id:"001Wj00000oqVXgIAM",name:"Goosehead Insurance"},{id:"001Wj00000tuXZbIAM",name:"Gopuff"},{id:"001Hp00003kIrItIAK",name:"HSBC"},{id:"001Hp00003kIrIyIAK",name:"Huntsman"},{id:"001Wj00000hdoLxIAI",name:"Insight Enterprises Inc."},{id:"001Hp00003kIrKCIA0",name:"Mass Mutual Life Insurance"},{id:"001Hp00003kIrKOIA0",name:"Microsoft"},{id:"001Wj00000lyDQkIAM",name:"MidOcean Partners"},{id:"001Hp00003kIrKTIA0",name:"Morgan Stanley"},{id:"001Wj00000kNp2XIAS",name:"Plusgrade"},{id:"001Hp00003kIrMKIA0",name:"ServiceNow"},{id:"001Hp00003kIrECIA0",name:"Southwest Airlines"},{id:"001Wj00000tuRNoIAM",name:"Virtusa"},{id:"001Hp00003kIrNwIAK",name:"W.W. Grainger"},{id:"001Wj00000bzz9NIAQ",name:"Wealth Partners Capital Group"},{id:"001Wj00000tuolfIAA",name:"Wynn Las Vegas"},{id:"001Wj00000uzs1fIAA",name:"Zero RFI"}]},"conor.molloy@eudia.com":{email:"conor.molloy@eudia.com",name:"Conor Molloy",accounts:[{id:"001Hp00003kIrQDIA0",name:"Accenture"},{id:"001Wj00000qLixnIAC",name:"Al Dahra Group Llc"},{id:"001Hp00003kIrEyIAK",name:"Aramark Ireland"},{id:"001Wj00000mCFrgIAG",name:"Aryza"},{id:"001Wj00000mCFrkIAG",name:"Coillte"},{id:"001Wj00000mCFsHIAW",name:"Consensys"},{id:"001Wj00000mCFr2IAG",name:"ICON Clinical Research"},{id:"001Wj00000Y64qdIAB",name:"ION"},{id:"001Wj00000mCFtMIAW",name:"Kellanova"},{id:"001Wj00000mCFrIIAW",name:"Orsted"},{id:"001Wj00000mI9NmIAK",name:"Sequoia Climate Fund"},{id:"001Wj00000mCFs0IAG",name:"Taoglas Limited"},{id:"001Wj00000mCFtPIAW",name:"Teamwork.com"},{id:"001Wj00000mIBpNIAW",name:"Transworld Business Advisors"},{id:"001Wj00000ZLVpTIAX",name:"Wellspring Philanthropic Fund"}]},"emer.flynn@eudia.com":{email:"emer.flynn@eudia.com",name:"Emer Flynn",accounts:[{id:"001Wj00000mCFr6IAG",name:"NTMA"}]},"greg.machale@eudia.com":{email:"greg.machale@eudia.com",name:"Greg MacHale",accounts:[{id:"001Hp00003kIrEFIA0",name:"Abbott Laboratories"},{id:"001Wj00000mCFqrIAG",name:"Biomarin International Limited"},{id:"001Wj00000Y6VMdIAN",name:"BNP Paribas"},{id:"001Hp00003kIrFdIAK",name:"Booking Holdings"},{id:"001Wj00000X4OqNIAV",name:"BT Group"},{id:"001Wj00000uZ5J7IAK",name:"Canada Life"},{id:"001Wj00000mCFt9IAG",name:"Cerberus European Servicing"},{id:"001Wj00000Y6VMkIAN",name:"Computershare"},{id:"001Wj00000uP5x8IAC",name:"Cornmarket Financial Services"},{id:"001Wj00000Y6VMMIA3",name:"Diageo"},{id:"001Wj00000prFOXIA2",name:"Doosan Bobcat"},{id:"001Wj00000mCFrmIAG",name:"eShopWorld"},{id:"001Wj00000fFuFYIA0",name:"Grant Thornton"},{id:"001Wj00000uZ4A9IAK",name:"Great West Lifec co"},{id:"001Wj00000uZtcTIAS",name:"Ineos"},{id:"001Wj00000tWwYpIAK",name:"Mail Metrics"},{id:"001Wj00000vwSUXIA2",name:"Mercor"},{id:"001Wj00000mCFtUIAW",name:"Mercury Engineering"},{id:"001Wj00000lPFP3IAO",name:"Nomura"},{id:"001Wj00000mCFr1IAG",name:"Permanent TSB plc"},{id:"001Wj00000Y6QfRIAV",name:"Pernod Ricard"},{id:"001Hp00003kIrLiIAK",name:"Quest Diagnostics"},{id:"001Wj00000mCFsFIAW",name:"Regeneron"},{id:"001Wj00000mCFsRIAW",name:"Ryanair"},{id:"001Hp00003kIrMjIAK",name:"State Street"},{id:"001Wj00000mCFsSIAW",name:"Uniphar PLC"}]},"julie.stefanich@eudia.com":{email:"julie.stefanich@eudia.com",name:"Julie Stefanich",accounts:[{id:"001Wj00000asSHBIA2",name:"Airbus"},{id:"001Hp00003kIrElIAK",name:"Ameriprise Financial"},{id:"001Hp00003kIrEvIAK",name:"Apple"},{id:"001Hp00003kJ9pXIAS",name:"Bayer"},{id:"001Hp00003kIrE3IAK",name:"Cargill"},{id:"001Hp00003kIrGDIA0",name:"Charles Schwab"},{id:"001Hp00003kIrE4IAK",name:"Chevron"},{id:"001Hp00003kIrGeIAK",name:"Corebridge Financial"},{id:"001Hp00003kIrE7IAK",name:"ECMS"},{id:"001Wj00000iRzqvIAC",name:"Florida Crystals Corporation"},{id:"001Hp00003kIrIPIA0",name:"Genworth Financial"},{id:"001Hp00003kIrIXIA0",name:"Goldman Sachs"},{id:"001Wj00000rceVpIAI",name:"Hikma"},{id:"001Hp00003kIrJVIA0",name:"KLA"},{id:"001Wj00000aLmheIAC",name:"Macmillan"},{id:"001Wj00000X6G8qIAF",name:"Mainsail Partners"},{id:"001Hp00003kIrKLIA0",name:"MetLife"},{id:"001Hp00003kIrDeIAK",name:"National Grid"},{id:"001Hp00003kIrKjIAK",name:"Nordstrom"},{id:"001Hp00003kIrDvIAK",name:"Oracle"},{id:"001Hp00003kIrLNIA0",name:"Petsmart"},{id:"001Hp00003kIrLZIA0",name:"Procter & Gamble"},{id:"001Hp00003lhsUYIAY",name:"Rio Tinto Group"},{id:"001Wj00000svQI3IAM",name:"Safelite"},{id:"001Wj00000fRtLmIAK",name:"State Farm"},{id:"001Wj00000bzz9TIAQ",name:"Tailored Brands"},{id:"001Hp00003kIrNBIA0",name:"The Wonderful Company"},{id:"001Hp00003kIrCrIAK",name:"TIAA"},{id:"001Hp00003kIrNHIA0",name:"T-Mobile"},{id:"001Hp00003kIrNVIA0",name:"Uber"},{id:"001Hp00003kIrOLIA0",name:"World Wide Technology"}]},"justin.hills@eudia.com":{email:"justin.hills@eudia.com",name:"Justin Hills",accounts:[{id:"001Hp00003kIrEOIA0",name:"AES"},{id:"001Wj00000Y6VM4IAN",name:"Ares Management Corporation"},{id:"001Wj00000XiEDyIAN",name:"Coinbase"},{id:"001Hp00003kIrDhIAK",name:"Comcast"},{id:"001Wj00000c9oCvIAI",name:"Cox Media Group"},{id:"001Wj00000Y0jPmIAJ",name:"Delinea"},{id:"001Wj00000iwKGQIA2",name:"Dominos"},{id:"001Hp00003kIrDaIAK",name:"Duracell"},{id:"001Hp00003kIrCnIAK",name:"Home Depot"},{id:"001Hp00003kIrDVIA0",name:"Intel"},{id:"001Hp00003kIrE9IAK",name:"IQVIA"},{id:"001Hp00003kIrJJIA0",name:"Johnson & Johnson"},{id:"001Wj00000gnrugIAA",name:"Kraken"},{id:"001Wj00000op4EWIAY",name:"McCormick & Co Inc"},{id:"001Wj00000ix7c2IAA",name:"Nouryon"},{id:"001Wj00000cpxt0IAA",name:"Novelis"},{id:"001Wj00000WYyKIIA1",name:"Ramp"},{id:"001Wj00000o5G0vIAE",name:"StockX"},{id:"001Wj00000YEMa8IAH",name:"Turing"},{id:"001Wj00000oqRycIAE",name:"Walgreens Boots Alliance"}]},"keigan.pesenti@eudia.com":{email:"keigan.pesenti@eudia.com",name:"Keigan Pesenti",accounts:[{id:"001Wj00000mCFt4IAG",name:"BNRG Renewables Ltd"},{id:"001Wj00000mCFtTIAW",name:"Coleman Legal"},{id:"001Wj00000pLPAyIAO",name:"Creed McStay"},{id:"001Hp00003lhyCxIAI",name:"Eudia Testing Account"},{id:"001Wj00000mCFsIIAW",name:"Fannin Limited"},{id:"001Wj00000mCFsJIAW",name:"Gas Networks Ireland"},{id:"001Wj00000mCFseIAG",name:"Hayes Solicitors LLP"},{id:"001Wj00000mCFtJIAW",name:"LinkedIn"},{id:"001Wj00000mCFspIAG",name:"Moy Park"},{id:"001Wj00000mCFt8IAG",name:"State Claims Agency"},{id:"001Wj00000mCFs3IAG",name:"Wayflyer"}]},"mike.masiello@eudia.com":{email:"mike.masiello@eudia.com",name:"Mike Masiello",accounts:[{id:"001Wj00000p1lCPIAY",name:"Army Applications Lab"},{id:"001Wj00000p1hYbIAI",name:"Army Corps of Engineers"},{id:"001Wj00000ZxEpDIAV",name:"Army Futures Command"},{id:"001Wj00000bWBlAIAW",name:"Defense Innovation Unit (DIU)"},{id:"001Hp00003kJuJ5IAK",name:"Gov - DOD"},{id:"001Hp00003lhcL9IAI",name:"GSA (General Services Administration)"},{id:"001Wj00000p1PVHIA2",name:"IFC"},{id:"001Wj00000VVJ31IAH",name:"NATO"},{id:"001Wj00000p1YbmIAE",name:"SOCOM"},{id:"001Wj00000p1jH3IAI",name:"State of Alaska"},{id:"001Wj00000hVa6VIAS",name:"State of Arizona"},{id:"001Wj00000p0PcEIAU",name:"State of California"},{id:"001Wj00000bWBkeIAG",name:"U.S. Air Force"},{id:"001Wj00000p1SRXIA2",name:"U.S. Marine Corps"},{id:"001Wj00000Rrm5OIAR",name:"UK Government"},{id:"001Hp00003lieJPIAY",name:"USDA"},{id:"001Wj00000p1SuZIAU",name:"Vulcan Special Ops"}]},"nathan.shine@eudia.com":{email:"nathan.shine@eudia.com",name:"Nathan Shine",accounts:[{id:"001Hp00003kIrEnIAK",name:"Amphenol"},{id:"001Wj00000mHDBoIAO",name:"Coimisiun na Mean"},{id:"001Wj00000mCFqtIAG",name:"CommScope Technologies"},{id:"001Hp00003kIrDMIA0",name:"Dropbox"},{id:"001Wj00000mCFquIAG",name:"Fexco"},{id:"001Wj00000mCFs5IAG",name:"Indeed"},{id:"001Hp00003kIrJOIA0",name:"Keurig Dr Pepper"},{id:"001Wj00000hkk0zIAA",name:"Kingspan"},{id:"001Wj00000mCFrsIAG",name:"Kitman Labs"},{id:"001Wj00000mCFsMIAW",name:"McDermott Creed & Martyn"},{id:"001Wj00000mCFsoIAG",name:"Mediolanum"},{id:"001Wj00000mCFrFIAW",name:"OKG Payments Services Limited"},{id:"001Wj00000ZDPUIIA5",name:"Perrigo Pharma"},{id:"001Wj00000mCFtSIAW",name:"Poe Kiely Hogan Lanigan"},{id:"001Wj00000mCFtHIAW",name:"StepStone Group"},{id:"001Wj00000c9oD6IAI",name:"Stripe"},{id:"001Wj00000SFiOvIAL",name:"TikTok"},{id:"001Wj00000ZDXTRIA5",name:"Tinder LLC"},{id:"001Wj00000bWBlEIAW",name:"Udemy"}]},"nicola.fratini@eudia.com":{email:"nicola.fratini@eudia.com",name:"Nicola Fratini",accounts:[{id:"001Wj00000mCFrGIAW",name:"AerCap"},{id:"001Wj00000thuKEIAY",name:"Aer Lingus"},{id:"001Wj00000sgXdBIAU",name:"Allianz Insurance"},{id:"001Wj00000mCFs7IAG",name:"Allied Irish Banks plc"},{id:"001Wj00000mCFrhIAG",name:"Avant Money"},{id:"001Wj00000mI7NaIAK",name:"Aviva Insurance"},{id:"001Wj00000uNUIBIA4",name:"Bank of China"},{id:"001Hp00003kJ9kNIAS",name:"Barclays"},{id:"001Wj00000ttPZBIA2",name:"Barings"},{id:"001Wj00000tWwXwIAK",name:"Cairn Homes"},{id:"001Wj00000Y6VLhIAN",name:"Citi"},{id:"001Wj00000tx2MQIAY",name:"CyberArk"},{id:"001Wj00000mCFsBIAW",name:"Datalex"},{id:"001Wj00000mCFrlIAG",name:"Davy"},{id:"001Wj00000w0uVVIAY",name:"Doceree"},{id:"001Wj00000uJwxoIAC",name:"Eir"},{id:"001Wj00000sg8GcIAI",name:"FARFETCH"},{id:"001Wj00000mIEAXIA4",name:"FNZ Group"},{id:"001Wj00000mCFt1IAG",name:"Goodbody Stockbrokers"},{id:"001Wj00000ZDXrdIAH",name:"Intercom"},{id:"001Wj00000ullPpIAI",name:"Jet2 Plc"},{id:"001Wj00000au3swIAA",name:"Lenovo"},{id:"001Hp00003kIrKmIAK",name:"Northern Trust Management Services"},{id:"001Wj00000u0eJpIAI",name:"Re-Turn"},{id:"001Wj00000sg2T0IAI",name:"SHEIN"},{id:"001Wj00000mCFs1IAG",name:"Twitter"},{id:"001Hp00003kIrDAIA0",name:"Verizon"},{id:"001Wj00000sgaj9IAA",name:"Volkswagon Group Ireland"},{id:"001Wj00000mIB6EIAW",name:"Zendesk"}]},"olivia@eudia.com":{email:"olivia@eudia.com",name:"Olivia Jung",accounts:[{id:"001Wj00000mCFrdIAG",name:"Airship Group Inc"},{id:"001Hp00003kIrFVIA0",name:"Best Buy"},{id:"001Hp00003kIrFkIAK",name:"Bristol-Myers Squibb"},{id:"001Hp00003kIrGKIA0",name:"CHS"},{id:"001Hp00003kIrDZIA0",name:"Ciena"},{id:"001Hp00003kIrGZIA0",name:"Consolidated Edison"},{id:"001Wj00000jK5HlIAK",name:"Crate & Barrel"},{id:"001Hp00003kJ9kwIAC",name:"CSL"},{id:"001Hp00003kIrGoIAK",name:"Cummins"},{id:"001Wj00000bzz9RIAQ",name:"Datadog"},{id:"001Wj00000aZvt9IAC",name:"Dolby"},{id:"001Wj00000hkk0jIAA",name:"Etsy"},{id:"001Hp00003kIrISIA0",name:"Gilead Sciences"},{id:"001Hp00003kIrE8IAK",name:"Graybar Electric"},{id:"001Wj00000dvgdbIAA",name:"HealthEquity"},{id:"001Hp00003kIrJ9IAK",name:"Intuit"},{id:"001Wj00000aLlyVIAS",name:"J.Crew"},{id:"001Hp00003kKKMcIAO",name:"JPmorganchase"},{id:"001Hp00003kIrDjIAK",name:"Marsh McLennan"},{id:"001Hp00003kIrD8IAK",name:"Medtronic"},{id:"001Hp00003kIrKKIA0",name:"Merck"},{id:"001Hp00003kJ9lGIAS",name:"Meta"},{id:"001Hp00003kIrKSIA0",name:"Mondelez International"},{id:"001Hp00003kIrLOIA0",name:"Pfizer"},{id:"001Wj00000iS9AJIA0",name:"TE Connectivity"},{id:"001Hp00003kIrDFIA0",name:"Thermo Fisher Scientific"},{id:"001Wj00000PjGDaIAN",name:"The Weir Group PLC"},{id:"001Hp00003kIrCwIAK",name:"Toshiba US"},{id:"001Wj00000kD7MAIA0",name:"Wellspan Health"},{id:"001Hp00003kIrOAIA0",name:"Western Digital"}]},"tom.clancy@eudia.com":{email:"tom.clancy@eudia.com",name:"Tom Clancy",accounts:[{id:"001Wj00000pB30VIAS",name:"AIR (Advanced Inhalation Rituals)"},{id:"001Wj00000qLRqWIAW",name:"ASML"},{id:"001Wj00000c9oCeIAI",name:"BLDG Management Co., Inc."},{id:"001Wj00000mCFszIAG",name:"Electricity Supply Board"},{id:"001Wj00000mCFrcIAG",name:"Glanbia"},{id:"001Wj00000pA6d7IAC",name:"Masdar Future Energy Company"},{id:"001Hp00003kIrD9IAK",name:"Salesforce"},{id:"001Wj00000qL7AGIA0",name:"Seismic"},{id:"001Wj00000pAPW2IAO",name:"Tarmac"},{id:"001Wj00000mCFtOIAW",name:"Uisce Eireann (Irish Water)"},{id:"001Wj00000pBibTIAS",name:"Version1"}]}}},T=class{constructor(s){this.cachedData=null;this.serverUrl=s}async getAccountsForUser(s){let e=s.toLowerCase().trim(),t=await this.fetchFromServer(e);return t&&t.length>0?(console.log(`[AccountOwnership] Got ${t.length} accounts from server for ${e}`),t):(console.log(`[AccountOwnership] Using static data fallback for ${e}`),this.getAccountsFromStatic(e))}getAccountsFromStatic(s){if(de(s)==="sales_leader"){let n=me(s);if(n.length===0)return console.log(`[AccountOwnership] No direct reports found for sales leader: ${s}`),[];let a=new Map;for(let r of n){let o=w.businessLeads[r];if(o)for(let c of o.accounts)a.has(c.id)||a.set(c.id,{...c,isOwned:!1})}let i=Array.from(a.values()).sort((r,o)=>r.name.localeCompare(o.name));return console.log(`[AccountOwnership] Found ${i.length} static accounts for sales leader ${s} (from ${n.length} direct reports)`),i}let t=w.businessLeads[s];return t?(console.log(`[AccountOwnership] Found ${t.accounts.length} static accounts for ${s}`),t.accounts):(console.log(`[AccountOwnership] No static mapping found for: ${s}`),[])}async fetchFromServer(s){try{let{requestUrl:e}=await import("obsidian"),t=await e({url:`${this.serverUrl}/api/accounts/ownership/${encodeURIComponent(s)}`,method:"GET",headers:{Accept:"application/json"}});return t.json?.success&&t.json?.accounts?t.json.accounts.map(n=>({id:n.id,name:n.name,type:n.type||"Prospect"})):null}catch(e){return console.log("[AccountOwnership] Server fetch failed, will use static data:",e),null}}async getNewAccounts(s,e){let t=await this.getAccountsForUser(s),n=e.map(a=>a.toLowerCase().trim());return t.filter(a=>{let i=a.name.toLowerCase().trim();return!n.some(r=>r===i||r.startsWith(i)||i.startsWith(r))})}hasUser(s){return s.toLowerCase().trim()in w.businessLeads}getAllBusinessLeads(){return Object.keys(w.businessLeads)}getBusinessLead(s){let e=s.toLowerCase().trim();return w.businessLeads[e]||null}getDataVersion(){return w.version}async getAllAccountsForAdmin(s){let e=s.toLowerCase().trim();if(!I(e))return console.log(`[AccountOwnership] ${e} is not an admin, returning owned accounts only`),this.getAccountsForUser(e);let t=await this.fetchAllAccountsFromServer();if(t&&t.length>0){let n=await this.getAccountsForUser(e),a=new Set(n.map(i=>i.id));return t.map(i=>({...i,isOwned:a.has(i.id)}))}return console.log("[AccountOwnership] Using static data fallback for admin all-accounts"),this.getAllAccountsFromStatic(e)}getAllAccountsFromStatic(s){let e=new Map,t=new Set,n=w.businessLeads[s];if(n)for(let a of n.accounts)t.add(a.id),e.set(a.id,{...a,isOwned:!0});for(let a of Object.values(w.businessLeads))for(let i of a.accounts)e.has(i.id)||e.set(i.id,{...i,isOwned:!1});return Array.from(e.values()).sort((a,i)=>a.name.localeCompare(i.name))}async fetchAllAccountsFromServer(){try{let{requestUrl:s}=await import("obsidian"),e=await s({url:`${this.serverUrl}/api/accounts/all`,method:"GET",headers:{Accept:"application/json"}});return e.json?.success&&e.json?.accounts?e.json.accounts.map(t=>({id:t.id,name:t.name,type:t.type||"Prospect"})):null}catch(s){return console.log("[AccountOwnership] Server fetch all accounts failed:",s),null}}};var V=[{value:"America/New_York",label:"Eastern Time (ET)"},{value:"America/Chicago",label:"Central Time (CT)"},{value:"America/Denver",label:"Mountain Time (MT)"},{value:"America/Los_Angeles",label:"Pacific Time (PT)"},{value:"Europe/London",label:"London (GMT/BST)"},{value:"Europe/Dublin",label:"Dublin (GMT/IST)"},{value:"Europe/Paris",label:"Central Europe (CET)"},{value:"Europe/Berlin",label:"Berlin (CET)"},{value:"UTC",label:"UTC"}],ge={serverUrl:"https://gtm-wizard.onrender.com",accountsFolder:"Accounts",recordingsFolder:"Recordings",syncOnStartup:!0,autoSyncAfterTranscription:!0,saveAudioFiles:!0,appendTranscript:!0,lastSyncTime:null,cachedAccounts:[],enableSmartTags:!0,showCalendarView:!0,userEmail:"",setupCompleted:!1,calendarConfigured:!1,salesforceConnected:!1,accountsImported:!1,importedAccountCount:0,timezone:"America/New_York",lastAccountRefreshDate:null,archiveRemovedAccounts:!0,syncAccountsOnStartup:!0};var x="eudia-calendar-view",E="eudia-setup-view",L=class extends d.EditorSuggest{constructor(s,e){super(s),this.plugin=e}onTrigger(s,e,t){let n=e.getLine(s.line),a=e.getValue(),i=e.posToOffset(s),r=a.indexOf("---"),o=a.indexOf("---",r+3);if(r===-1||i<r||i>o)return null;let c=n.match(/^account:\s*(.*)$/);if(!c)return null;let l=c[1].trim(),u=n.indexOf(":")+1,p=n.substring(u).match(/^\s*/)?.[0].length||0;return{start:{line:s.line,ch:u+p},end:s,query:l}}getSuggestions(s){let e=s.query.toLowerCase(),t=this.plugin.settings.cachedAccounts;return e?t.filter(n=>n.name.toLowerCase().includes(e)).sort((n,a)=>{let i=n.name.toLowerCase().startsWith(e),r=a.name.toLowerCase().startsWith(e);return i&&!r?-1:r&&!i?1:n.name.localeCompare(a.name)}).slice(0,10):t.slice(0,10)}renderSuggestion(s,e){e.createEl("div",{text:s.name,cls:"suggestion-title"})}selectSuggestion(s,e){this.context&&this.context.editor.replaceRange(s.name,this.context.start,this.context.end)}},j=class{constructor(s,e,t,n){this.containerEl=null;this.waveformBars=[];this.durationEl=null;this.waveformData=new Array(16).fill(0);this.onPause=s,this.onResume=e,this.onStop=t,this.onCancel=n}show(){if(this.containerEl)return;this.containerEl=document.createElement("div"),this.containerEl.className="eudia-transcription-bar active";let s=document.createElement("div");s.className="eudia-recording-dot",this.containerEl.appendChild(s);let e=document.createElement("div");e.className="eudia-waveform",this.waveformBars=[];for(let i=0;i<16;i++){let r=document.createElement("div");r.className="eudia-waveform-bar",r.style.height="2px",e.appendChild(r),this.waveformBars.push(r)}this.containerEl.appendChild(e),this.durationEl=document.createElement("div"),this.durationEl.className="eudia-duration",this.durationEl.textContent="0:00",this.containerEl.appendChild(this.durationEl);let t=document.createElement("div");t.className="eudia-controls-minimal";let n=document.createElement("button");n.className="eudia-control-btn stop",n.innerHTML='<span class="eudia-stop-icon"></span>',n.title="Stop and summarize",n.onclick=()=>this.onStop(),t.appendChild(n);let a=document.createElement("button");a.className="eudia-control-btn cancel",a.textContent="Cancel",a.onclick=()=>this.onCancel(),t.appendChild(a),this.containerEl.appendChild(t),document.body.appendChild(this.containerEl)}hide(){this.containerEl&&(this.containerEl.remove(),this.containerEl=null,this.waveformBars=[],this.durationEl=null)}updateState(s){if(this.containerEl){if(this.waveformData.shift(),this.waveformData.push(s.audioLevel),this.waveformBars.forEach((e,t)=>{let n=this.waveformData[t]||0,a=Math.max(2,Math.min(24,n*.24));e.style.height=`${a}px`}),this.durationEl){let e=Math.floor(s.duration/60),t=Math.floor(s.duration%60);this.durationEl.textContent=`${e}:${t.toString().padStart(2,"0")}`}this.containerEl.className=s.isPaused?"eudia-transcription-bar paused":"eudia-transcription-bar active"}}showProcessing(){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar processing";let s=document.createElement("div");s.className="eudia-processing-spinner",this.containerEl.appendChild(s);let e=document.createElement("div");e.className="eudia-processing-text",e.textContent="Processing...",this.containerEl.appendChild(e)}showComplete(s){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar complete";let e=document.createElement("div");e.className="eudia-complete-checkmark",this.containerEl.appendChild(e);let t=document.createElement("div");if(t.className="eudia-complete-content",s.summaryPreview){let o=document.createElement("div");o.className="eudia-summary-preview",o.textContent=s.summaryPreview.length>80?s.summaryPreview.substring(0,80)+"...":s.summaryPreview,t.appendChild(o)}let n=document.createElement("div");n.className="eudia-complete-stats-row";let a=Math.floor(s.duration/60),i=Math.floor(s.duration%60);n.textContent=`${a}:${i.toString().padStart(2,"0")} recorded`,s.nextStepsCount>0&&(n.textContent+=` | ${s.nextStepsCount} action${s.nextStepsCount>1?"s":""}`),s.meddiccCount>0&&(n.textContent+=` | ${s.meddiccCount} signals`),t.appendChild(n),this.containerEl.appendChild(t);let r=document.createElement("button");r.className="eudia-control-btn close",r.textContent="Dismiss",r.onclick=()=>this.hide(),this.containerEl.appendChild(r),setTimeout(()=>this.hide(),8e3)}};var O=class extends d.Modal{constructor(s,e,t){super(s),this.plugin=e,this.onSelect=t}onOpen(){let{contentEl:s}=this;s.empty(),s.addClass("eudia-account-selector"),s.createEl("h3",{text:"Select Account for Meeting Note"}),this.searchInput=s.createEl("input",{type:"text",placeholder:"Search accounts..."}),this.searchInput.style.cssText="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);",this.resultsContainer=s.createDiv({cls:"eudia-account-results"}),this.resultsContainer.style.cssText="max-height: 300px; overflow-y: auto;",this.updateResults(""),this.searchInput.addEventListener("input",()=>this.updateResults(this.searchInput.value)),this.searchInput.focus()}updateResults(s){this.resultsContainer.empty();let e=this.plugin.settings.cachedAccounts,t=s?e.filter(n=>n.name.toLowerCase().includes(s.toLowerCase())).slice(0,15):e.slice(0,15);if(t.length===0){this.resultsContainer.createDiv({cls:"eudia-no-results",text:"No accounts found"});return}t.forEach(n=>{let a=this.resultsContainer.createDiv({cls:"eudia-account-item",text:n.name});a.onclick=()=>{this.onSelect(n),this.close()}})}onClose(){this.contentEl.empty()}},M=class extends d.Modal{constructor(e,t,n){super(e);this.accountContext=null;this.plugin=t,this.accountContext=n||null}onOpen(){let{contentEl:e}=this;e.empty(),e.addClass("eudia-intelligence-modal");let t=e.createDiv({cls:"eudia-intelligence-header"});t.createEl("h2",{text:this.accountContext?`Ask about ${this.accountContext.name}`:"Ask gtm-brain"}),this.accountContext?t.createEl("p",{text:"Get insights, prep for meetings, or ask about this account.",cls:"eudia-intelligence-subtitle"}):t.createEl("p",{text:"Ask questions about your accounts, deals, or pipeline.",cls:"eudia-intelligence-subtitle"});let n=e.createDiv({cls:"eudia-intelligence-input-container"});this.queryInput=n.createEl("textarea",{placeholder:this.accountContext?`e.g., "What should I know before my next meeting?" or "What's the deal status?"`:`e.g., "Who owns Dolby?" or "What's my late stage pipeline?"`}),this.queryInput.addClass("eudia-intelligence-input"),this.queryInput.rows=3;let i=e.createDiv({cls:"eudia-intelligence-actions"}).createEl("button",{text:"Ask",cls:"eudia-btn-primary"});i.onclick=()=>this.submitQuery(),this.queryInput.onkeydown=c=>{c.key==="Enter"&&!c.shiftKey&&(c.preventDefault(),this.submitQuery())},this.responseContainer=e.createDiv({cls:"eudia-intelligence-response"}),this.responseContainer.style.display="none";let r=e.createDiv({cls:"eudia-intelligence-suggestions"});r.createEl("p",{text:"Suggested:",cls:"eudia-suggestions-label"});let o;if(this.accountContext)o=["What should I know before my next meeting?","Summarize our relationship and deal status","What are the key pain points?"];else{let l=(this.plugin.settings.cachedAccounts||[]).slice(0,3).map(u=>u.name);l.length>=2?o=[`What should I know about ${l[0]} before my next meeting?`,`What's the account history with ${l[1]}?`,"What's my late-stage pipeline?"]:o=["What should I know before my next meeting?","What accounts need attention this week?","What is my late-stage pipeline?"]}o.forEach(c=>{let l=r.createEl("button",{text:c,cls:"eudia-suggestion-btn"});l.onclick=()=>{this.queryInput.value=c,this.submitQuery()}}),setTimeout(()=>this.queryInput.focus(),100)}async submitQuery(){let e=this.queryInput.value.trim();if(!e)return;this.responseContainer.style.display="block";let t=this.accountContext?.name?` about ${this.accountContext.name}`:"";this.responseContainer.innerHTML=`<div class="eudia-intelligence-loading">Gathering intelligence${t}...</div>`;try{let n=await(0,d.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/intelligence/query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:e,accountId:this.accountContext?.id,accountName:this.accountContext?.name,userEmail:this.plugin.settings.userEmail}),throw:!1,contentType:"application/json"});if(n.status>=400){let a=n.json?.error||`Server error (${n.status}). Please try again.`;this.responseContainer.innerHTML=`<div class="eudia-intelligence-error">${a}</div>`;return}if(n.json?.success){this.responseContainer.innerHTML="";let a=this.responseContainer.createDiv({cls:"eudia-intelligence-answer"});if(a.innerHTML=this.formatResponse(n.json.answer),n.json.context){let i=n.json.context,r=this.responseContainer.createDiv({cls:"eudia-intelligence-context-info"}),o=[];i.accountName&&o.push(i.accountName),i.opportunityCount>0&&o.push(`${i.opportunityCount} opps`),i.hasNotes&&o.push("notes"),i.hasCustomerBrain&&o.push("history");let c=i.dataFreshness==="cached"?" (cached)":"";r.setText(`Based on: ${o.join(" \u2022 ")}${c}`)}n.json.performance}else{let a=n.json?.error||"Could not get an answer. Try rephrasing your question.";this.responseContainer.innerHTML=`<div class="eudia-intelligence-error">${a}</div>`}}catch(n){console.error("[GTM Brain] Intelligence query error:",n);let a="Unable to connect. Please check your internet connection and try again.";n?.message?.includes("timeout")?a="Request timed out. The server may be busy - please try again.":(n?.message?.includes("network")||n?.message?.includes("fetch"))&&(a="Network error. Please check your connection and try again."),this.responseContainer.innerHTML=`<div class="eudia-intelligence-error">${a}</div>`}}formatResponse(e){return e.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu,"").replace(/^#{2,3}\s+(.+)$/gm,'<h3 class="eudia-intel-header">$1</h3>').replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/^[•\-]\s+(.+)$/gm,"<li>$1</li>").replace(/^-\s+\[\s*\]\s+(.+)$/gm,'<li class="eudia-intel-todo">$1</li>').replace(/^-\s+\[x\]\s+(.+)$/gm,'<li class="eudia-intel-done">$1</li>').replace(/(<li[^>]*>.*?<\/li>\s*)+/g,'<ul class="eudia-intel-list">$&</ul>').replace(/\n{2,}/g,`
`).replace(/\n/g,"<br>")}onClose(){this.contentEl.empty()}};var W=class extends d.ItemView{constructor(e,t){super(e);this.emailInput=null;this.pollInterval=null;this.plugin=t,this.accountOwnershipService=new T(t.settings.serverUrl),this.steps=[{id:"calendar",title:"Connect Your Calendar",description:"View your meetings and create notes with one click",status:"pending"},{id:"salesforce",title:"Connect to Salesforce",description:"Sync notes and access your accounts",status:"pending"},{id:"transcribe",title:"Ready to Transcribe",description:"Record and summarize meetings automatically",status:"pending"}]}getViewType(){return E}getDisplayText(){return"Setup"}getIcon(){return"settings"}async onOpen(){await this.checkExistingStatus(),await this.render()}async onClose(){this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null)}async checkExistingStatus(){if(this.plugin.settings.userEmail){this.steps[0].status="complete";try{(await(0,d.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0&&(this.steps[1].status="complete",this.plugin.settings.salesforceConnected=!0)}catch{}this.plugin.settings.accountsImported&&(this.steps[2].status="complete")}}getCompletionPercentage(){let e=this.steps.filter(t=>t.status==="complete").length;return Math.round(e/this.steps.length*100)}async render(){let e=this.containerEl.children[1];e.empty(),e.addClass("eudia-setup-view"),this.renderHeader(e),this.renderSteps(e),this.renderFooter(e)}renderHeader(e){let t=e.createDiv({cls:"eudia-setup-header"}),n=t.createDiv({cls:"eudia-setup-title-section"});n.createEl("h1",{text:"Welcome to Eudia Sales Vault",cls:"eudia-setup-main-title"}),n.createEl("p",{text:"Complete these steps to unlock your sales superpowers",cls:"eudia-setup-subtitle"});let a=t.createDiv({cls:"eudia-setup-progress-section"}),i=this.getCompletionPercentage(),r=a.createDiv({cls:"eudia-setup-progress-label"});r.createSpan({text:"Setup Progress"}),r.createSpan({text:`${i}%`,cls:"eudia-setup-progress-value"});let c=a.createDiv({cls:"eudia-setup-progress-bar"}).createDiv({cls:"eudia-setup-progress-fill"});c.style.width=`${i}%`}renderSteps(e){let t=e.createDiv({cls:"eudia-setup-steps-container"});this.renderCalendarStep(t),this.renderSalesforceStep(t),this.renderTranscribeStep(t)}renderCalendarStep(e){let t=this.steps[0],n=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),a=n.createDiv({cls:"eudia-setup-step-header"}),i=a.createDiv({cls:"eudia-setup-step-number"});i.setText(t.status==="complete"?"":"1"),t.status==="complete"&&i.addClass("eudia-step-complete");let r=a.createDiv({cls:"eudia-setup-step-info"});r.createEl("h3",{text:t.title}),r.createEl("p",{text:t.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(t.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:`Connected as ${this.plugin.settings.userEmail}`});else{let c=o.createDiv({cls:"eudia-setup-input-group"});this.emailInput=c.createEl("input",{type:"email",placeholder:"yourname@eudia.com",cls:"eudia-setup-input"}),this.plugin.settings.userEmail&&(this.emailInput.value=this.plugin.settings.userEmail);let l=c.createEl("button",{text:"Connect",cls:"eudia-setup-btn primary"});l.onclick=async()=>{await this.handleCalendarConnect()},this.emailInput.onkeydown=async u=>{u.key==="Enter"&&await this.handleCalendarConnect()},o.createDiv({cls:"eudia-setup-validation-message"}),o.createEl("p",{cls:"eudia-setup-help-text",text:"Your calendar syncs automatically via Microsoft 365. We use your email to identify your meetings."})}}async handleCalendarConnect(){if(!this.emailInput)return;let e=this.emailInput.value.trim().toLowerCase(),t=this.containerEl.querySelector(".eudia-setup-validation-message");if(!e){t&&(t.textContent="Please enter your email",t.className="eudia-setup-validation-message error");return}if(!e.endsWith("@eudia.com")){t&&(t.textContent="Please use your @eudia.com email address",t.className="eudia-setup-validation-message error");return}t&&(t.textContent="Validating...",t.className="eudia-setup-validation-message loading");try{let n=await(0,d.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${encodeURIComponent(e)}`,method:"GET",throw:!1});if(n.status===200&&n.json?.authorized){this.plugin.settings.userEmail=e,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),this.steps[0].status="complete",new d.Notice("Calendar connected successfully!"),t&&(t.textContent="Importing your accounts...",t.className="eudia-setup-validation-message loading");try{let a;I(e)?(console.log("[Eudia] Admin user detected - importing all accounts"),a=await this.accountOwnershipService.getAllAccountsForAdmin(e)):a=await this.accountOwnershipService.getAccountsForUser(e),a.length>0&&(I(e)?await this.plugin.createAdminAccountFolders(a):await this.plugin.createTailoredAccountFolders(a),this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=a.length,await this.plugin.saveSettings(),new d.Notice(`Imported ${a.length} account folders!`))}catch(a){console.error("[Eudia] Account import failed:",a)}await this.render()}else t&&(t.innerHTML=`<strong>${e}</strong> is not authorized for calendar access. Contact your admin.`,t.className="eudia-setup-validation-message error")}catch{t&&(t.textContent="Connection failed. Please try again.",t.className="eudia-setup-validation-message error")}}renderSalesforceStep(e){let t=this.steps[1],n=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),a=n.createDiv({cls:"eudia-setup-step-header"}),i=a.createDiv({cls:"eudia-setup-step-number"});i.setText(t.status==="complete"?"":"2"),t.status==="complete"&&i.addClass("eudia-step-complete");let r=a.createDiv({cls:"eudia-setup-step-info"});r.createEl("h3",{text:t.title}),r.createEl("p",{text:t.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(!this.plugin.settings.userEmail){o.createDiv({cls:"eudia-setup-disabled-message",text:"Complete the calendar step first"});return}if(t.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:"Salesforce connected successfully"}),this.plugin.settings.accountsImported&&o.createDiv({cls:"eudia-setup-account-status",text:`${this.plugin.settings.importedAccountCount} accounts imported`});else{let l=o.createDiv({cls:"eudia-setup-button-group"}).createEl("button",{text:"Connect to Salesforce",cls:"eudia-setup-btn primary"}),u=o.createDiv({cls:"eudia-setup-sf-status"});l.onclick=async()=>{let p=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(p,"_blank"),u.textContent="Complete the login in the popup window...",u.className="eudia-setup-sf-status loading",new d.Notice("Complete the Salesforce login in the popup window",5e3),this.startSalesforcePolling(u)},o.createEl("p",{cls:"eudia-setup-help-text",text:"This links your Obsidian notes to your Salesforce account for automatic sync."})}}startSalesforcePolling(e){this.pollInterval&&window.clearInterval(this.pollInterval);let t=0,n=60;this.pollInterval=window.setInterval(async()=>{t++;try{(await(0,d.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),this.steps[1].status="complete",new d.Notice("Salesforce connected successfully!"),await this.importTailoredAccounts(e),await this.render()):t>=n&&(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),e.textContent="Connection timed out. Please try again.",e.className="eudia-setup-sf-status error")}catch{}},5e3)}async importTailoredAccounts(e){e.textContent="Importing your accounts...",e.className="eudia-setup-sf-status loading";try{let t=this.plugin.settings.userEmail,n;if(I(t)?(console.log("[Eudia] Admin user detected - importing all accounts"),e.textContent="Admin detected - importing all accounts...",n=await this.accountOwnershipService.getAllAccountsForAdmin(t)):n=await this.accountOwnershipService.getAccountsForUser(t),n.length===0){e.textContent="No accounts found for your email. Contact your admin.",e.className="eudia-setup-sf-status warning";return}I(t)?await this.plugin.createAdminAccountFolders(n):await this.plugin.createTailoredAccountFolders(n),this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=n.length,await this.plugin.saveSettings(),this.steps[2].status="complete";let a=n.filter(r=>r.isOwned!==!1).length,i=n.filter(r=>r.isOwned===!1).length;I(t)&&i>0?e.textContent=`${a} owned + ${i} view-only accounts imported!`:e.textContent=`${n.length} accounts imported successfully!`,e.className="eudia-setup-sf-status success"}catch{e.textContent="Failed to import accounts. Please try again.",e.className="eudia-setup-sf-status error"}}renderTranscribeStep(e){let t=this.steps[2],n=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),a=n.createDiv({cls:"eudia-setup-step-header"}),i=a.createDiv({cls:"eudia-setup-step-number"});i.setText(t.status==="complete"?"":"3"),t.status==="complete"&&i.addClass("eudia-step-complete");let r=a.createDiv({cls:"eudia-setup-step-info"});r.createEl("h3",{text:t.title}),r.createEl("p",{text:t.description});let o=n.createDiv({cls:"eudia-setup-step-content"}),c=o.createDiv({cls:"eudia-setup-instructions"}),l=c.createDiv({cls:"eudia-setup-instruction"});l.createSpan({cls:"eudia-setup-instruction-icon",text:"\u{1F399}"}),l.createSpan({text:"Click the microphone icon in the left sidebar during a call"});let u=c.createDiv({cls:"eudia-setup-instruction"});u.createSpan({cls:"eudia-setup-instruction-icon",text:"\u2328"}),u.createSpan({text:'Or press Cmd/Ctrl+P and search for "Transcribe Meeting"'});let p=c.createDiv({cls:"eudia-setup-instruction"});p.createSpan({cls:"eudia-setup-instruction-icon",text:"\u{1F4DD}"}),p.createSpan({text:"AI will summarize and extract key insights automatically"}),t.status!=="complete"&&o.createEl("p",{cls:"eudia-setup-help-text muted",text:"This step completes automatically after connecting to Salesforce and importing accounts."})}renderFooter(e){let t=e.createDiv({cls:"eudia-setup-footer"});if(this.steps.every(i=>i.status==="complete")){let i=t.createDiv({cls:"eudia-setup-completion"});i.createEl("h2",{text:"\u{1F389} You're all set!"}),i.createEl("p",{text:"Your sales vault is ready. Click below to start using Eudia."});let r=t.createEl("button",{text:"Open Calendar \u2192",cls:"eudia-setup-btn primary large"});r.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(E),await this.plugin.activateCalendarView()}}else{let i=t.createEl("button",{text:"Skip Setup (I'll do this later)",cls:"eudia-setup-btn secondary"});i.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(E),new d.Notice("You can complete setup anytime from Settings \u2192 Eudia Sync")}}let a=t.createEl("a",{text:"Advanced Settings",cls:"eudia-setup-settings-link"});a.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")}}},_=class extends d.ItemView{constructor(e,t){super(e);this.refreshInterval=null;this.lastError=null;this.plugin=t}getViewType(){return x}getDisplayText(){return"Calendar"}getIcon(){return"calendar"}async onOpen(){await this.render(),this.refreshInterval=window.setInterval(()=>this.render(),5*60*1e3)}async onClose(){this.refreshInterval&&window.clearInterval(this.refreshInterval)}async render(){let e=this.containerEl.children[1];if(e.empty(),e.addClass("eudia-calendar-view"),!this.plugin.settings.userEmail){this.renderSetupPanel(e);return}this.renderHeader(e),await this.renderCalendarContent(e)}renderHeader(e){let t=e.createDiv({cls:"eudia-calendar-header"}),n=t.createDiv({cls:"eudia-calendar-title-row"});n.createEl("h4",{text:"Your Meetings"});let a=n.createDiv({cls:"eudia-calendar-actions"}),i=a.createEl("button",{cls:"eudia-btn-icon",text:"\u21BB"});i.title="Refresh (fetches latest from calendar)",i.onclick=async()=>{i.addClass("spinning"),this._forceRefresh=!0,await this.render(),i.removeClass("spinning")};let r=a.createEl("button",{cls:"eudia-btn-icon",text:"\u2699"});r.title="Settings",r.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")};let o=t.createDiv({cls:"eudia-status-bar"});this.renderConnectionStatus(o)}async renderConnectionStatus(e){let t={server:"connecting",calendar:"not_configured",salesforce:"not_configured"},n=this.plugin.settings.serverUrl,a=this.plugin.settings.userEmail;try{(await(0,d.requestUrl)({url:`${n}/api/health`,method:"GET",throw:!1})).status===200?(t.server="connected",t.serverMessage="Server online"):(t.server="error",t.serverMessage="Server unavailable")}catch{t.server="error",t.serverMessage="Cannot reach server"}if(a&&t.server==="connected")try{let u=await(0,d.requestUrl)({url:`${n}/api/calendar/validate/${encodeURIComponent(a)}`,method:"GET",throw:!1});u.status===200&&u.json?.authorized?(t.calendar="connected",t.calendarMessage="Calendar synced"):(t.calendar="not_authorized",t.calendarMessage="Not authorized")}catch{t.calendar="error",t.calendarMessage="Error checking access"}if(a&&t.server==="connected")try{let u=await(0,d.requestUrl)({url:`${n}/api/sf/auth/status?email=${encodeURIComponent(a)}`,method:"GET",throw:!1});u.status===200&&u.json?.connected?(t.salesforce="connected",t.salesforceMessage="Salesforce connected"):(t.salesforce="not_configured",t.salesforceMessage="Not connected")}catch{t.salesforce="not_configured"}let i=e.createDiv({cls:"eudia-status-indicators"}),r=i.createSpan({cls:`eudia-status-dot ${t.server}`});r.title=t.serverMessage||"Server";let o=i.createSpan({cls:`eudia-status-dot ${t.calendar}`});o.title=t.calendarMessage||"Calendar";let c=i.createSpan({cls:`eudia-status-dot ${t.salesforce}`});if(c.title=t.salesforceMessage||"Salesforce",e.createDiv({cls:"eudia-status-labels"}).createSpan({cls:"eudia-status-label",text:this.plugin.settings.userEmail}),t.calendar==="not_authorized"){let u=e.createDiv({cls:"eudia-status-warning"});u.innerHTML=`<strong>${a}</strong> is not authorized for calendar access. Contact your admin.`}}async renderCalendarContent(e){let t=e.createDiv({cls:"eudia-calendar-content"}),n=t.createDiv({cls:"eudia-calendar-loading"});n.innerHTML='<div class="eudia-spinner"></div><span>Loading meetings...</span>';try{let a=new b(this.plugin.settings.serverUrl,this.plugin.settings.userEmail,this.plugin.settings.timezone||"America/New_York"),i=this._forceRefresh||!1;this._forceRefresh=!1;let r=await a.getWeekMeetings(i);if(n.remove(),!r.success){this.renderError(t,r.error||"Failed to load calendar");return}let o=Object.keys(r.byDay||{}).sort();if(o.length===0){this.renderEmptyState(t);return}await this.renderCurrentMeeting(t,a);for(let c of o){let l=r.byDay[c];!l||l.length===0||this.renderDaySection(t,c,l)}}catch(a){n.remove(),this.renderError(t,a.message||"Failed to load calendar")}}async renderCurrentMeeting(e,t){try{let n=await t.getCurrentMeeting();if(n.meeting){let a=e.createDiv({cls:"eudia-now-card"});n.isNow?a.createDiv({cls:"eudia-now-badge",text:"\u25CF NOW"}):a.createDiv({cls:"eudia-now-badge soon",text:`In ${n.minutesUntilStart}m`});let i=a.createDiv({cls:"eudia-now-content"});i.createEl("div",{cls:"eudia-now-subject",text:n.meeting.subject}),n.meeting.accountName&&i.createEl("div",{cls:"eudia-now-account",text:n.meeting.accountName});let r=a.createEl("button",{cls:"eudia-now-action",text:"Create Note"});r.onclick=()=>this.createNoteForMeeting(n.meeting)}}catch{}}renderDaySection(e,t,n){let a=e.createDiv({cls:"eudia-calendar-day"});a.createEl("div",{cls:"eudia-calendar-day-header",text:b.getDayName(t)});for(let i of n){let r=a.createDiv({cls:`eudia-calendar-meeting ${i.isCustomerMeeting?"customer":"internal"}`});r.createEl("div",{cls:"eudia-calendar-time",text:b.formatTime(i.start,this.plugin.settings.timezone)});let o=r.createDiv({cls:"eudia-calendar-details"});if(o.createEl("div",{cls:"eudia-calendar-subject",text:i.subject}),i.accountName)o.createEl("div",{cls:"eudia-calendar-account",text:i.accountName});else if(i.attendees&&i.attendees.length>0){let c=i.attendees.slice(0,2).map(l=>l.name||l.email?.split("@")[0]||"Unknown").join(", ");o.createEl("div",{cls:"eudia-calendar-attendees",text:c})}r.onclick=()=>this.createNoteForMeeting(i),r.title="Click to create meeting note"}}renderEmptyState(e){let t=e.createDiv({cls:"eudia-calendar-empty"});t.innerHTML=`
      <div class="eudia-empty-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <p class="eudia-empty-title">No meetings this week</p>
      <p class="eudia-empty-subtitle">Enjoy your focus time!</p>
    `}renderError(e,t){let n=e.createDiv({cls:"eudia-calendar-error"}),a="",i="Unable to load calendar",r="";t.includes("not authorized")||t.includes("403")?(a="\u{1F512}",i="Calendar Access Required",r="Contact your admin to be added to the authorized users list."):t.includes("network")||t.includes("fetch")?(a="\u{1F4E1}",i="Connection Issue",r="Check your internet connection and try again."):(t.includes("server")||t.includes("500"))&&(a="\u{1F527}",i="Server Unavailable",r="The server may be waking up. Try again in 30 seconds."),n.innerHTML=`
      <div class="eudia-error-icon">${a}</div>
      <p class="eudia-error-title">${i}</p>
      <p class="eudia-error-message">${t}</p>
      ${r?`<p class="eudia-error-action">${r}</p>`:""}
    `;let o=n.createEl("button",{cls:"eudia-btn-retry",text:"Try Again"});o.onclick=()=>this.render()}renderSetupPanel(e){let t=e.createDiv({cls:"eudia-calendar-setup-panel"});t.innerHTML=`
      <div class="eudia-setup-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <h3 class="eudia-setup-title">Connect Your Calendar</h3>
      <p class="eudia-setup-desc">Enter your Eudia email to see your meetings and create notes with one click.</p>
    `;let n=t.createDiv({cls:"eudia-setup-input-group"}),a=n.createEl("input",{type:"email",placeholder:"yourname@eudia.com"});a.addClass("eudia-setup-email");let i=n.createEl("button",{cls:"eudia-setup-connect",text:"Connect"}),r=t.createDiv({cls:"eudia-setup-status"});i.onclick=async()=>{let o=a.value.trim().toLowerCase();if(!o||!o.endsWith("@eudia.com")){r.textContent="Please use your @eudia.com email",r.className="eudia-setup-status error";return}i.disabled=!0,i.textContent="Connecting...",r.textContent="";try{if(!(await(0,d.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${o}`,method:"GET"})).json?.authorized){r.innerHTML=`<strong>${o}</strong> is not authorized. Contact your admin to be added.`,r.className="eudia-setup-status error",i.disabled=!1,i.textContent="Connect";return}this.plugin.settings.userEmail=o,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),r.textContent="Connected",r.className="eudia-setup-status success",this.plugin.scanLocalAccountFolders().catch(()=>{}),setTimeout(()=>this.render(),500)}catch(c){let l=c.message||"Connection failed";l.includes("403")?r.innerHTML=`<strong>${o}</strong> is not authorized for calendar access.`:r.textContent=l,r.className="eudia-setup-status error",i.disabled=!1,i.textContent="Connect"}},a.onkeydown=o=>{o.key==="Enter"&&i.click()},t.createEl("p",{cls:"eudia-setup-help",text:"Your calendar syncs automatically via Microsoft 365."})}extractCompanyFromDomain(e){let t=e.toLowerCase().split("."),n=["mail","email","app","portal","crm","www","smtp","sales","support","login","sso","auth","api","my"],a=["com","org","net","io","co","ai","gov","edu","uk","us","de","fr","jp","au","ca"],i=t.filter(o=>!a.includes(o)&&o.length>1);if(i.length===0)return t[0]||"";if(i.length>1&&n.includes(i[0]))return i[1].charAt(0).toUpperCase()+i[1].slice(1);let r=i[i.length-1];return r.charAt(0).toUpperCase()+r.slice(1)}getExternalDomainsFromAttendees(e){if(!e||e.length===0)return[];let t=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com","live.com","msn.com","aol.com","protonmail.com","googlemail.com","mail.com","zoho.com","ymail.com"],n=new Set,a=[];for(let i of e){if(!i.email)continue;let o=i.email.toLowerCase().match(/@([a-z0-9.-]+)/);if(o){let c=o[1];if(c.includes("eudia.com")||t.includes(c)||n.has(c))continue;n.add(c);let l=this.extractCompanyFromDomain(c);l.length>=2&&a.push({domain:c,company:l})}}return a}findBestAccountMatch(e,t,n){let a=this.plugin.settings.accountsFolder||"Accounts",i=this.app.vault.getAbstractFileByPath(a);if(!(i instanceof d.TFolder))return null;let r=[];for(let c of i.children)c instanceof d.TFolder&&r.push(c.name);if(r.length===0)return null;let o=[];for(let{domain:c,company:l}of e){let u=this.findAccountFolder(l),p=u?1:0;o.push({domain:c,company:l,folder:u,score:p})}if(o.sort((c,l)=>l.score-c.score),o.length>0&&o[0].folder){let c=o[0],l=c.folder.split("/").pop()||c.company;return console.log(`[Eudia Calendar] Best domain match: "${c.company}" from ${c.domain} -> ${c.folder}`),{folder:c.folder,accountName:l,source:"domain"}}if(t){let c=this.findAccountFolder(t);if(c){let l=c.split("/").pop()||t;return console.log(`[Eudia Calendar] Server account match: "${t}" -> ${c}`),{folder:c,accountName:l,source:"server"}}}if(n){let c=this.findAccountFolder(n);if(c){let l=c.split("/").pop()||n;return console.log(`[Eudia Calendar] Subject match: "${n}" -> ${c}`),{folder:c,accountName:l,source:"subject"}}}for(let{company:c}of e){let l=r.find(u=>{let p=u.toLowerCase(),f=c.toLowerCase();return p.includes(f)||f.includes(p)});if(l){let u=`${a}/${l}`;return console.log(`[Eudia Calendar] Partial domain match: "${c}" -> ${u}`),{folder:u,accountName:l,source:"domain-partial"}}}return null}extractAccountFromAttendees(e){let t=this.getExternalDomainsFromAttendees(e);if(t.length===0)return null;let n=t[0];return console.log(`[Eudia Calendar] Extracted company "${n.company}" from attendee domain ${n.domain}`),n.company}extractAccountFromSubject(e){if(!e)return null;let t=e.match(/^([^\/]+)\s*\/\s*Eudia|Eudia\s*\/\s*([^\/\-|]+)/i);if(t){let a=(t[1]||t[2]||"").trim();if(a.toLowerCase()!=="eudia")return a}let n=e.match(/^Eudia\s*[-–]\s*([^|]+)|^([^-–]+)\s*[-–]\s*Eudia/i);if(n){let i=(n[1]||n[2]||"").trim().replace(/\s+(Connect|Weekly|Call|Meeting|Intro|Demo|Check\s*in|Sync).*$/i,"").trim();if(i.toLowerCase()!=="eudia"&&i.length>0)return i}if(!e.toLowerCase().includes("eudia")){let a=e.match(/^([^-–|]+)/);if(a){let i=a[1].trim();if(i.length>2&&i.length<50)return i}}return null}findAccountFolder(e){if(!e)return null;let t=this.plugin.settings.accountsFolder||"Accounts",n=this.app.vault.getAbstractFileByPath(t);if(!(n instanceof d.TFolder))return console.log(`[Eudia Calendar] Accounts folder "${t}" not found`),null;let a=e.toLowerCase().trim(),i=[];for(let p of n.children)p instanceof d.TFolder&&i.push(p.name);console.log(`[Eudia Calendar] Searching for "${a}" in ${i.length} folders`);let r=i.find(p=>p.toLowerCase()===a);if(r)return console.log(`[Eudia Calendar] Exact match found: ${r}`),`${t}/${r}`;let o=i.find(p=>p.toLowerCase().startsWith(a));if(o)return console.log(`[Eudia Calendar] Folder starts with match: ${o}`),`${t}/${o}`;let c=i.find(p=>a.startsWith(p.toLowerCase()));if(c)return console.log(`[Eudia Calendar] Search starts with folder match: ${c}`),`${t}/${c}`;let l=i.find(p=>{let f=p.toLowerCase();return f.length>=3&&a.includes(f)});if(l)return console.log(`[Eudia Calendar] Search contains folder match: ${l}`),`${t}/${l}`;let u=i.find(p=>{let f=p.toLowerCase();return a.length>=3&&f.includes(a)});return u?(console.log(`[Eudia Calendar] Folder contains search match: ${u}`),`${t}/${u}`):(console.log(`[Eudia Calendar] No folder match found for "${a}"`),null)}async createNoteForMeeting(e){let t=e.start.split("T")[0],n=e.subject.replace(/[<>:"/\\|?*]/g,"_").substring(0,50),a=`${t} - ${n}.md`,i=null,r=e.accountName||null,o=null;console.log(`[Eudia Calendar] === Creating note for meeting: "${e.subject}" ===`),console.log(`[Eudia Calendar] Attendees: ${JSON.stringify(e.attendees?.map(h=>h.email)||[])}`);let c=this.getExternalDomainsFromAttendees(e.attendees||[]);console.log(`[Eudia Calendar] External domains found: ${JSON.stringify(c)}`);let l=this.extractAccountFromSubject(e.subject);console.log(`[Eudia Calendar] Subject-extracted name: "${l||"none"}"`);let u=this.findBestAccountMatch(c,e.accountName,l||void 0);if(u&&(i=u.folder,r=u.accountName,console.log(`[Eudia Calendar] Best match (${u.source}): "${r}" -> ${i}`)),!i){let h=this.plugin.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(h)instanceof d.TFolder&&(i=h,console.log(`[Eudia Calendar] No match found, using Accounts root: ${i}`))}if(r){let h=this.plugin.settings.cachedAccounts.find(v=>v.name.toLowerCase()===r?.toLowerCase());h&&(o=h.id,r=h.name,console.log(`[Eudia Calendar] Matched to cached account: ${h.name} (${h.id})`))}let p=i?`${i}/${a}`:a,f=this.app.vault.getAbstractFileByPath(p);if(f instanceof d.TFile){await this.app.workspace.getLeaf().openFile(f),new d.Notice(`Opened existing note: ${a}`);return}let m=(e.attendees||[]).map(h=>h.name||h.email?.split("@")[0]||"Unknown").slice(0,5).join(", "),g=`---
title: "${e.subject}"
date: ${t}
attendees: [${m}]
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
${(e.attendees||[]).map(h=>`- ${h.name||h.email}`).join(`
`)}

## Pre-Call Notes

*Add any prep notes, context, or questions before the meeting*



---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` \u2192 **"Transcribe Meeting"**

---

`;try{let h=await this.app.vault.create(p,g);await this.app.workspace.getLeaf().openFile(h),new d.Notice(`Created: ${p}`)}catch(h){console.error("[Eudia Calendar] Failed to create note:",h),new d.Notice(`Could not create note: ${h.message||"Unknown error"}`)}}},F=class extends d.Plugin{constructor(){super(...arguments);this.audioRecorder=null;this.recordingStatusBar=null;this.micRibbonIcon=null;this.liveTranscript="";this.liveTranscriptChunkInterval=null;this.isTranscribingChunk=!1}async onload(){await this.loadSettings(),this.transcriptionService=new N(this.settings.serverUrl),this.calendarService=new b(this.settings.serverUrl,this.settings.userEmail,this.settings.timezone||"America/New_York"),this.smartTagService=new D,this.registerView(x,e=>new _(e,this)),this.registerView(E,e=>new W(e,this)),this.addRibbonIcon("calendar","Open Calendar",()=>this.activateCalendarView()),this.micRibbonIcon=this.addRibbonIcon("microphone","Transcribe Meeting",async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}),this.addRibbonIcon("message-circle","Ask GTM Brain",()=>{this.openIntelligenceQueryForCurrentNote()}),this.addCommand({id:"transcribe-meeting",name:"Transcribe Meeting",callback:async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}}),this.addCommand({id:"open-calendar",name:"Open Calendar",callback:()=>this.activateCalendarView()}),this.addCommand({id:"sync-accounts",name:"Sync Salesforce Accounts",callback:()=>this.syncAccounts()}),this.addCommand({id:"sync-note",name:"Sync Note to Salesforce",callback:()=>this.syncNoteToSalesforce()}),this.addCommand({id:"new-meeting-note",name:"New Meeting Note",callback:()=>this.createMeetingNote()}),this.addCommand({id:"ask-gtm-brain",name:"Ask gtm-brain",callback:()=>this.openIntelligenceQueryForCurrentNote()}),this.addCommand({id:"refresh-analytics",name:"Refresh Analytics Dashboard",callback:async()=>{let e=this.app.workspace.getActiveFile();e?await this.refreshAnalyticsDashboard(e):new d.Notice("No active file")}}),this.addCommand({id:"live-query-transcript",name:"Query Current Transcript (Live)",callback:async()=>{if(!this.audioRecorder?.isRecording()){new d.Notice("No active recording. Start recording first to use live query.");return}if(!this.liveTranscript||this.liveTranscript.length<50){new d.Notice("Not enough transcript captured yet. Keep recording for a few more minutes.");return}this.openLiveQueryModal()}}),this.addSettingTab(new H(this.app,this)),this.registerEditorSuggest(new L(this.app,this)),this.app.workspace.onLayoutReady(async()=>{if(this.settings.setupCompleted){if(this.settings.syncOnStartup){if(await this.scanLocalAccountFolders(),this.settings.userEmail&&this.settings.syncAccountsOnStartup){let e=new Date().toISOString().split("T")[0];this.settings.lastAccountRefreshDate!==e&&setTimeout(async()=>{try{console.log("[Eudia] Startup account sync - checking for changes...");let n=await this.syncAccountFolders();if(n.success){if(this.settings.lastAccountRefreshDate=e,await this.saveSettings(),n.added>0||n.archived>0){let a=[];n.added>0&&a.push(`${n.added} added`),n.archived>0&&a.push(`${n.archived} archived`),new d.Notice(`Account folders synced: ${a.join(", ")}`)}}else console.log("[Eudia] Sync failed:",n.error)}catch{console.log("[Eudia] Startup sync skipped (server unreachable), will retry tomorrow")}},2e3)}this.settings.showCalendarView&&this.settings.userEmail&&await this.activateCalendarView(),this.settings.userEmail&&this.telemetry&&setTimeout(async()=>{try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),t=0;e&&e instanceof d.TFolder&&(t=e.children.filter(i=>i instanceof d.TFolder&&!i.name.startsWith("_")).length);let n={salesforce:this.settings.salesforceConnected?"connected":"not_configured",calendar:this.settings.calendarConfigured?"connected":"not_configured"};await this.telemetry.sendHeartbeat(t,n);let a=await this.telemetry.checkForPushedConfig();if(a.length>0){let i=!1;for(let r of a)r.key&&this.settings.hasOwnProperty(r.key)&&(this.settings[r.key]=r.value,i=!0,console.log(`[Eudia] Applied pushed config: ${r.key} = ${r.value}`));i&&(await this.saveSettings(),new d.Notice("Settings updated by admin"))}}catch{console.log("[Eudia] Heartbeat/config check skipped")}},3e3)}}else{await new Promise(t=>setTimeout(t,100));let e=document.querySelector(".modal-container .modal");if(e){let t=e.querySelector(".modal-close-button");t&&t.click()}await this.activateSetupView()}this.app.workspace.on("file-open",async e=>{if(e&&(e.path.includes("_Analytics/")||e.path.includes("_Customer Health/")))try{let t=await this.app.vault.read(e);if(t.includes("type: analytics_dashboard")){let a=t.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/)?.[1],i=new Date().toISOString().split("T")[0];a!==i&&(console.log(`[Eudia] Auto-refreshing analytics: ${e.name}`),await this.refreshAnalyticsDashboard(e))}}catch{}})})}async onunload(){this.app.workspace.detachLeavesOfType(x)}async loadSettings(){this.settings=Object.assign({},ge,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}async activateCalendarView(){let e=this.app.workspace,t=e.getLeavesOfType(x);if(t.length>0)e.revealLeaf(t[0]);else{let n=e.getRightLeaf(!1);n&&(await n.setViewState({type:x,active:!0}),e.revealLeaf(n))}}async activateSetupView(){let e=this.app.workspace,t=e.getLeavesOfType(E);if(t.length>0)e.revealLeaf(t[0]);else{let n=e.getLeaf(!0);n&&(await n.setViewState({type:E,active:!0}),e.revealLeaf(n))}}async createTailoredAccountFolders(e){let t=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t);let a=0;for(let i of e){let r=i.name.replace(/[<>:"/\\|?*]/g,"_").trim(),o=`${t}/${r}`;if(this.app.vault.getAbstractFileByPath(o)instanceof d.TFolder){console.log(`[Eudia] Account folder already exists: ${r}`);continue}try{await this.app.vault.createFolder(o);let l=new Date().toISOString().split("T")[0],u=[{name:"Note 1.md",content:`---
account: "${i.name}"
account_id: "${i.id}"
type: meeting_note
sync_to_salesforce: false
created: ${l}
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
created: ${l}
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
created: ${l}
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
auto_updated: true
last_updated: ${l}
sync_to_salesforce: false
---

# ${i.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}];for(let p of u){let f=`${o}/${p.name}`;await this.app.vault.create(f,p.content)}a++,console.log(`[Eudia] Created account folder with subnotes: ${r}`)}catch(l){console.error(`[Eudia] Failed to create folder for ${r}:`,l)}}this.settings.cachedAccounts=e.map(i=>({id:i.id,name:i.name})),await this.saveSettings(),a>0&&new d.Notice(`Created ${a} account folders`),await this.ensureNextStepsFolderExists()}async createAdminAccountFolders(e){let t=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t),await this.ensurePipelineFolderExists();let a=0,i=0,r=new Date().toISOString().split("T")[0];for(let o of e){let c=o.name.replace(/[<>:"/\\|?*]/g,"_").trim(),l=`${t}/${c}`;if(!(this.app.vault.getAbstractFileByPath(l)instanceof d.TFolder))try{await this.app.vault.createFolder(l),await this.createExecAccountSubnotes(l,o,r),o.isOwned?a++:i++,console.log(`[Eudia Admin] Created ${o.isOwned?"owned":"view-only"} folder: ${c}`)}catch(p){console.error(`[Eudia Admin] Failed to create folder for ${c}:`,p)}}this.settings.cachedAccounts=e.map(o=>({id:o.id,name:o.name})),await this.saveSettings(),a+i>0&&new d.Notice(`Created ${a} owned + ${i} view-only account folders`),await this.ensureNextStepsFolderExists()}async createExecAccountSubnotes(e,t,n){let a=t.ownerName||"Unknown",i=[{name:"Note 1.md",content:`---
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
owner: "${a}"
sync_to_salesforce: false
---

# ${t.name} - Meeting Notes

**Account Owner:** ${a}

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
`}];for(let r of i){let o=`${e}/${r.name}`;await this.app.vault.create(o,r.content)}}async createFullAccountSubnotes(e,t,n){let a=[{name:"Note 1.md",content:`---
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
`}];for(let i of a){let r=`${e}/${i.name}`;await this.app.vault.create(r,i.content)}}async ensurePipelineFolderExists(){let e="Pipeline",t=`${e}/Pipeline Review Notes.md`;if(this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e),!this.app.vault.getAbstractFileByPath(t)){let r=`---
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
`;await this.app.vault.create(t,r)}}async ensureNextStepsFolderExists(){let e="Next Steps",t=`${e}/All Next Steps.md`;if(this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e),!this.app.vault.getAbstractFileByPath(t)){let i=new Date().toISOString().split("T")[0],r=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${i}
---

# All Next Steps Dashboard

*Last updated: ${i} ${r}*

---

## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;await this.app.vault.create(t,o)}}async updateAccountNextSteps(e,t,n){try{console.log(`[Eudia] updateAccountNextSteps called for: ${e}`),console.log(`[Eudia] Content length: ${t?.length||0} chars`);let a=e.replace(/[<>:"/\\|?*]/g,"_").trim(),i=`${this.settings.accountsFolder}/${a}/Next Steps.md`;console.log(`[Eudia] Looking for Next Steps file at: ${i}`);let r=this.app.vault.getAbstractFileByPath(i);if(!r||!(r instanceof d.TFile)){console.log(`[Eudia] \u274C Next Steps file NOT FOUND at: ${i}`);let A=this.app.vault.getAbstractFileByPath(`${this.settings.accountsFolder}/${a}`);A&&A instanceof d.TFolder?console.log(`[Eudia] Files in ${a} folder:`,A.children.map(k=>k.name)):console.log(`[Eudia] Account folder also not found: ${this.settings.accountsFolder}/${a}`);return}console.log("[Eudia] Found Next Steps file, updating...");let o=new Date().toISOString().split("T")[0],c=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),l=n.split("/").pop()?.replace(".md","")||"Meeting",u=t;!t.includes("- [ ]")&&!t.includes("- [x]")&&(u=t.split(`
`).filter(A=>A.trim()).map(A=>{let k=A.replace(/^[-•*]\s*/,"").trim();return k?`- [ ] ${k}`:""}).filter(Boolean).join(`
`));let p=await this.app.vault.read(r),f="",m=p.match(/## History\n\n\*Previous next steps are archived below\.\*\n\n([\s\S]*?)$/);m&&m[1]&&(f=m[1].trim());let g=`### ${o} - ${l}
${u||"*None*"}`,h=f?`${g}

---

${f}`:g,v=`---
account: "${e}"
account_id: "${this.settings.cachedAccounts.find(A=>A.name===e)?.id||""}"
type: next_steps
auto_updated: true
last_updated: ${o}
sync_to_salesforce: false
---

# ${e} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*Last updated: ${o} ${c} from ${l}*

${u||"*No next steps identified*"}

---

## History

*Previous next steps are archived below.*

${h}
`;await this.app.vault.modify(r,v),console.log(`[Eudia] Updated Next Steps for ${e} (history preserved)`),await this.regenerateNextStepsDashboard()}catch(a){console.error(`[Eudia] Failed to update Next Steps for ${e}:`,a)}}async regenerateNextStepsDashboard(){try{let t=this.app.vault.getAbstractFileByPath("Next Steps/All Next Steps.md");if(!t||!(t instanceof d.TFile)){await this.ensureNextStepsFolderExists();return}let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!n||!(n instanceof d.TFolder))return;let a=[];for(let c of n.children)if(c instanceof d.TFolder){let l=`${c.path}/Next Steps.md`,u=this.app.vault.getAbstractFileByPath(l);if(u instanceof d.TFile){let p=await this.app.vault.read(u),f=p.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/),m=f?f[1]:"Unknown",g=p.split(`
`).filter(h=>h.match(/^- \[[ x]\]/)).slice(0,5);(g.length>0||m!=="Unknown")&&a.push({account:c.name,lastUpdated:m,nextSteps:g})}}a.sort((c,l)=>l.lastUpdated.localeCompare(c.lastUpdated));let i=new Date().toISOString().split("T")[0],r=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${i}
---

# All Next Steps Dashboard

*Last updated: ${i} ${r}*

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
`;for(let c of a){let l=c.nextSteps.filter(u=>u.includes("- [ ]")).length;o+=`| ${c.account} | ${c.lastUpdated} | ${l} |
`}}await this.app.vault.modify(t,o),console.log("[Eudia] Regenerated All Next Steps dashboard")}catch(e){console.error("[Eudia] Failed to regenerate Next Steps dashboard:",e)}}async startRecording(){if(!S.isSupported()){new d.Notice("Audio transcription is not supported in this browser");return}let e=this.app.workspace.getActiveFile();if(e||(await this.createMeetingNote(),e=this.app.workspace.getActiveFile()),!e){new d.Notice("Please open or create a note first");return}this.audioRecorder=new S,this.recordingStatusBar=new j(()=>this.audioRecorder?.pause(),()=>this.audioRecorder?.resume(),()=>this.stopRecording(),()=>this.cancelRecording());try{await this.audioRecorder.start(),this.recordingStatusBar.show(),this.micRibbonIcon?.addClass("eudia-ribbon-recording");let t=setInterval(()=>{if(this.audioRecorder?.isRecording()){let n=this.audioRecorder.getState();this.recordingStatusBar?.updateState(n)}else clearInterval(t)},100);this.liveTranscript="",this.startLiveTranscription(),new d.Notice("Transcription started. Click stop when finished.")}catch(t){new d.Notice(`Failed to start transcription: ${t.message}`),this.recordingStatusBar?.hide(),this.recordingStatusBar=null}}async stopRecording(){if(!this.audioRecorder?.isRecording())return;let e=this.app.workspace.getActiveFile();if(!e){new d.Notice("No active file to save transcription"),this.cancelRecording();return}this.recordingStatusBar?.showProcessing();try{let t=await this.audioRecorder.stop();await this.processRecording(t,e)}catch(t){new d.Notice(`Transcription failed: ${t.message}`)}finally{this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null}}async cancelRecording(){this.audioRecorder?.isRecording()&&this.audioRecorder.cancel(),this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null,new d.Notice("Transcription cancelled")}startLiveTranscription(){this.stopLiveTranscription();let e=12e4;this.liveTranscriptChunkInterval=setInterval(async()=>{await this.transcribeCurrentChunk()},e),setTimeout(async()=>{this.audioRecorder?.isRecording()&&await this.transcribeCurrentChunk()},3e4),console.log("[Eudia] Live transcription started")}stopLiveTranscription(){this.liveTranscriptChunkInterval&&(clearInterval(this.liveTranscriptChunkInterval),this.liveTranscriptChunkInterval=null),console.log("[Eudia] Live transcription stopped")}async transcribeCurrentChunk(){if(!this.audioRecorder?.isRecording()||this.isTranscribingChunk)return;let e=this.audioRecorder.extractNewChunks();if(!(!e||e.size<5e3)){this.isTranscribingChunk=!0,console.log(`[Eudia] Transcribing chunk: ${e.size} bytes`);try{let t=new FileReader,a=await new Promise((o,c)=>{t.onload=()=>{let u=t.result.split(",")[1];o(u)},t.onerror=c,t.readAsDataURL(e)}),i=this.audioRecorder.getMimeType(),r=await this.transcriptionService.transcribeChunk(a,i);r.success&&r.text&&(this.liveTranscript+=(this.liveTranscript?`

`:"")+r.text,console.log(`[Eudia] Chunk transcribed, total transcript length: ${this.liveTranscript.length}`))}catch(t){console.error("[Eudia] Chunk transcription error:",t)}finally{this.isTranscribingChunk=!1}}}openLiveQueryModal(){let e=new d.Modal(this.app);e.titleEl.setText("Query Live Transcript");let t=e.contentEl;t.addClass("eudia-live-query-modal"),t.createDiv({cls:"eudia-live-query-instructions"}).setText(`Ask a question about what has been discussed so far (${Math.round(this.liveTranscript.length/4)} words captured):`);let a=t.createEl("textarea",{cls:"eudia-live-query-input",attr:{placeholder:'e.g., "What did Tom say about pricing?" or "What were the main concerns raised?"',rows:"3"}}),i=t.createDiv({cls:"eudia-live-query-response"});i.style.display="none";let r=t.createEl("button",{text:"Ask",cls:"eudia-btn-primary"});r.addEventListener("click",async()=>{let o=a.value.trim();if(!o){new d.Notice("Please enter a question");return}r.disabled=!0,r.setText("Searching..."),i.style.display="block",i.setText("Searching transcript..."),i.addClass("eudia-loading");try{let c=await this.transcriptionService.liveQueryTranscript(o,this.liveTranscript,this.getAccountNameFromActiveFile());i.removeClass("eudia-loading"),c.success?i.setText(c.answer):(i.setText(c.error||"Failed to query transcript"),i.addClass("eudia-error"))}catch(c){i.removeClass("eudia-loading"),i.setText(`Error: ${c.message}`),i.addClass("eudia-error")}finally{r.disabled=!1,r.setText("Ask")}}),a.addEventListener("keydown",o=>{o.key==="Enter"&&!o.shiftKey&&(o.preventDefault(),r.click())}),e.open(),a.focus()}getAccountNameFromActiveFile(){let e=this.app.workspace.getActiveFile();if(!e)return;let t=e.path.match(/Accounts\/([^\/]+)\//i);if(t)return t[1]}async processRecording(e,t){let n=e.audioBlob?.size||0;if(console.log(`[Eudia] Audio blob size: ${n} bytes, duration: ${e.duration}s`),n<1e3){new d.Notice("Recording too short or no audio captured. Please try again.");return}try{let c=await S.analyzeAudioBlob(e.audioBlob);console.log(`[Eudia] Audio diagnostic: hasAudio=${c.hasAudio}, peak=${c.peakLevel}, silent=${c.silentPercent}%`),c.warning&&(console.warn(`[Eudia] Audio warning: ${c.warning}`),c.hasAudio?new d.Notice(`Warning: ${c.warning.split(":")[0]}`,5e3):new d.Notice("Warning: Audio appears to be silent. Transcription may not work correctly. Check your microphone settings.",8e3))}catch(c){console.warn("[Eudia] Audio diagnostic failed, continuing anyway:",c)}let a=Math.ceil(e.duration/60),i=Math.max(1,Math.ceil(a/5));new d.Notice(`Transcription started. Estimated ${i}-${i+1} minutes.`);let r=await this.app.vault.read(t),o=`

---
**Transcription in progress...**
Started: ${new Date().toLocaleTimeString()}
Estimated completion: ${i}-${i+1} minutes

*You can navigate away. Check back shortly.*
---
`;await this.app.vault.modify(t,r+o),this.processTranscriptionAsync(e,t).catch(c=>{console.error("Background transcription failed:",c),new d.Notice(`Transcription failed: ${c.message}`)})}async processTranscriptionAsync(e,t){try{let n,a=t.path.split("/");if(console.log(`[Eudia] Processing transcription for: ${t.path}`),console.log(`[Eudia] Path parts: ${JSON.stringify(a)}, accountsFolder: ${this.settings.accountsFolder}`),a.length>=2&&a[0]===this.settings.accountsFolder){let f=a[1];console.log(`[Eudia] Detected account folder: ${f}`);let m=this.settings.cachedAccounts.find(g=>g.name.toLowerCase()===f.toLowerCase());m?(n={accountName:m.name,accountId:m.id},console.log(`[Eudia] Found cached account: ${m.name} (${m.id})`)):(n={accountName:f,accountId:""},console.log(`[Eudia] Account not in cache, using folder name: ${f}`))}else console.log("[Eudia] File not in Accounts folder, skipping account context");let i=[];try{let f=await this.calendarService.getCurrentMeeting();f.meeting?.attendees&&(i=f.meeting.attendees.map(m=>m.name||m.email.split("@")[0]).filter(Boolean).slice(0,10))}catch{}let r=await this.transcriptionService.transcribeAudio(e.audioBlob,n?{...n,speakerHints:i}:{speakerHints:i}),o=f=>f?!!(f.summary?.trim()||f.nextSteps?.trim()):!1,c=r.sections;if(o(c)||r.text?.trim()&&(c=await this.transcriptionService.processTranscription(r.text,n)),!o(c)&&!r.text?.trim()){let m=(await this.app.vault.read(t)).replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g,"");await this.app.vault.modify(t,m+`

**Transcription failed:** No audio detected.
`),new d.Notice("Transcription failed: No audio detected.");return}let l=this.buildNoteContent(c,r);await this.app.vault.modify(t,l);let u=Math.floor(e.duration/60);new d.Notice(`Transcription complete (${u} min recording)`);let p=c.nextSteps||c.actionItems;console.log(`[Eudia] Next Steps extraction - accountContext: ${n?.accountName||"undefined"}`),console.log(`[Eudia] Next Steps content found: ${p?"YES ("+p.length+" chars)":"NO"}`),console.log(`[Eudia] sections.nextSteps: ${c.nextSteps?"YES":"NO"}, sections.actionItems: ${c.actionItems?"YES":"NO"}`),p&&n?.accountName?(console.log(`[Eudia] Calling updateAccountNextSteps for ${n.accountName}`),await this.updateAccountNextSteps(n.accountName,p,t.path)):console.log("[Eudia] Skipping Next Steps update - missing content or account context"),this.settings.autoSyncAfterTranscription&&await this.syncNoteToSalesforce()}catch(n){try{let i=(await this.app.vault.read(t)).replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g,"");await this.app.vault.modify(t,i+`

**Transcription failed:** ${n.message}
`)}catch{}throw n}}buildNoteContent(e,t){let n=h=>h==null?"":Array.isArray(h)?h.map(v=>typeof v=="object"?v.category?`**${v.category}**: ${v.signal||v.insight||""}`:JSON.stringify(v):String(v)).join(`
`):typeof h=="object"?JSON.stringify(h):String(h),a=n(e.title)||"Meeting Notes",i=n(e.summary),r=n(e.painPoints),o=n(e.productInterest),c=n(e.meddiccSignals),l=n(e.nextSteps),u=n(e.actionItems),p=n(e.keyDates),f=n(e.risksObjections),m=n(e.attendees),g=`---
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

${i||"*AI summary will appear here*"}

`;return r&&!r.includes("None explicitly")&&(g+=`## Pain Points

${r}

`),o&&!o.includes("None identified")&&(g+=`## Product Interest

${o}

`),c&&(g+=`## MEDDICC Signals

${c}

`),l&&(g+=`## Next Steps

${l}

`),u&&(g+=`## Action Items

${u}

`),p&&!p.includes("No specific dates")&&(g+=`## Key Dates

${p}

`),f&&!f.includes("None raised")&&(g+=`## Risks and Objections

${f}

`),m&&(g+=`## Attendees

${m}

`),this.settings.appendTranscript&&t.text&&(g+=`---

## Full Transcript

${t.text}
`),g}openIntelligenceQuery(){new M(this.app,this).open()}openIntelligenceQueryForCurrentNote(){let e=this.app.workspace.getActiveFile(),t;if(e){let n=this.app.metadataCache.getFileCache(e)?.frontmatter;if(n?.account_id&&n?.account)t={id:n.account_id,name:n.account};else if(n?.account){let a=this.settings.cachedAccounts.find(i=>i.name.toLowerCase()===n.account.toLowerCase());a?t={id:a.id,name:a.name}:t={id:"",name:n.account}}else{let a=e.path.split("/");if(a.length>=2&&a[0]===this.settings.accountsFolder){let i=a[1],r=this.settings.cachedAccounts.find(o=>o.name.replace(/[<>:"/\\|?*]/g,"_").trim()===i);r?t={id:r.id,name:r.name}:t={id:"",name:i}}}}new M(this.app,this,t).open()}async syncAccounts(e=!1){e||new d.Notice("Syncing Salesforce accounts...");try{let n=(await(0,d.requestUrl)({url:`${this.settings.serverUrl}/api/accounts/obsidian`,method:"GET",headers:{Accept:"application/json"}})).json;if(!n.success||!n.accounts){e||new d.Notice("Failed to fetch accounts from server");return}this.settings.cachedAccounts=n.accounts.map(a=>({id:a.id,name:a.name})),this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings(),e||new d.Notice(`Synced ${n.accounts.length} accounts for matching`)}catch(t){e||new d.Notice(`Failed to sync accounts: ${t.message}`)}}async scanLocalAccountFolders(){try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!e||!(e instanceof d.TFolder))return;let t=[];for(let n of e.children)n instanceof d.TFolder&&t.push({id:`local-${n.name.replace(/\s+/g,"-").toLowerCase()}`,name:n.name});this.settings.cachedAccounts=t,this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings()}catch(e){console.error("Failed to scan local account folders:",e)}}async refreshAccountFolders(){if(!this.settings.userEmail)throw new Error("Please configure your email first");let e=new T(this.settings.serverUrl);if((await e.getAccountsForUser(this.settings.userEmail)).length===0)return console.log("[Eudia] No accounts found for user"),0;let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),a=[];if(n&&n instanceof d.TFolder)for(let r of n.children)r instanceof d.TFolder&&a.push(r.name);let i=await e.getNewAccounts(this.settings.userEmail,a);return i.length===0?(console.log("[Eudia] All account folders exist"),0):(console.log(`[Eudia] Creating ${i.length} new account folders`),await this.createTailoredAccountFolders(i),i.length)}async syncAccountFolders(){if(!this.settings.userEmail)return{success:!1,added:0,archived:0,error:"No email configured"};let e=this.settings.userEmail.toLowerCase().trim();console.log(`[Eudia] Syncing account folders for: ${e}`);try{let t=await fetch(`${this.settings.serverUrl}/api/bl-accounts/${encodeURIComponent(e)}`);if(!t.ok){let h=await t.json().catch(()=>({}));throw new Error(h.error||`Server returned ${t.status}`)}let n=await t.json();if(!n.success||!n.accounts)throw new Error(n.error||"Invalid response from server");let a=n.meta?.userGroup||"bl",i=n.meta?.queryDescription||"accounts",r=n.meta?.region||null;console.log(`[Eudia] User group: ${a}, accounts: ${n.accounts.length} (${i})`),r&&console.log(`[Eudia] Sales Leader region: ${r}`);let o=n.accounts,c=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),l=new Map;if(c&&c instanceof d.TFolder)for(let h of c.children)h instanceof d.TFolder&&!h.name.startsWith("_")&&l.set(h.name.toLowerCase().trim(),h);let u=new Set(o.map(h=>h.name.toLowerCase().trim())),p=o.filter(h=>{let v=h.name.toLowerCase().trim();return!l.has(v)}),f=[];if(a==="bl")for(let[h,v]of l.entries())u.has(h)||f.push(v);let m=0,g=0;if(p.length>0){console.log(`[Eudia] Creating ${p.length} new account folders for ${a}`);let h=p.map(v=>({id:v.id,name:v.name,type:v.customerType,isOwned:a==="bl",ownerName:v.ownerName}));a==="admin"||a==="exec"?await this.createAdminAccountFolders(h):await this.createTailoredAccountFolders(h),m=p.length,this.telemetry&&this.telemetry.reportInfo("Accounts synced - added",{count:m,userGroup:a,region:r||void 0})}return this.settings.archiveRemovedAccounts&&f.length>0&&(console.log(`[Eudia] Archiving ${f.length} removed account folders`),g=await this.archiveAccountFolders(f),this.telemetry&&this.telemetry.reportInfo("Accounts synced - archived",{count:g})),console.log(`[Eudia] Sync complete: ${m} added, ${g} archived (group: ${a})`),{success:!0,added:m,archived:g,userGroup:a}}catch(t){return console.error("[Eudia] Account sync error:",t),this.telemetry&&this.telemetry.reportError("Account sync failed",{error:t.message}),{success:!1,added:0,archived:0,error:t.message}}}async archiveAccountFolders(e){let t=0,n=`${this.settings.accountsFolder}/_Archived`;this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);for(let i of e)try{let r=`${n}/${i.name}`;if(this.app.vault.getAbstractFileByPath(r)){let u=new Date().toISOString().split("T")[0];await this.app.fileManager.renameFile(i,`${n}/${i.name}_${u}`)}else await this.app.fileManager.renameFile(i,r);let c=`${n}/${i.name}/_archived.md`,l=`---
archived_date: ${new Date().toISOString()}
reason: Account no longer in book of business
---

This account folder was archived because it no longer appears in your Salesforce book of business.

To restore, move this folder back to the Accounts directory.
`;try{await this.app.vault.create(c,l)}catch{}t++,console.log(`[Eudia] Archived: ${i.name}`)}catch(r){console.error(`[Eudia] Failed to archive ${i.name}:`,r)}return t}async syncNoteToSalesforce(){let e=this.app.workspace.getActiveFile();if(!e){new d.Notice("No active file to sync");return}let t=await this.app.vault.read(e),n=this.app.metadataCache.getFileCache(e)?.frontmatter;if(!n?.sync_to_salesforce){new d.Notice("Set sync_to_salesforce: true in frontmatter to enable sync");return}let a=n.account_id,i=n.account;if(!a&&i){let r=this.settings.cachedAccounts.find(o=>o.name.toLowerCase()===i.toLowerCase());r&&(a=r.id)}if(!a){let r=e.path.split("/");if(r.length>=2&&r[0]===this.settings.accountsFolder){let o=r[1],c=this.settings.cachedAccounts.find(l=>l.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);c&&(a=c.id,i=c.name)}}if(!a){new d.Notice("Could not determine account for this note");return}try{new d.Notice("Syncing to Salesforce...");let r=await(0,d.requestUrl)({url:`${this.settings.serverUrl}/api/notes/sync`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:a,accountName:i,noteTitle:e.basename,notePath:e.path,content:t,frontmatter:n,syncedAt:new Date().toISOString(),userEmail:this.settings.userEmail})});r.json?.success?new d.Notice("Synced to Salesforce"):new d.Notice("Failed to sync: "+(r.json?.error||"Unknown error"))}catch(r){new d.Notice(`Sync failed: ${r.message}`)}}async createMeetingNote(){return new Promise(e=>{new O(this.app,this,async n=>{if(!n){e();return}let a=new Date().toISOString().split("T")[0],i=n.name.replace(/[<>:"/\\|?*]/g,"_").trim(),r=`${this.settings.accountsFolder}/${i}`,o=`${a} Meeting.md`,c=`${r}/${o}`;this.app.vault.getAbstractFileByPath(r)||await this.app.vault.createFolder(r);let l=`---
title: "Meeting with ${n.name}"
date: ${a}
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

`,u=await this.app.vault.create(c,l);await this.app.workspace.getLeaf().openFile(u),new d.Notice(`Created meeting note for ${n.name}`),e()}).open()})}async fetchAndInsertContext(){new d.Notice("Fetching pre-call context...")}async refreshAnalyticsDashboard(e){if(!this.settings.userEmail){console.log("[Eudia] Cannot refresh analytics - no email configured");return}let n=(await this.app.vault.read(e)).match(/^---\n([\s\S]*?)\n---/);if(!n)return;let a=n[1];if(!a.includes("type: analytics_dashboard"))return;let i=a.match(/category:\s*(\w+)/)?.[1]||"team";console.log(`[Eudia] Refreshing analytics dashboard: ${e.name} (${i})`);try{let r=null,o=this.settings.serverUrl,c=encodeURIComponent(this.settings.userEmail);switch(i){case"pain_points":r=(await(0,d.requestUrl)({url:`${o}/api/analytics/pain-points?days=30`,method:"GET"})).json,r.success&&await this.updatePainPointNote(e,r.painPoints);break;case"objections":r=(await(0,d.requestUrl)({url:`${o}/api/analytics/objection-playbook?days=90`,method:"GET"})).json,r.success&&await this.updateObjectionNote(e,r);break;case"coaching":case"team":default:r=(await(0,d.requestUrl)({url:`${o}/api/analytics/team-trends?managerId=${c}`,method:"GET"})).json,r.success&&await this.updateTeamPerformanceNote(e,r.trends);break}r?.success&&new d.Notice(`Analytics refreshed: ${e.name}`)}catch(r){console.error("[Eudia] Analytics refresh error:",r)}}async updatePainPointNote(e,t){if(!t||t.length===0)return;let n=new Date().toISOString().split("T")[0],a=t.slice(0,10).map(l=>`| ${l.painPoint||"--"} | ${l.count||0} | ${l.category||"--"} | ${l.averageSeverity||"medium"} |`).join(`
`),i={};for(let l of t){let u=l.category||"other";i[u]||(i[u]=[]),i[u].push(l)}let r="";for(let[l,u]of Object.entries(i)){r+=`
### ${l.charAt(0).toUpperCase()+l.slice(1)}
`;for(let p of u.slice(0,3))r+=`- ${p.painPoint}
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
${a}

---

## By Category
${r}

---

## Example Quotes

${o||"*No quotes available*"}

---

> **Tip:** Use these pain points to prepare for customer calls.
`;await this.app.vault.modify(e,c)}async updateObjectionNote(e,t){if(!t.objections||t.objections.length===0)return;let n=new Date().toISOString().split("T")[0],a=t.objections.slice(0,10).map(o=>{let c=o.handleRatePercent>=75?"\u2705 Strong":o.handleRatePercent>=50?"\u26A0\uFE0F Moderate":"\u274C Needs Work";return`| ${o.objection?.substring(0,40)||"--"}... | ${o.count||0} | ${o.handleRatePercent||0}% | ${c} |`}).join(`
`),i="";for(let o of t.objections.slice(0,5))if(o.bestResponses&&o.bestResponses.length>0){i+=`
### Objection: "${o.objection?.substring(0,50)}..."

`,i+=`**Frequency:** ${o.count} times  
`,i+=`**Handle Rate:** ${o.handleRatePercent}%

`,i+=`**Best Responses:**
`;for(let c of o.bestResponses.slice(0,2))i+=`1. *"${c.response}"* - ${c.rep||"Team member"}
`;i+=`
`}let r=`---
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
${a}

---

## Best Practices
${i||"*No best practices available yet*"}

---

## Coaching Notes

*Objections with <50% handle rate need training focus*

Average handle rate: ${t.avgHandleRate||0}%

---

> **Tip:** Review this playbook before important calls.
`;await this.app.vault.modify(e,r)}async updateTeamPerformanceNote(e,t){if(!t)return;let n=new Date().toISOString().split("T")[0],a=r=>r>0?`\u2191 ${Math.abs(r).toFixed(1)}%`:r<0?`\u2193 ${Math.abs(r).toFixed(1)}%`:"--",i=`---
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
| Avg Score | ${t.avgScore?.toFixed(1)||"--"} | ${a(t.scoreTrend)} |
| Talk Ratio | ${t.avgTalkRatio?Math.round(t.avgTalkRatio*100):"--"}% | ${a(t.talkRatioTrend)} |
| Value Score | ${t.avgValueScore?.toFixed(1)||"--"} | ${a(t.valueScoreTrend)} |
| Next Step Rate | ${t.nextStepRate?Math.round(t.nextStepRate*100):"--"}% | -- |

---

## Top Pain Points

${t.topPainPoints?.slice(0,5).map(r=>`- **${r.painPoint}** (${r.count} mentions)`).join(`
`)||"*No pain points captured yet*"}

---

## Trending Topics

${t.trendingTopics?.slice(0,8).map(r=>`- ${r.topic} (${r.count})`).join(`
`)||"*No topics captured yet*"}

---

## Top Objections

${t.topObjections?.slice(0,5).map(r=>`- ${r.objection} - ${r.handleRatePercent}% handled`).join(`
`)||"*No objections captured yet*"}

---

> **Note:** This dashboard refreshes automatically when you open it.
> Data is aggregated from all analyzed calls in your region.
`;await this.app.vault.modify(e,i)}},H=class extends d.PluginSettingTab{constructor(s,e){super(s,e),this.plugin=e}display(){let{containerEl:s}=this;s.empty(),s.createEl("h2",{text:"Eudia Sync & Scribe"}),s.createEl("h3",{text:"Your Profile"});let e=s.createDiv();e.style.cssText="padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px; margin-top: 16px;";let t=e.createDiv();t.style.cssText="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";let n=t.createSpan(),a=t.createSpan(),i=e.createDiv();i.style.cssText="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;",i.setText("Connect with Salesforce to sync notes with your user attribution.");let r=e.createEl("button");r.style.cssText="padding: 10px 20px; cursor: pointer; border-radius: 6px;";let o=null,c=async()=>{if(!this.plugin.settings.userEmail)return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);",a.setText("Enter email above first"),r.setText("Setup Required"),r.disabled=!0,r.style.opacity="0.5",r.style.cursor="not-allowed",!1;r.disabled=!1,r.style.opacity="1",r.style.cursor="pointer";try{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); animation: pulse 1s infinite;",a.setText("Checking..."),(await(0,d.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;",a.setText("Connected to Salesforce"),r.setText("Reconnect"),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),!0):(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;",a.setText("Not connected"),r.setText("Connect to Salesforce"),!1)}catch{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;",a.setText("Status unavailable"),r.setText("Connect to Salesforce"),!1}};new d.Setting(s).setName("Eudia Email").setDesc("Your @eudia.com email address for calendar and Salesforce sync").addText(m=>m.setPlaceholder("yourname@eudia.com").setValue(this.plugin.settings.userEmail).onChange(async g=>{let h=g.trim().toLowerCase();this.plugin.settings.userEmail=h,await this.plugin.saveSettings(),await c()})),new d.Setting(s).setName("Timezone").setDesc("Your local timezone for calendar event display").addDropdown(m=>{V.forEach(g=>{m.addOption(g.value,g.label)}),m.setValue(this.plugin.settings.timezone),m.onChange(async g=>{this.plugin.settings.timezone=g,await this.plugin.saveSettings(),this.plugin.calendarService?.setTimezone(g),new d.Notice(`Timezone set to ${V.find(h=>h.value===g)?.label||g}`)})}),s.createEl("h3",{text:"Salesforce Connection"}),s.appendChild(e);let l=()=>{o&&window.clearInterval(o);let m=0,g=30;o=window.setInterval(async()=>{m++,await c()?(o&&(window.clearInterval(o),o=null),new d.Notice("Salesforce connected successfully!")):m>=g&&o&&(window.clearInterval(o),o=null)},5e3)};r.onclick=async()=>{if(!this.plugin.settings.userEmail){new d.Notice("Please enter your email first");return}let m=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(m,"_blank"),new d.Notice("Complete the Salesforce login in the popup window",5e3),l()},c(),s.createEl("h3",{text:"Server"}),new d.Setting(s).setName("GTM Brain Server").setDesc("Server URL for calendar, accounts, and sync").addText(m=>m.setValue(this.plugin.settings.serverUrl).onChange(async g=>{this.plugin.settings.serverUrl=g,await this.plugin.saveSettings()}));let u=s.createDiv({cls:"settings-advanced-collapsed"}),p=u.createDiv({cls:"eudia-transcription-status"});p.style.cssText="padding: 12px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;",p.innerHTML='<span style="color: var(--text-muted);">Checking server transcription status...</span>',(async()=>{try{(await(0,d.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/plugin/config`,method:"GET"})).json?.capabilities?.serverTranscription?p.innerHTML='<span class="eudia-check-icon"></span> Server transcription is available. No local API key needed.':p.innerHTML='<span class="eudia-warn-icon"></span> Server transcription unavailable. Add a local API key below.'}catch{p.innerHTML='<span style="color: #f59e0b;">\u26A0</span> Could not check server status. Local API key recommended as backup.'}})();let f=new d.Setting(s).setName("Advanced Options").setDesc("Show fallback API key (usually not needed)").addToggle(m=>m.setValue(!1).onChange(g=>{u.style.display=g?"block":"none"}));u.style.display="none",s.createEl("h3",{text:"Transcription"}),new d.Setting(s).setName("Save Audio Files").setDesc("Keep original audio recordings").addToggle(m=>m.setValue(this.plugin.settings.saveAudioFiles).onChange(async g=>{this.plugin.settings.saveAudioFiles=g,await this.plugin.saveSettings()})),new d.Setting(s).setName("Append Full Transcript").setDesc("Include complete transcript in notes").addToggle(m=>m.setValue(this.plugin.settings.appendTranscript).onChange(async g=>{this.plugin.settings.appendTranscript=g,await this.plugin.saveSettings()})),s.createEl("h3",{text:"Sync"}),new d.Setting(s).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle(m=>m.setValue(this.plugin.settings.syncOnStartup).onChange(async g=>{this.plugin.settings.syncOnStartup=g,await this.plugin.saveSettings()})),new d.Setting(s).setName("Auto-Sync After Transcription").setDesc("Push notes to Salesforce after transcription").addToggle(m=>m.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async g=>{this.plugin.settings.autoSyncAfterTranscription=g,await this.plugin.saveSettings()})),s.createEl("h3",{text:"Folders"}),new d.Setting(s).setName("Accounts Folder").setDesc("Where account folders are stored").addText(m=>m.setValue(this.plugin.settings.accountsFolder).onChange(async g=>{this.plugin.settings.accountsFolder=g||"Accounts",await this.plugin.saveSettings()})),new d.Setting(s).setName("Recordings Folder").setDesc("Where audio files are saved").addText(m=>m.setValue(this.plugin.settings.recordingsFolder).onChange(async g=>{this.plugin.settings.recordingsFolder=g||"Recordings",await this.plugin.saveSettings()})),s.createEl("h3",{text:"Actions"}),new d.Setting(s).setName("Sync Accounts Now").setDesc(`${this.plugin.settings.cachedAccounts.length} accounts available for matching`).addButton(m=>m.setButtonText("Sync").setCta().onClick(async()=>{await this.plugin.syncAccounts(),this.display()})),new d.Setting(s).setName("Refresh Account Folders").setDesc("Check for new account assignments and create folders for them").addButton(m=>m.setButtonText("Refresh Folders").onClick(async()=>{m.setButtonText("Checking..."),m.setDisabled(!0);try{let g=await this.plugin.refreshAccountFolders();g>0?new d.Notice(`Created ${g} new account folder${g>1?"s":""}`):new d.Notice("All account folders are up to date")}catch(g){new d.Notice("Failed to refresh folders: "+g.message)}m.setButtonText("Refresh Folders"),m.setDisabled(!1),this.display()})),this.plugin.settings.lastSyncTime&&s.createEl("p",{text:`Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()}`,cls:"setting-item-description"}),s.createEl("p",{text:`Audio transcription: ${S.isSupported()?"Supported":"Not supported"}`,cls:"setting-item-description"})}};
