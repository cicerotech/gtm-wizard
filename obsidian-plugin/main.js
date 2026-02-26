var we=Object.create;var z=Object.defineProperty;var Se=Object.getOwnPropertyDescriptor;var Oe=Object.getOwnPropertyNames;var be=Object.getPrototypeOf,Ce=Object.prototype.hasOwnProperty;var Ae=(S,i)=>{for(var t in i)z(S,t,{get:i[t],enumerable:!0})},le=(S,i,t,e)=>{if(i&&typeof i=="object"||typeof i=="function")for(let n of Oe(i))!Ce.call(S,n)&&n!==t&&z(S,n,{get:()=>i[n],enumerable:!(e=Se(i,n))||e.enumerable});return S};var V=(S,i,t)=>(t=S!=null?we(be(S)):{},le(i||!S||!S.__esModule?z(t,"default",{value:S,enumerable:!0}):t,S)),xe=S=>le(z({},"__esModule",{value:!0}),S);var Ve={};Ae(Ve,{default:()=>Q});module.exports=xe(Ve);var p=require("obsidian");var X=[/blackhole/i,/vb-cable/i,/vb cable/i,/loopback/i,/soundflower/i,/virtual audio/i,/screen ?capture/i],T=class S{constructor(){this.mediaRecorder=null;this.audioChunks=[];this.stream=null;this.secondaryStream=null;this.startTime=0;this.pausedDuration=0;this.pauseStartTime=0;this.durationInterval=null;this.audioContext=null;this.analyser=null;this.levelInterval=null;this.lastExtractedChunkIndex=0;this.mimeTypeCache="audio/webm";this.activeCaptureMode="full_call";this.activeHasVirtualDevice=!1;this.activeSystemAudioMethod=null;this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0};this.stateCallback=null;this.eventCallback=null;this.deviceChangeHandler=null;this.activeDeviceLabel="";this.silenceCheckInterval=null;this.consecutiveSilentChecks=0;this.silenceAlerted=!1;this.levelHistory=[];this.trackingLevels=!1}static{this.SILENCE_THRESHOLD=5}static{this.SILENCE_ALERT_AFTER=6}static{this.HEADPHONE_PATTERNS=[/airpods/i,/beats/i,/headphone/i,/headset/i,/earbuds/i,/bluetooth/i,/bose/i,/sony wh/i,/jabra/i,/galaxy buds/i]}onStateChange(i){this.stateCallback=i}onEvent(i){this.eventCallback=i}emitEvent(i){if(this.eventCallback)try{this.eventCallback(i)}catch(t){console.error("[AudioRecorder] Event handler error:",t)}}static isHeadphoneDevice(i){return i?S.HEADPHONE_PATTERNS.some(t=>t.test(i)):!1}static isIOSOrSafari(){let i=navigator.userAgent,t=/iPad|iPhone|iPod/.test(i)&&!window.MSStream,e=/^((?!chrome|android).)*safari/i.test(i);return t||e}getSupportedMimeType(){let i=S.isIOSOrSafari(),t=i?["audio/mp4","audio/mp4;codecs=aac","audio/aac","audio/webm;codecs=opus","audio/webm"]:["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];for(let e of t)if(MediaRecorder.isTypeSupported(e))return console.log(`[AudioRecorder] Using MIME type: ${e} (iOS/Safari: ${i})`),e;return i?"audio/mp4":"audio/webm"}async startRecording(i){if(this.state.isRecording)throw new Error("Already recording");let t=i?.captureMode??"full_call";this.activeCaptureMode=t,this.activeHasVirtualDevice=!1,this.activeSystemAudioMethod=null;try{let e=S.isIOSOrSafari(),n;e?n={echoCancellation:!0,noiseSuppression:!0}:t==="full_call"?n={echoCancellation:!1,noiseSuppression:!1,autoGainControl:!0,sampleRate:48e3,channelCount:1}:n={echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0,sampleRate:48e3,channelCount:1},i?.micDeviceId&&(n.deviceId={exact:i.micDeviceId});let a=await navigator.mediaDevices.getUserMedia({audio:n});console.log(`[AudioRecorder] Mic granted | mode=${t} | echoCancellation=${t!=="full_call"}`);let r=a,s=i?.systemAudioDeviceId||(await S.detectVirtualAudioDevice())?.deviceId;if(s&&!e)try{let c=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:s},echoCancellation:!1,noiseSuppression:!1,autoGainControl:!1}});this.audioContext=new AudioContext;let l=this.audioContext.createMediaStreamSource(a),d=this.audioContext.createMediaStreamSource(c),u=this.audioContext.createMediaStreamDestination();l.connect(u),d.connect(u),r=u.stream,this.secondaryStream=c,this.activeHasVirtualDevice=!0,this.activeSystemAudioMethod="virtual_device",console.log("[AudioRecorder] Virtual device detected \u2014 dual-stream capture active")}catch(c){console.log(`[AudioRecorder] Virtual device open failed (${c.message}), continuing with mic only`)}if(!this.activeHasVirtualDevice&&t==="full_call"&&!e)try{console.log("[AudioRecorder] No virtual device \u2014 attempting native system audio capture");let c=await S.captureSystemAudio();if(c){this.audioContext=this.audioContext||new AudioContext;let l=this.audioContext.createMediaStreamSource(a),d=this.audioContext.createMediaStreamSource(c.stream),u=this.audioContext.createMediaStreamDestination();l.connect(u),d.connect(u),r=u.stream,this.secondaryStream=c.stream,this.activeHasVirtualDevice=!0,this.activeSystemAudioMethod=c.method,console.log(`[AudioRecorder] Native system audio via ${c.method} \u2014 dual-stream active`)}}catch(c){console.log(`[AudioRecorder] Native system audio failed (${c.message}), continuing with mic only`)}this.stream=r,this.setupAudioAnalysis();let o=this.getSupportedMimeType();this.mimeTypeCache=o,this.mediaRecorder=new MediaRecorder(this.stream,{mimeType:o,audioBitsPerSecond:128e3}),this.audioChunks=[],this.lastExtractedChunkIndex=0,this.mediaRecorder.ondataavailable=c=>{c.data.size>0&&this.audioChunks.push(c.data)},this.mediaRecorder.start(1e3),this.startTime=Date.now(),this.pausedDuration=0,this.state={isRecording:!0,isPaused:!1,duration:0,audioLevel:0},this.startDurationTracking(),this.startLevelTracking(),this.startLevelHistoryTracking(),this.captureActiveDeviceLabel(r),this.startDeviceMonitoring(),this.startSilenceWatchdog(),this.notifyStateChange()}catch(e){throw this.cleanup(),new Error(`Failed to start recording: ${e.message}`)}}static async detectVirtualAudioDevice(){try{let i=await navigator.mediaDevices.enumerateDevices();for(let t of i)if(t.kind==="audioinput"){for(let e of X)if(e.test(t.label))return{deviceId:t.deviceId,label:t.label,isVirtual:!0}}}catch(i){console.warn("[AudioRecorder] enumerateDevices failed:",i)}return null}static async getAvailableDevices(){try{return(await navigator.mediaDevices.enumerateDevices()).filter(t=>t.kind==="audioinput").map(t=>{let e=X.some(n=>n.test(t.label));return{deviceId:t.deviceId,label:t.label||"Unknown Microphone",isVirtual:e}})}catch(i){return console.warn("[AudioRecorder] enumerateDevices failed:",i),[]}}static{this._displayMediaHandlerReady=!1}static async setupDisplayMediaHandler(){if(S._displayMediaHandlerReady)return!0;let i=window.require;if(!i)return!1;try{let t=i("@electron/remote");if(t?.session?.defaultSession?.setDisplayMediaRequestHandler&&t?.desktopCapturer?.getSources)return t.session.defaultSession.setDisplayMediaRequestHandler(async(e,n)=>{try{let a=await t.desktopCapturer.getSources({types:["screen"],thumbnailSize:{width:0,height:0}});n(a?.length?{video:a[0],audio:"loopback"}:null)}catch{n(null)}}),S._displayMediaHandlerReady=!0,console.log("[AudioRecorder] Display media handler installed via @electron/remote \u2014 loopback audio enabled"),!0}catch(t){console.log(`[AudioRecorder] @electron/remote handler setup failed: ${t.message}`)}try{let e=i("electron")?.remote;if(e?.session?.defaultSession?.setDisplayMediaRequestHandler&&e?.desktopCapturer?.getSources)return e.session.defaultSession.setDisplayMediaRequestHandler(async(n,a)=>{try{let r=await e.desktopCapturer.getSources({types:["screen"],thumbnailSize:{width:0,height:0}});a(r?.length?{video:r[0],audio:"loopback"}:null)}catch{a(null)}}),S._displayMediaHandlerReady=!0,console.log("[AudioRecorder] Display media handler installed via electron.remote \u2014 loopback audio enabled"),!0}catch(t){console.log(`[AudioRecorder] electron.remote handler setup failed: ${t.message}`)}return console.log("[AudioRecorder] Could not set up display media handler \u2014 remote module not accessible"),!1}static async tryDesktopCapturerWithSource(){let i=window.require;if(!i)return null;let t=null;try{let e=i("electron")?.desktopCapturer;e?.getSources&&(t=await e.getSources({types:["screen"],thumbnailSize:{width:0,height:0}}),t?.length&&console.log(`[AudioRecorder] desktopCapturer.getSources: ${t.length} screen(s)`))}catch(e){console.log(`[AudioRecorder] direct desktopCapturer failed: ${e.message}`)}if(!t?.length)try{let e=i("@electron/remote")?.desktopCapturer;e?.getSources&&(t=await e.getSources({types:["screen"],thumbnailSize:{width:0,height:0}}),t?.length&&console.log(`[AudioRecorder] @electron/remote desktopCapturer: ${t.length} screen(s)`))}catch{}if(!t?.length)try{let e=i("electron")?.remote?.desktopCapturer;e?.getSources&&(t=await e.getSources({types:["screen"],thumbnailSize:{width:0,height:0}}),t?.length&&console.log(`[AudioRecorder] electron.remote desktopCapturer: ${t.length} screen(s)`))}catch{}if(!t?.length)try{let e=i("electron")?.ipcRenderer;e?.invoke&&(t=await e.invoke("DESKTOP_CAPTURER_GET_SOURCES",{types:["screen"]}),t?.length&&console.log(`[AudioRecorder] IPC desktopCapturer: ${t.length} screen(s)`))}catch{}if(!t?.length)return console.log("[AudioRecorder] No desktopCapturer path yielded sources"),null;try{let e=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:"desktop",chromeMediaSourceId:t[0].id}},video:{mandatory:{chromeMediaSource:"desktop",chromeMediaSourceId:t[0].id,maxWidth:1,maxHeight:1,maxFrameRate:1}}});e.getVideoTracks().forEach(a=>a.stop());let n=e.getAudioTracks();if(n.length>0)return console.log("[AudioRecorder] desktopCapturer + getUserMedia audio capture active"),new MediaStream(n)}catch(e){console.log(`[AudioRecorder] getUserMedia with chromeMediaSource failed: ${e.message}`)}return null}static async tryDesktopCapturerNoSourceId(){try{let i=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:"desktop"}},video:{mandatory:{chromeMediaSource:"desktop",maxWidth:1,maxHeight:1,maxFrameRate:1}}});i.getVideoTracks().forEach(e=>e.stop());let t=i.getAudioTracks();if(t.length>0)return console.log("[AudioRecorder] getUserMedia chromeMediaSource:desktop (no source ID) audio active"),new MediaStream(t)}catch(i){console.log(`[AudioRecorder] chromeMediaSource:desktop (no source) failed: ${i.message}`)}return null}static async tryGetDisplayMedia(){if(!navigator.mediaDevices?.getDisplayMedia)return null;try{let i=await navigator.mediaDevices.getDisplayMedia({audio:{suppressLocalAudioPlayback:!1},video:{width:{ideal:1},height:{ideal:1},frameRate:{ideal:1}},systemAudio:"include"});i.getVideoTracks().forEach(e=>e.stop());let t=i.getAudioTracks();if(t.length>0)return console.log(`[AudioRecorder] getDisplayMedia audio capture active (handler=${S._displayMediaHandlerReady})`),new MediaStream(t);console.log("[AudioRecorder] getDisplayMedia returned no audio tracks")}catch(i){i.name==="NotAllowedError"?console.log("[AudioRecorder] getDisplayMedia: not allowed (no handler set or user denied)"):console.log(`[AudioRecorder] getDisplayMedia failed: ${i.name}: ${i.message}`)}return null}static async captureSystemAudio(){let i=await S.tryDesktopCapturerWithSource();if(i)return{stream:i,method:"electron"};let t=await S.tryDesktopCapturerNoSourceId();if(t)return{stream:t,method:"electron"};let e=await S.tryGetDisplayMedia();return e?{stream:e,method:"display_media"}:(console.log("[AudioRecorder] All system audio strategies exhausted \u2014 mic only"),null)}static async probeSystemAudioCapabilities(){let i={electronAvailable:!1,desktopCapturerAvailable:!1,desktopCapturerSources:0,remoteAvailable:!1,remoteSessionAvailable:!1,ipcRendererAvailable:!1,getDisplayMediaAvailable:!1,electronVersion:null,chromiumVersion:null,platform:window.process?.platform||navigator.platform||"unknown",handlerSetupResult:"not attempted",bestPath:"mic_only"},t=window.require;if(!t)return i.bestPath="mic_only (require not available)",i;try{let e=t("electron");if(i.electronAvailable=!!e,i.ipcRendererAvailable=!!e?.ipcRenderer?.invoke,e?.desktopCapturer?.getSources){i.desktopCapturerAvailable=!0;try{let n=await e.desktopCapturer.getSources({types:["screen"],thumbnailSize:{width:0,height:0}});i.desktopCapturerSources=n?.length||0}catch{}}}catch{}try{let e=t("@electron/remote");i.remoteAvailable=!!e,i.remoteSessionAvailable=!!e?.session?.defaultSession?.setDisplayMediaRequestHandler}catch{}if(!i.remoteAvailable)try{let e=t("electron")?.remote;i.remoteAvailable=!!e,i.remoteSessionAvailable=!!e?.session?.defaultSession?.setDisplayMediaRequestHandler}catch{}try{let e=window.process?.versions;i.electronVersion=e?.electron||null,i.chromiumVersion=e?.chrome||null}catch{}if(i.getDisplayMediaAvailable=!!navigator.mediaDevices?.getDisplayMedia,i.remoteSessionAvailable){let e=await S.setupDisplayMediaHandler();i.handlerSetupResult=e?"SUCCESS":"failed"}else i.handlerSetupResult="remote not available";return i.desktopCapturerAvailable&&i.desktopCapturerSources>0?i.bestPath="electron_desktopCapturer (zero-click)":S._displayMediaHandlerReady?i.bestPath="getDisplayMedia + loopback handler (zero-click)":i.getDisplayMediaAvailable?i.bestPath="getDisplayMedia (may show system picker)":i.bestPath="mic_only",i}getSystemAudioMethod(){return this.activeSystemAudioMethod}static isHandlerReady(){return S._displayMediaHandlerReady}setupAudioAnalysis(){if(this.stream)try{this.audioContext=new AudioContext;let i=this.audioContext.createMediaStreamSource(this.stream);this.analyser=this.audioContext.createAnalyser(),this.analyser.fftSize=256,i.connect(this.analyser)}catch(i){console.warn("Failed to set up audio analysis:",i)}}startDurationTracking(){this.durationInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused){let i=Date.now()-this.startTime-this.pausedDuration;this.state.duration=Math.floor(i/1e3),this.notifyStateChange(),this.state.duration>=5400&&(console.log("[Eudia] Maximum recording duration reached (90 minutes) \u2014 auto-stopping"),this.stop())}},100)}startLevelTracking(){if(!this.analyser)return;let i=new Uint8Array(this.analyser.frequencyBinCount);this.levelInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused&&this.analyser){this.analyser.getByteFrequencyData(i);let t=0;for(let n=0;n<i.length;n++)t+=i[n];let e=t/i.length;this.state.audioLevel=Math.min(100,Math.round(e/255*100*2)),this.notifyStateChange()}},50)}startDeviceMonitoring(){this.deviceChangeHandler=async()=>{if(this.state.isRecording)try{let t=(await navigator.mediaDevices.enumerateDevices()).filter(r=>r.kind==="audioinput"),e=t.map(r=>r.label),n=this.activeDeviceLabel&&!e.some(r=>r===this.activeDeviceLabel);this.emitEvent({type:"deviceChanged",newDevices:t.map(r=>({deviceId:r.deviceId,label:r.label,isVirtual:X.some(s=>s.test(r.label))})),activeDeviceLost:!!n});let a=t.find(r=>S.isHeadphoneDevice(r.label)&&r.label!==this.activeDeviceLabel);a&&this.emitEvent({type:"headphoneDetected",deviceLabel:a.label})}catch(i){console.warn("[AudioRecorder] Device change detection failed:",i)}},navigator.mediaDevices.addEventListener("devicechange",this.deviceChangeHandler)}stopDeviceMonitoring(){this.deviceChangeHandler&&(navigator.mediaDevices.removeEventListener("devicechange",this.deviceChangeHandler),this.deviceChangeHandler=null)}startSilenceWatchdog(){this.consecutiveSilentChecks=0,this.silenceAlerted=!1,this.silenceCheckInterval=setInterval(()=>{!this.state.isRecording||this.state.isPaused||(this.state.audioLevel<S.SILENCE_THRESHOLD?(this.consecutiveSilentChecks++,this.consecutiveSilentChecks>=S.SILENCE_ALERT_AFTER&&!this.silenceAlerted&&(this.silenceAlerted=!0,this.emitEvent({type:"silenceDetected",durationSeconds:this.consecutiveSilentChecks*5}))):(this.silenceAlerted&&this.emitEvent({type:"audioRestored"}),this.consecutiveSilentChecks=0,this.silenceAlerted=!1))},5e3)}stopSilenceWatchdog(){this.silenceCheckInterval&&(clearInterval(this.silenceCheckInterval),this.silenceCheckInterval=null)}captureActiveDeviceLabel(i){let t=i.getAudioTracks()[0];this.activeDeviceLabel=t?.label||"",S.isHeadphoneDevice(this.activeDeviceLabel)&&this.emitEvent({type:"headphoneDetected",deviceLabel:this.activeDeviceLabel})}pauseRecording(){!this.state.isRecording||this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="recording"&&(this.mediaRecorder.pause(),this.pauseStartTime=Date.now(),this.state.isPaused=!0,this.notifyStateChange())}resumeRecording(){!this.state.isRecording||!this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="paused"&&(this.mediaRecorder.resume(),this.pausedDuration+=Date.now()-this.pauseStartTime,this.state.isPaused=!1,this.notifyStateChange())}async stopRecording(){return new Promise((i,t)=>{if(!this.mediaRecorder||!this.state.isRecording){t(new Error("Not currently recording"));return}let e=this.mediaRecorder.mimeType,n=this.state.duration,a=this.activeCaptureMode,r=this.activeHasVirtualDevice,s=this.activeSystemAudioMethod,o=!1,c=d=>{let u=new Date,y=u.toISOString().split("T")[0],m=u.toTimeString().split(" ")[0].replace(/:/g,"-"),g=e.includes("webm")?"webm":e.includes("mp4")?"m4a":e.includes("ogg")?"ogg":"webm";return{audioBlob:d,duration:n,mimeType:e,filename:`recording-${y}-${m}.${g}`,captureMode:a,hasVirtualDevice:r,systemAudioMethod:s}},l=setTimeout(()=>{if(!o){o=!0,console.warn("AudioRecorder: onstop timeout, forcing completion");try{let d=new Blob(this.audioChunks,{type:e});this.cleanup(),i(c(d))}catch{this.cleanup(),t(new Error("Failed to process recording after timeout"))}}},1e4);this.mediaRecorder.onstop=()=>{if(!o){o=!0,clearTimeout(l);try{console.log(`[AudioRecorder] Chunks collected: ${this.audioChunks.length}`);let d=new Blob(this.audioChunks,{type:e});console.log(`[AudioRecorder] Blob size: ${d.size} bytes`),this.cleanup(),i(c(d))}catch(d){this.cleanup(),t(d)}}},this.mediaRecorder.onerror=d=>{o||(o=!0,clearTimeout(l),this.cleanup(),t(new Error("Recording error occurred")))},this.mediaRecorder.state==="recording"&&this.mediaRecorder.requestData(),setTimeout(()=>{this.mediaRecorder&&this.mediaRecorder.state!=="inactive"&&this.mediaRecorder.stop()},100)})}cancelRecording(){this.cleanup()}cleanup(){this.durationInterval&&(clearInterval(this.durationInterval),this.durationInterval=null),this.levelInterval&&(clearInterval(this.levelInterval),this.levelInterval=null),this.stopDeviceMonitoring(),this.stopSilenceWatchdog(),this.audioContext&&(this.audioContext.close().catch(()=>{}),this.audioContext=null,this.analyser=null),this.stream&&(this.stream.getTracks().forEach(i=>i.stop()),this.stream=null),this.secondaryStream&&(this.secondaryStream.getTracks().forEach(i=>i.stop()),this.secondaryStream=null),this.mediaRecorder=null,this.audioChunks=[],this.activeDeviceLabel="",this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0},this.notifyStateChange()}getState(){return{...this.state}}static isSupported(){if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder)return!1;let t=["audio/webm","audio/mp4","audio/ogg","audio/webm;codecs=opus"].some(e=>MediaRecorder.isTypeSupported(e));return t||console.warn("[AudioRecorder] No supported audio formats found"),t}static getMobileInstructions(){return this.isIOSOrSafari()?"For best results on iOS, ensure you have granted microphone permissions in Settings > Privacy > Microphone.":null}notifyStateChange(){this.stateCallback&&this.stateCallback({...this.state})}static formatDuration(i){let t=Math.floor(i/60),e=i%60;return`${t.toString().padStart(2,"0")}:${e.toString().padStart(2,"0")}`}static async blobToBase64(i){return new Promise((t,e)=>{let n=new FileReader;n.onload=()=>{let r=n.result.split(",")[1];t(r)},n.onerror=e,n.readAsDataURL(i)})}static async blobToArrayBuffer(i){return i.arrayBuffer()}async start(i){return this.startRecording(i)}async stop(){return this.stopRecording()}pause(){return this.pauseRecording()}resume(){return this.resumeRecording()}cancel(){return this.cancelRecording()}isRecording(){return this.state.isRecording}extractNewChunks(){if(!this.state.isRecording||this.audioChunks.length===0)return null;let i=this.audioChunks.slice(this.lastExtractedChunkIndex);return i.length===0?null:(this.lastExtractedChunkIndex=this.audioChunks.length,new Blob(i,{type:this.mimeTypeCache}))}getAllChunksAsBlob(){return this.audioChunks.length===0?null:new Blob(this.audioChunks,{type:this.mimeTypeCache})}getDuration(){return this.state.duration}getMimeType(){return this.mimeTypeCache}startLevelHistoryTracking(){this.levelHistory=[],this.trackingLevels=!0}recordLevelSample(){this.trackingLevels&&this.levelHistory.push(this.state.audioLevel)}getAudioDiagnostic(){if(this.levelHistory.length===0)return{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:100,warning:"Unable to analyze audio levels - recording may be too short"};let i=this.levelHistory.reduce((r,s)=>r+s,0)/this.levelHistory.length,t=Math.max(...this.levelHistory),e=this.levelHistory.filter(r=>r<5).length,n=Math.round(e/this.levelHistory.length*100),a=null;return t<5?a="SILENT AUDIO: No audio was detected during recording. Check your microphone settings and ensure Obsidian has microphone permission.":i<10&&n>80?a="VERY LOW AUDIO: Audio levels were extremely low. The transcription may not be accurate. Check your microphone or move closer to it.":n>90&&(a="MOSTLY SILENT: Over 90% of the recording had no audio. Make sure you're capturing the meeting audio, not just silence."),{hasAudio:t>=5,averageLevel:Math.round(i),peakLevel:t,silentPercent:n,warning:a}}static async analyzeAudioBlob(i){try{let t=new AudioContext,e=await i.arrayBuffer(),n;try{n=await t.decodeAudioData(e)}catch{return await t.close(),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:"Could not analyze audio format. Proceeding with transcription."}}let a=n.getChannelData(0),r=0,s=0,o=0,c=.01,l=100,d=0;for(let b=0;b<a.length;b+=l){let v=Math.abs(a[b]);r+=v,v>s&&(s=v),v<c&&o++,d++}await t.close();let u=r/d,y=Math.round(o/d*100),m=Math.round(u*100*10),g=Math.round(s*100),O=null;return s<.01?O='SILENT AUDIO DETECTED: The recording appears to contain only silence. This typically causes Whisper to hallucinate random text like "Yes. Yes. Yes." Check your audio input source.':u<.005&&y>95?O="NEAR-SILENT AUDIO: The recording is almost entirely silent. The transcription will likely be inaccurate.":y>90&&(O="MOSTLY SILENT: Over 90% of the recording is silent. Consider checking your audio setup."),{hasAudio:s>=.01,averageLevel:m,peakLevel:g,silentPercent:y,warning:O}}catch(t){return console.error("Audio analysis failed:",t),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:null}}}};var P=require("obsidian");var Z=class{constructor(){this.salesforceAccounts=[]}setAccounts(i){this.salesforceAccounts=i}detectAccount(i,t,e){if(i){let n=this.detectFromTitle(i);if(n.confidence>=70)return n}if(e){let n=this.detectFromFilePath(e);if(n.confidence>=70)return n}if(t&&t.length>0){let n=this.detectFromAttendees(t);if(n.confidence>=50)return n}return{account:null,accountId:null,confidence:0,source:"none",evidence:"No account detected from available context"}}detectFromTitle(i){if(!i)return{account:null,accountId:null,confidence:0,source:"title",evidence:"No title"};let t=[{regex:/^([A-Za-z0-9][^-–—]+?)\s*[-–—]\s*(?:[A-Z][a-z]+|[A-Za-z]{2,})/,confidence:85},{regex:/(?:call|meeting|sync|check-in|demo|discovery)\s+(?:with|re:?|@)\s+([^-–—]+?)(?:\s*[-–—]|$)/i,confidence:80},{regex:/^([A-Za-z][^-–—]+?)\s+(?:discovery|demo|review|kickoff|intro|onboarding|sync)\s*(?:call)?$/i,confidence:75},{regex:/^([^:]+?):\s+/i,confidence:70},{regex:/^\[([^\]]+)\]/,confidence:75}],e=["weekly","daily","monthly","internal","team","1:1","one on one","standup","sync","meeting","call","notes","monday","tuesday","wednesday","thursday","friday","untitled","new","test"];for(let n of t){let a=i.match(n.regex);if(a&&a[1]){let r=a[1].trim();if(e.some(o=>r.toLowerCase()===o)||r.length<2)continue;let s=this.fuzzyMatchSalesforce(r);return s?{account:s.name,accountId:s.id,confidence:Math.min(n.confidence+10,100),source:"salesforce_match",evidence:`Matched "${r}" from title to Salesforce account "${s.name}"`}:{account:r,accountId:null,confidence:n.confidence,source:"title",evidence:"Extracted from meeting title pattern"}}}return{account:null,accountId:null,confidence:0,source:"title",evidence:"No pattern matched"}}detectFromFilePath(i){let t=i.match(/Accounts\/([^\/]+)\//i);if(t&&t[1]){let e=t[1].trim(),n=this.fuzzyMatchSalesforce(e);return n?{account:n.name,accountId:n.id,confidence:95,source:"salesforce_match",evidence:`File in account folder "${e}" matched to "${n.name}"`}:{account:e,accountId:null,confidence:85,source:"title",evidence:`File located in Accounts/${e} folder`}}return{account:null,accountId:null,confidence:0,source:"none",evidence:"Not in Accounts folder"}}detectFromAttendees(i){let t=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com"],e=new Set;for(let s of i){let c=s.toLowerCase().match(/@([a-z0-9.-]+)/);if(c){let l=c[1];!l.includes("eudia.com")&&!t.includes(l)&&e.add(l)}}if(e.size===0)return{account:null,accountId:null,confidence:0,source:"attendee_domain",evidence:"No external domains"};for(let s of e){let o=s.split(".")[0],c=o.charAt(0).toUpperCase()+o.slice(1),l=this.fuzzyMatchSalesforce(c);if(l)return{account:l.name,accountId:l.id,confidence:75,source:"salesforce_match",evidence:`Matched attendee domain ${s} to "${l.name}"`}}let n=Array.from(e)[0],a=n.split(".")[0];return{account:a.charAt(0).toUpperCase()+a.slice(1),accountId:null,confidence:50,source:"attendee_domain",evidence:`Guessed from external attendee domain: ${n}`}}fuzzyMatchSalesforce(i){if(!i||this.salesforceAccounts.length===0)return null;let t=i.toLowerCase().trim();for(let e of this.salesforceAccounts)if(e.name?.toLowerCase()===t)return e;for(let e of this.salesforceAccounts)if(e.name?.toLowerCase().startsWith(t))return e;for(let e of this.salesforceAccounts)if(e.name?.toLowerCase().includes(t))return e;for(let e of this.salesforceAccounts)if(t.includes(e.name?.toLowerCase()))return e;return null}suggestAccounts(i,t=10){if(!i||i.length<2)return this.salesforceAccounts.slice(0,t).map(a=>({...a,score:0}));let e=i.toLowerCase(),n=[];for(let a of this.salesforceAccounts){let r=a.name?.toLowerCase()||"",s=0;r===e?s=100:r.startsWith(e)?s=90:r.includes(e)?s=70:e.includes(r)&&(s=50),s>0&&n.push({...a,score:s})}return n.sort((a,r)=>r.score-a.score).slice(0,t)}},Je=new Z,Ee=["pipeline review","pipeline call","weekly pipeline","forecast call","forecast review","deal review","opportunity review","sales review","pipeline sync","forecast sync","deal sync","pipeline update","forecast meeting"];function de(S,i){if(S){let t=S.toLowerCase();for(let e of Ee)if(t.includes(e))return{isPipelineMeeting:!0,confidence:95,evidence:`Title contains "${e}"`}}if(i&&i.length>=2){let t=["eudia.com","johnsonhana.com"];if(i.every(n=>{let a=n.toLowerCase().split("@")[1]||"";return t.some(r=>a.includes(r))})&&i.length>=3){if(S){let n=S.toLowerCase();if(["sync","review","update","weekly","team","forecast"].some(s=>n.includes(s)))return{isPipelineMeeting:!0,confidence:70,evidence:`All internal attendees (${i.length}) with team meeting signal`}}return{isPipelineMeeting:!1,confidence:40,evidence:"All internal attendees but no clear pipeline signal"}}}return{isPipelineMeeting:!1,confidence:0,evidence:"No pipeline meeting indicators found"}}function ke(S,i){let t="";return(i?.account||i?.opportunities?.length)&&(t=`
ACCOUNT CONTEXT (use to inform your analysis):
${i.account?`- Account: ${i.account.name}`:""}
${i.account?.owner?`- Account Owner: ${i.account.owner}`:""}
${i.opportunities?.length?`- Open Opportunities: ${i.opportunities.map(e=>`${e.name} (${e.stage}, $${(e.acv/1e3).toFixed(0)}k)`).join("; ")}`:""}
${i.contacts?.length?`- Known Contacts: ${i.contacts.slice(0,5).map(e=>`${e.name} - ${e.title}`).join("; ")}`:""}
`),`You are a senior sales intelligence analyst for Eudia, an AI-powered legal technology company. Your role is to extract precise, actionable intelligence from sales meeting transcripts.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies. Our products help in-house legal teams work faster on contracting, compliance, and M&A due diligence. We sell to CLOs, General Counsels, VP Legal, Legal Ops Directors, and Deputy GCs.

${S?`CURRENT ACCOUNT: ${S}`:""}
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
- Action items have clear owners`}function Te(S,i){let t="";return i?.account&&(t=`
ACCOUNT CONTEXT:
- Account: ${i.account.name}
${i.account.owner?`- Owner: ${i.account.owner}`:""}
`),`You are a sales intelligence analyst for Eudia, an AI-powered legal technology company. You are analyzing a DEMO or PRESENTATION call.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies \u2014 contracting, compliance, and M&A due diligence.

${S?`CURRENT ACCOUNT: ${S}`:""}
${t}

CRITICAL RULES:
1. Only include information explicitly stated in the transcript.
2. Include direct quotes where impactful.
3. Focus on the prospect's REACTIONS to what was shown \u2014 not describing what Eudia showed.

OUTPUT FORMAT:

## Summary
3-5 bullet points: What was demonstrated, overall reception, and key takeaways.

## Attendees
- **[Name]** - [Title/Role] ([Company])

## Demo Highlights
What resonated most? What got the strongest positive reaction?
- **[Feature/Capability]**: "[Prospect reaction quote]"

## Questions Asked
Questions the prospect asked during or after the demo:
- **[Question]**: [Answer given or "Follow-up needed"]

## Feature Interest
Which Eudia capabilities generated the most interest:
- [Feature]: [Evidence of interest \u2014 quote or reaction]

## Objections & Concerns
Any pushback, hesitations, or concerns raised:
- **[Concern]**: "[Quote]" \u2014 [How it was addressed or "Unresolved"]

## Next Steps
- [ ] [Action] - **Owner:** [Name] - **Due:** [Date if mentioned]

## Action Items (Internal)
- [ ] [Follow-up for Eudia team]
`}function We(S,i){let t="";return i?.account&&(t=`
ACCOUNT CONTEXT:
- Account: ${i.account.name}
${i.account.owner?`- Owner: ${i.account.owner}`:""}
`),`You are a business meeting analyst. You are analyzing a GENERAL CHECK-IN or relationship meeting \u2014 not a sales discovery or demo.

${S?`ACCOUNT: ${S}`:""}
${t}

CRITICAL RULES:
1. Only include information explicitly stated in the transcript.
2. Keep the tone professional but conversational \u2014 this is a relationship meeting, not a formal sales call.
3. Focus on updates, sentiment, and action items.

OUTPUT FORMAT:

## Summary
3-5 bullet points covering: purpose of the meeting, key topics discussed, overall sentiment and relationship health.

## Attendees
- **[Name]** - [Title/Role] ([Company])

## Key Updates
Important information shared by either side:
- **[Topic]**: [What was shared]

## Discussion Points
Main topics covered in the conversation:
- [Topic]: [Key points and any decisions made]

## Sentiment & Relationship
Overall tone of the meeting \u2014 are they engaged, distracted, enthusiastic, frustrated?
- [Assessment with evidence]

## Action Items
- [ ] [Action] - **Owner:** [Name] - **Due:** [Date if mentioned]

## Follow-Ups
Items to track or revisit:
- [Item]: [Context and timeline]
`}function Ie(S,i){let t="";return i?.account&&(t=`
ACCOUNT CONTEXT:
- Account: ${i.account.name}
${i.account.owner?`- Owner: ${i.account.owner}`:""}
`),`You are a Customer Success analyst for Eudia, an AI-powered legal technology company. You are analyzing a CUSTOMER SUCCESS call \u2014 not a sales discovery or demo.

Focus on the customer's experience, adoption, satisfaction, feature needs, and relationship health. This is NOT a sales qualification call.

${S?`ACCOUNT: ${S}`:""}
${t}

CRITICAL RULES:
1. Only include information explicitly stated in the transcript.
2. Focus on the CUSTOMER'S perspective \u2014 what they need, what's working, what isn't.
3. Capture exact quotes for feature requests and pain points.
4. Note who spoke more \u2014 if the CSM dominated the conversation, flag it.

OUTPUT FORMAT:

## Summary
3-5 bullet points: Account health assessment, key topics, customer sentiment, overall takeaway.

## Attendees
- **[Name]** - [Title/Role] ([Company])

## Customer Health Signals
Rate the overall health of this account based on the conversation:
- **Engagement Level**: [High/Medium/Low] \u2014 [Evidence]
- **Satisfaction**: [Positive/Neutral/Concerned] \u2014 [Evidence]
- **Adoption**: [Expanding/Stable/Declining] \u2014 [Evidence]
- **Renewal Risk**: [Low/Medium/High] \u2014 [Evidence]

## Feature Requests & Pain Points
For each feature request or pain point raised by the customer:
- **[Request/Pain]**: "[Direct quote]" \u2014 **Priority:** [Critical/High/Medium/Low] \u2014 **Product Area:** [Contracting/Compliance/M&A/Sigma/Platform]

If none raised, write: "No feature requests or pain points surfaced."

## Adoption & Usage
What the customer shared about how they're using the product:
- **Current Usage**: [How they're using it, which teams, volume]
- **Wins**: [Successes they mentioned]
- **Gaps**: [Where they expected more or aren't using it]
- **Expansion Opportunities**: [Teams, use cases, or products not yet adopted]

## Talk Time Balance
Estimate who drove the conversation:
- CSM/Eudia: ~[X]%
- Customer: ~[X]%
- **Assessment**: [Was the customer given enough space to share? Or did we dominate?]

## Action Items
- [ ] [Action] - **Owner:** [Name] - **Due:** [Date if mentioned]

## Renewal & Expansion Signals
- **Contract Status**: [Any mention of renewal timeline, terms, or expansion]
- **Budget Signals**: [Any mention of budget, headcount, or procurement]
- **Champion Health**: [Is our internal champion still engaged and empowered?]

## Escalations
Issues requiring immediate attention:
- **[Issue]**: [Severity] \u2014 [Who raised it, what's needed]

If none, write: "No escalations identified."

## Follow-Ups
Items to track or revisit:
- [Item]: [Context and timeline]
`}function je(){return`You are a business meeting analyst. You are analyzing an INTERNAL team call \u2014 not a customer-facing meeting.

This is an internal discussion between team members. Focus on decisions made, action items assigned, strategy discussed, and any blockers or escalations raised.

OUTPUT FORMAT:

## Summary
3-5 bullet points: Key topics discussed, decisions made, and overall takeaways.

## Action Items
| Owner | Action | Due/Timeline |
|-------|--------|-------------|
| [Name] | [What they committed to] | [When] |

## Attendees
- **[Name]** - [Role/Team]

## Key Decisions
Decisions made during this meeting:
- **[Decision]**: [Context and rationale]

## Key Numbers & Metrics
Any specific numbers, targets, revenue figures, pipeline data, or KPIs mentioned:
- **[Metric]**: [Value] \u2014 [Context]

If no specific numbers were discussed, write: "No specific metrics discussed."

## Discussion Topics
For each major topic discussed:
### [Topic]
- What was discussed
- Key points raised
- Any concerns or blockers

## Strategic Takeaways
What does this discussion mean for the broader business? Consider:
- GTM motion implications (new market segments, competitive positioning, pricing changes)
- Product or roadmap signals (feature priorities, stability concerns, customer feedback patterns)
- Team or process changes (hiring, enablement, workflow adjustments)

If the meeting was purely tactical with no strategic implications, write: "Tactical meeting \u2014 no strategic implications identified."

## Blockers & Escalations
Issues that need attention or were escalated:
- **[Issue]**: [Who raised it, what's needed]

If none were raised, write: "No blockers or escalations identified."

## Parking Lot
Topics that were raised but deferred or need further discussion:
- **[Topic]**: [Why it was deferred, who should follow up]

If everything was resolved, write: "All topics addressed."

## Follow-ups
Items to revisit or track:
- [Item] \u2014 [Owner if mentioned]

ANALYSIS RULES:
1. Distinguish between decisions (firm) and discussions (exploratory).
2. Capture action items with clear ownership and timelines.
3. Note any disagreements or unresolved points.
4. Keep the tone neutral and factual.
5. If specific accounts, deals, or numbers are mentioned, capture them accurately.
6. For strategic takeaways, only include implications that were actually discussed or clearly implied \u2014 do not speculate.`}function $e(S){return`You are a sales operations analyst producing the weekly pipeline review summary for Eudia, an AI-powered legal technology company. You are processing the transcript of an internal team pipeline review meeting.
${S?`

SALESFORCE PIPELINE DATA (current as of today):
${S}

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
10. If the meeting discussed general topics like demo stability, growth motion, enablement, or hiring \u2014 capture these in the Growth & Cross-Team section, not mixed into account tables.`}var q=class S{constructor(i){this.serverUrl=i}setServerUrl(i){this.serverUrl=i}async transcribeAndSummarize(i,t,e,n,a,r,s){try{let o=a?.meetingType==="pipeline_review",c;o?c=$e(a?.pipelineContext):s==="demo"?c=Te(e,a):s==="general"?c=We(e,a):s==="internal"?c=je():s==="cs"?c=Ie(e,a):c=ke(e,a);let l=await(0,P.requestUrl)({url:`${this.serverUrl}/api/transcribe-and-summarize`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:i,mimeType:t,accountName:o?"Pipeline Review":e,accountId:n,meetingType:a?.meetingType||"discovery",userEmail:a?.userEmail||"",captureMode:r?.captureMode||"mic_only",hasVirtualDevice:r?.hasVirtualDevice||!1,context:a?{customerBrain:a.account?.customerBrain,opportunities:a.opportunities,contacts:a.contacts,userEmail:a.userEmail}:void 0,systemPrompt:c})});return l.json.success?{success:!0,transcript:l.json.transcript||"",sections:this.normalizeSections(l.json.sections),duration:l.json.duration||0,diarizedTranscript:l.json.diarization?.formattedTranscript||void 0}:{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:l.json.error||"Transcription failed"}}catch(o){console.error("Server transcription error:",o),o.response&&console.error("Server response:",o.response);let c="";try{o.response?.json?.error?c=o.response.json.error:typeof o.response=="string"&&(c=JSON.parse(o.response).error||"")}catch{}let l=c||`Transcription failed: ${o.message}`;return o.message?.includes("413")?l="Audio file too large for server. Try a shorter recording.":o.message?.includes("500")?l=c||"Server error during transcription. Please try again.":(o.message?.includes("Failed to fetch")||o.message?.includes("NetworkError"))&&(l="Could not reach transcription server. Check your internet connection."),console.error("Final error message:",l),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:l}}}parseSections(i){let t=this.getEmptySections(),e={summary:"summary",attendees:"attendees","key stakeholders":"attendees","discussion context":"discussionContext","key quotes":"keyQuotes","quotable moments":"keyQuotes","meddicc signals":"meddiccSignals","product interest":"productInterest","pain points":"painPoints","customer feedback":"painPoints","buying triggers":"buyingTriggers","key dates":"keyDates","next steps":"nextSteps","action items":"actionItems","action items (internal)":"actionItems","deal signals":"dealSignals","risks & objections":"risksObjections","risks and objections":"risksObjections","competitive intelligence":"competitiveIntel","draft follow-up email":"emailDraft","follow-up email":"emailDraft"},n=/## ([^\n]+)\n([\s\S]*?)(?=## |$)/g,a;for(;(a=n.exec(i))!==null;){let r=a[1].trim().toLowerCase(),s=a[2].trim(),o=e[r];o&&(t[o]=s)}return t}normalizeSections(i){let t=this.getEmptySections();return i?{...t,...i}:t}async getMeetingContext(i){try{let t=await(0,P.requestUrl)({url:`${this.serverUrl}/api/meeting-context/${i}`,method:"GET",headers:{Accept:"application/json"}});return t.json.success?{success:!0,account:t.json.account,opportunities:t.json.opportunities,contacts:t.json.contacts,lastMeeting:t.json.lastMeeting}:{success:!1,error:t.json.error||"Failed to fetch context"}}catch(t){return console.error("Meeting context error:",t),{success:!1,error:t.message||"Network error"}}}async syncToSalesforce(i,t,e,n,a,r){try{let s=await(0,P.requestUrl)({url:`${this.serverUrl}/api/transcription/sync-to-salesforce`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:i,accountName:t,noteTitle:e,sections:n,transcript:a,meetingDate:r||new Date().toISOString(),syncedAt:new Date().toISOString()})});return s.json.success?{success:!0,customerBrainUpdated:s.json.customerBrainUpdated,eventCreated:s.json.eventCreated,eventId:s.json.eventId,contactsCreated:s.json.contactsCreated,tasksCreated:s.json.tasksCreated}:{success:!1,error:s.json.error||"Sync failed"}}catch(s){return console.error("Salesforce sync error:",s),{success:!1,error:s.message||"Network error"}}}getEmptySections(){return{summary:"",attendees:"",discussionContext:"",keyQuotes:"",meddiccSignals:"",productInterest:"",painPoints:"",buyingTriggers:"",keyDates:"",nextSteps:"",actionItems:"",dealSignals:"",risksObjections:"",competitiveIntel:"",emailDraft:""}}async liveQueryTranscript(i,t,e){if(!t||t.trim().length<50)return{success:!1,answer:"",error:"Not enough transcript captured yet. Keep recording for a few more minutes."};try{let n=await(0,P.requestUrl)({url:`${this.serverUrl}/api/live-query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:i,transcript:t,accountName:e,systemPrompt:this.buildLiveQueryPrompt()})});return n.json.success?{success:!0,answer:n.json.answer||"No relevant information found in the transcript."}:{success:!1,answer:"",error:n.json.error||"Query failed"}}catch(n){return console.error("Live query error:",n),{success:!1,answer:"",error:n.message||"Failed to query transcript"}}}async transcribeChunk(i,t){try{let e=await(0,P.requestUrl)({url:`${this.serverUrl}/api/transcribe-chunk`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:i,mimeType:t})});return e.json.success?{success:!0,text:e.json.text||""}:{success:!1,text:"",error:e.json.error||"Chunk transcription failed"}}catch(e){return console.error("Chunk transcription error:",e),{success:!1,text:"",error:e.message||"Failed to transcribe chunk"}}}buildLiveQueryPrompt(){return`You are an AI assistant helping a salesperson during an active customer call. 
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

Format your response as a brief, actionable answer suitable for quick reference during a call.`}static formatSectionsForNote(i,t,e){let n="";if(i.summary&&(n+=`## TL;DR

${i.summary}

`),e?.enabled&&e?.talkTime){n+=`## Call Analytics

`;let r=e.talkTime.repPercent,s=e.talkTime.customerPercent,o=e.talkTime.isHealthyRatio?"\u2705":"\u26A0\uFE0F";n+=`**Talk Time:** Rep ${r}% / Customer ${s}% ${o}
`;let c=Math.round(r/5),l=Math.round(s/5);if(n+=`\`${"\u2588".repeat(c)}${"\u2591".repeat(20-c)}\` Rep
`,n+=`\`${"\u2588".repeat(l)}${"\u2591".repeat(20-l)}\` Customer

`,e.coaching){let d=e.coaching;if(d.totalQuestions>0){let u=Math.round(d.openQuestions/d.totalQuestions*100);n+=`**Questions:** ${d.totalQuestions} total (${d.openQuestions} open, ${d.closedQuestions} closed - ${u}% open)
`}if(d.objections&&d.objections.length>0){let u=d.objections.filter(y=>y.handled).length;n+=`**Objections:** ${d.objections.length} raised, ${u} handled
`}d.valueScore!==void 0&&(n+=`**Value Articulation:** ${d.valueScore}/10
`),d.nextStepClear!==void 0&&(n+=`**Next Step Clarity:** ${d.nextStepClear?"\u2705 Clear":"\u26A0\uFE0F Unclear"}
`),n+=`
`}}i.painPoints&&!i.painPoints.includes("None explicitly stated")&&(n+=`## Pain Points

${i.painPoints}

`),i.productInterest&&!i.productInterest.includes("None identified")&&(n+=`## Product Interest

${i.productInterest}

`),i.meddiccSignals&&(n+=`## MEDDICC Signals

${i.meddiccSignals}

`),i.nextSteps&&(n+=`## Next Steps

${i.nextSteps}

`),i.actionItems&&(n+=`## Action Items (Internal)

${i.actionItems}

`),i.keyDates&&!i.keyDates.includes("No specific dates")&&(n+=`## Key Dates

${i.keyDates}

`),i.buyingTriggers&&(n+=`## Buying Triggers

${i.buyingTriggers}

`),i.dealSignals&&(n+=`## Deal Signals

${i.dealSignals}

`),i.risksObjections&&!i.risksObjections.includes("None raised")&&(n+=`## Risks & Objections

${i.risksObjections}

`),i.competitiveIntel&&!i.competitiveIntel.includes("No competitive")&&(n+=`## Competitive Intelligence

${i.competitiveIntel}

`),i.attendees&&(n+=`## Attendees

${i.attendees}

`);let a=e?.enabled&&e?.formattedTranscript?e.formattedTranscript:t;if(a){let r=e?.enabled?"Full Transcript (Speaker-Attributed)":"Full Transcript";n+=`---

<details>
<summary><strong>${r}</strong></summary>

${a}

</details>
`}return n}static formatSectionsWithAudio(i,t,e,n){let a=this.formatSectionsForNote(i,t,n);return e&&(a+=`
---

## Recording

![[${e}]]
`),a}static formatContextForNote(i){if(!i.success)return"";let t=`## Pre-Call Context

`;if(i.account&&(t+=`**Account:** ${i.account.name}
`,t+=`**Owner:** ${i.account.owner}

`),i.opportunities&&i.opportunities.length>0){t+=`### Open Opportunities

`;for(let e of i.opportunities){let n=e.acv?`$${(e.acv/1e3).toFixed(0)}k`:"TBD";t+=`- **${e.name}** - ${e.stage} - ${n}`,e.targetSignDate&&(t+=` - Target: ${new Date(e.targetSignDate).toLocaleDateString()}`),t+=`
`}t+=`
`}if(i.contacts&&i.contacts.length>0){t+=`### Key Contacts

`;for(let e of i.contacts.slice(0,5))t+=`- **${e.name}**`,e.title&&(t+=` - ${e.title}`),t+=`
`;t+=`
`}if(i.lastMeeting&&(t+=`### Last Meeting

`,t+=`${new Date(i.lastMeeting.date).toLocaleDateString()} - ${i.lastMeeting.subject}

`),i.account?.customerBrain){let e=i.account.customerBrain.substring(0,500);e&&(t+=`### Recent Notes

`,t+=`${e}${i.account.customerBrain.length>500?"...":""}

`)}return t+=`---

`,t}async blobToBase64(i){return new Promise((t,e)=>{let n=new FileReader;n.onload=()=>{let r=n.result.split(",")[1];t(r)},n.onerror=e,n.readAsDataURL(i)})}async transcribeAudio(i,t){let e=i.size/1024/1024,n=i.type||"audio/webm";if(e>15)return console.log(`[Eudia] Large recording (${e.toFixed(1)}MB) \u2014 using chunked transcription`),this.transcribeAudioChunked(i,n,t);try{let a=await this.blobToBase64(i),r=t?.meetingType==="pipeline_review"?{success:!0,meetingType:"pipeline_review",pipelineContext:t.pipelineContext}:void 0,s=await this.transcribeAndSummarize(a,n,t?.accountName,t?.accountId,r,{captureMode:t?.captureMode,hasVirtualDevice:t?.hasVirtualDevice},t?.meetingTemplate);return{text:s.transcript,confidence:s.success?.95:0,duration:s.duration,sections:s.sections,diarizedTranscript:s.diarizedTranscript,error:s.error}}catch(a){return console.error("transcribeAudio error:",a),{text:"",confidence:0,duration:0,sections:this.getEmptySections(),error:a.message||"Transcription request failed"}}}static{this.CHUNK_MAX_RETRIES=3}static{this.CHUNK_RETRY_DELAYS=[5e3,15e3,3e4]}async transcribeChunkWithRetry(i,t,e,n){for(let a=0;a<=S.CHUNK_MAX_RETRIES;a++){if(a>0){let r=S.CHUNK_RETRY_DELAYS[a-1]||3e4;console.log(`[Eudia] Chunk ${e+1}/${n} retry ${a}/${S.CHUNK_MAX_RETRIES} in ${r/1e3}s...`),await new Promise(s=>setTimeout(s,r))}try{let r=await(0,P.requestUrl)({url:`${this.serverUrl}/api/transcribe-chunk`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:i,mimeType:t})}),s=r.json?.text||r.json?.transcript||"";if(r.json?.success&&s)return a>0&&console.log(`[Eudia] Chunk ${e+1}/${n} succeeded on retry ${a}`),{text:s,duration:r.json.duration||0};console.warn(`[Eudia] Chunk ${e+1}/${n} attempt ${a+1} returned no text: ${r.json?.error||"unknown"}`)}catch(r){console.warn(`[Eudia] Chunk ${e+1}/${n} attempt ${a+1} failed: ${r.message}`)}}return null}async transcribeAudioChunked(i,t,e){let a=await i.arrayBuffer(),r=a.byteLength,s=Math.ceil(r/8388608);console.log(`[Eudia] Chunked transcription: ${(r/1024/1024).toFixed(1)}MB \u2192 ${s} chunks`);let o=16*1024,c=r/o,l=[],d=0,u=0;for(let g=0;g<s;g++){let O=g*8388608,b=Math.min(O+8388608,r),v=a.slice(O,b),C=new Blob([v],{type:t});console.log(`[Eudia] Transcribing chunk ${g+1}/${s} (${((b-O)/1024/1024).toFixed(1)}MB)`);let f=await this.blobToBase64(C),h=await this.transcribeChunkWithRetry(f,t,g,s);if(h)l.push(h.text),d+=h.duration,console.log(`[Eudia] Chunk ${g+1}/${s} OK: ${h.text.length} chars`);else{u++;let w=Math.round(O/r*c),x=Math.round(b/r*c),E=`${Math.floor(w/60)}:${(w%60).toString().padStart(2,"0")}`,k=`${Math.floor(x/60)}:${(x%60).toString().padStart(2,"0")}`,j=`

[~${E} \u2013 ${k} \u2014 audio not transcribed (chunk ${g+1}/${s} failed after ${S.CHUNK_MAX_RETRIES+1} attempts)]

`;l.push(j),console.error(`[Eudia] Chunk ${g+1}/${s} permanently failed \u2014 gap marker inserted`)}}if(l.filter(g=>!g.includes("\u2014 audio not transcribed")).length===0)return{text:"",confidence:0,duration:0,sections:this.getEmptySections(),error:`All ${s} chunks failed to transcribe after retries. Server may be unavailable.`};u>0&&console.warn(`[Eudia] ${u}/${s} chunks failed after retries \u2014 partial transcript with gap markers`);let m=l.join(`

`);console.log(`[Eudia] Combined transcript: ${m.length} chars from ${s} chunks (${u} gaps)`);try{let g=await this.processTranscription(m,{accountName:e?.accountName,accountId:e?.accountId});return{text:m,confidence:u===0?.9:Math.max(.3,.9-u/s*.6),duration:d,sections:g,...u>0?{error:`${u} of ${s} audio chunks could not be transcribed. Look for [audio not transcribed] markers in the transcript.`}:{}}}catch(g){return console.error("[Eudia] Summarization failed after chunked transcription:",g.message),{text:m,confidence:.5,duration:d,sections:this.getEmptySections(),error:`Transcription succeeded but summarization failed: ${g.message}`}}}async processTranscription(i,t){if(!i||i.trim().length===0)return this.getEmptySections();try{let e=await(0,P.requestUrl)({url:`${this.serverUrl}/api/process-sections`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript:i,accountName:t?.accountName,context:t})});if(e.json?.success&&e.json?.sections){let n=e.json.sections;return{summary:n.summary||"",painPoints:n.painPoints||n.keyPoints||"",productInterest:n.productInterest||"",meddiccSignals:n.meddiccSignals||"",nextSteps:n.nextSteps||"",actionItems:n.actionItems||"",keyDates:n.keyDates||"",buyingTriggers:n.buyingTriggers||"",dealSignals:n.dealSignals||"",risksObjections:n.risksObjections||n.concerns||"",competitiveIntel:n.competitiveIntel||"",attendees:n.attendees||"",transcript:i}}return console.warn("Server process-sections returned no sections, using fallback"),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:i}}catch(e){return console.error("processTranscription server error:",e),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:i}}}};var Y=require("obsidian"),F=class S{constructor(i,t,e="America/New_York"){this.serverUrl=i,this.userEmail=t.toLowerCase(),this.timezone=e}setUserEmail(i){this.userEmail=i.toLowerCase()}setServerUrl(i){this.serverUrl=i}setTimezone(i){this.timezone=i}async getTodaysMeetings(i=!1){if(!this.userEmail)return{success:!1,date:new Date().toISOString().split("T")[0],email:"",meetingCount:0,meetings:[],error:"User email not configured"};try{let t=encodeURIComponent(this.timezone),e=i?"&forceRefresh=true":"";return(await(0,Y.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/today?timezone=${t}${e}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(t){return console.error("Failed to fetch today's meetings:",t),{success:!1,date:new Date().toISOString().split("T")[0],email:this.userEmail,meetingCount:0,meetings:[],error:t.message||"Failed to fetch calendar"}}}async getWeekMeetings(i=!1){if(!this.userEmail)return{success:!1,startDate:"",endDate:"",email:"",totalMeetings:0,byDay:{},error:"User email not configured"};try{let t=encodeURIComponent(this.timezone),e=i?"&forceRefresh=true":"";return(await(0,Y.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/week?timezone=${t}${e}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(t){return console.error("Failed to fetch week's meetings:",t),{success:!1,startDate:"",endDate:"",email:this.userEmail,totalMeetings:0,byDay:{},error:t.message||"Failed to fetch calendar"}}}async getMeetingsInRange(i,t){if(!this.userEmail)return[];try{let e=i.toISOString().split("T")[0],n=t.toISOString().split("T")[0],a=await(0,Y.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${e}&end=${n}`,method:"GET",headers:{Accept:"application/json"}});return a.json.success?a.json.meetings||[]:[]}catch(e){return console.error("Failed to fetch calendar range:",e),[]}}async getCurrentMeeting(){let i=await this.getTodaysMeetings();if(!i.success||i.meetings.length===0)return{meeting:null,isNow:!1};let t=new Date;for(let e of i.meetings){let n=S.safeParseDate(e.start),a=S.safeParseDate(e.end);if(t>=n&&t<=a)return{meeting:e,isNow:!0};let r=(n.getTime()-t.getTime())/(1e3*60);if(r>0&&r<=15)return{meeting:e,isNow:!1,minutesUntilStart:Math.ceil(r)}}return{meeting:null,isNow:!1}}async getMeetingsForAccount(i){let t=await this.getWeekMeetings();if(!t.success)return[];let e=[];Object.values(t.byDay).forEach(a=>{e.push(...a)});let n=i.toLowerCase();return e.filter(a=>a.accountName?.toLowerCase().includes(n)||a.subject.toLowerCase().includes(n)||a.attendees.some(r=>r.email.toLowerCase().includes(n.split(" ")[0])))}static formatMeetingForNote(i){let t=i.attendees.filter(e=>e.isExternal!==!1).map(e=>e.name||e.email.split("@")[0]).slice(0,5).join(", ");return{title:i.subject,attendees:t,meetingStart:i.start,accountName:i.accountName}}static getDayName(i){let t;i.length===10&&i.includes("-")?t=new Date(i+"T00:00:00"):t=new Date(i);let e=new Date;e.setHours(0,0,0,0);let n=new Date(t);n.setHours(0,0,0,0);let a=Math.round((n.getTime()-e.getTime())/(1e3*60*60*24));return a===0?"Today":a===1?"Tomorrow":t.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}static formatTime(i,t){let e=i;e&&!e.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(e)&&(e=e+"Z");let n=new Date(e);if(isNaN(n.getTime()))return i;let a={hour:"numeric",minute:"2-digit",hour12:!0};return t&&(a.timeZone=t),n.toLocaleTimeString("en-US",a)}static safeParseDate(i){if(!i)return new Date(NaN);let t=i;return!t.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(t)&&(t=t+"Z"),new Date(t)}static getMeetingDuration(i,t){let e=S.safeParseDate(i),n=S.safeParseDate(t);return Math.round((n.getTime()-e.getTime())/(1e3*60))}};var Ne=["ai-contracting-tech","ai-contracting-services","ai-compliance-tech","ai-compliance-services","ai-ma-tech","ai-ma-services","sigma"],Pe=["metrics-identified","economic-buyer-identified","decision-criteria-discussed","decision-process-discussed","pain-confirmed","champion-identified","competition-mentioned"],De=["progressing","stalled","at-risk","champion-engaged","early-stage"],Fe=["discovery","demo","negotiation","qbr","implementation","follow-up"],Me=`You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

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
}`,J=class{constructor(i,t){this.openaiApiKey=null;this.serverUrl=i,this.openaiApiKey=t||null}setOpenAIKey(i){this.openaiApiKey=i}setServerUrl(i){this.serverUrl=i}async extractTags(i){let t=this.buildTagContext(i);if(!t.trim())return{success:!1,tags:this.getEmptyTags(),error:"No content to analyze"};try{return await this.extractTagsViaServer(t)}catch(e){return console.warn("Server tag extraction failed, trying local:",e.message),this.openaiApiKey?await this.extractTagsLocal(t):this.extractTagsRuleBased(i)}}buildTagContext(i){let t=[];return i.summary&&t.push(`SUMMARY:
${i.summary}`),i.productInterest&&t.push(`PRODUCT INTEREST:
${i.productInterest}`),i.meddiccSignals&&t.push(`MEDDICC SIGNALS:
${i.meddiccSignals}`),i.dealSignals&&t.push(`DEAL SIGNALS:
${i.dealSignals}`),i.painPoints&&t.push(`PAIN POINTS:
${i.painPoints}`),i.attendees&&t.push(`ATTENDEES:
${i.attendees}`),t.join(`

`)}async extractTagsViaServer(i){let t=await fetch(`${this.serverUrl}/api/extract-tags`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:i,openaiApiKey:this.openaiApiKey})});if(!t.ok)throw new Error(`Server returned ${t.status}`);let e=await t.json();if(!e.success)throw new Error(e.error||"Tag extraction failed");return{success:!0,tags:this.validateAndNormalizeTags(e.tags)}}async extractTagsLocal(i){if(!this.openaiApiKey)return{success:!1,tags:this.getEmptyTags(),error:"No OpenAI API key configured"};try{let t=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:Me},{role:"user",content:`Extract tags from this meeting content:

${i}`}],temperature:.1,response_format:{type:"json_object"}})});if(!t.ok)throw new Error(`OpenAI returned ${t.status}`);let n=(await t.json()).choices?.[0]?.message?.content;if(!n)throw new Error("No content in response");let a=JSON.parse(n);return{success:!0,tags:this.validateAndNormalizeTags(a)}}catch(t){return console.error("Local tag extraction error:",t),{success:!1,tags:this.getEmptyTags(),error:t.message||"Tag extraction failed"}}}extractTagsRuleBased(i){let t=Object.values(i).join(" ").toLowerCase(),e={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:.4};return(t.includes("contract")||t.includes("contracting"))&&(t.includes("service")?e.product_interest.push("ai-contracting-services"):e.product_interest.push("ai-contracting-tech")),t.includes("compliance")&&e.product_interest.push("ai-compliance-tech"),(t.includes("m&a")||t.includes("due diligence")||t.includes("acquisition"))&&e.product_interest.push("ai-ma-tech"),t.includes("sigma")&&e.product_interest.push("sigma"),(t.includes("metric")||t.includes("%")||t.includes("roi")||t.includes("save"))&&e.meddicc_signals.push("metrics-identified"),(t.includes("budget")||t.includes("cfo")||t.includes("economic buyer"))&&e.meddicc_signals.push("economic-buyer-identified"),(t.includes("pain")||t.includes("challenge")||t.includes("problem")||t.includes("struggle"))&&e.meddicc_signals.push("pain-confirmed"),(t.includes("champion")||t.includes("advocate")||t.includes("sponsor"))&&e.meddicc_signals.push("champion-identified"),(t.includes("competitor")||t.includes("alternative")||t.includes("vs")||t.includes("compared to"))&&e.meddicc_signals.push("competition-mentioned"),(t.includes("next step")||t.includes("follow up")||t.includes("schedule"))&&(e.deal_health="progressing"),(t.includes("concern")||t.includes("objection")||t.includes("hesitant")||t.includes("risk"))&&(e.deal_health="at-risk"),t.includes("demo")||t.includes("show you")||t.includes("demonstration")?e.meeting_type="demo":t.includes("pricing")||t.includes("negotiat")||t.includes("contract terms")?e.meeting_type="negotiation":t.includes("quarterly")||t.includes("qbr")||t.includes("review")?e.meeting_type="qbr":(t.includes("implementation")||t.includes("onboard")||t.includes("rollout"))&&(e.meeting_type="implementation"),{success:!0,tags:e}}validateAndNormalizeTags(i){let t={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:i.confidence||.8};return Array.isArray(i.product_interest)&&(t.product_interest=i.product_interest.filter(e=>Ne.includes(e))),Array.isArray(i.meddicc_signals)&&(t.meddicc_signals=i.meddicc_signals.filter(e=>Pe.includes(e))),De.includes(i.deal_health)&&(t.deal_health=i.deal_health),Fe.includes(i.meeting_type)&&(t.meeting_type=i.meeting_type),Array.isArray(i.key_stakeholders)&&(t.key_stakeholders=i.key_stakeholders.slice(0,10)),t}getEmptyTags(){return{product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:0}}static formatTagsForFrontmatter(i){return{product_interest:i.product_interest.length>0?i.product_interest:null,meddicc_signals:i.meddicc_signals.length>0?i.meddicc_signals:null,deal_health:i.deal_health,meeting_type:i.meeting_type,key_stakeholders:i.key_stakeholders.length>0?i.key_stakeholders:null,tag_confidence:Math.round(i.confidence*100)}}static generateTagSummary(i){let t=[];return i.product_interest.length>0&&t.push(`**Products:** ${i.product_interest.join(", ")}`),i.meddicc_signals.length>0&&t.push(`**MEDDICC:** ${i.meddicc_signals.join(", ")}`),t.push(`**Deal Health:** ${i.deal_health}`),t.push(`**Meeting Type:** ${i.meeting_type}`),t.join(" | ")}};var ue=["keigan.pesenti@eudia.com","michael.ayres@eudia.com","michael.ayers@eudia.com","mike.flynn@eudia.com","michael.flynn@eudia.com","zack@eudia.com","zach@eudia.com","ben.brosnahan@eudia.com"],pe=["omar@eudia.com","david@eudia.com","ashish@eudia.com","siddharth.saxena@eudia.com"],me={"mitchell.loquaci@eudia.com":{name:"Mitchell Loquaci",region:"US",role:"RVP Sales"},"stephen.mulholland@eudia.com":{name:"Stephen Mulholland",region:"EMEA",role:"VP Sales"},"riona.mchale@eudia.com":{name:"Riona McHale",region:"IRE_UK",role:"Head of Sales"}},he=["nikhita.godiwala@eudia.com","jon.dedych@eudia.com","farah.haddad@eudia.com"],Re=["nikhita.godiwala@eudia.com"],He={"nikhita.godiwala@eudia.com":["jon.dedych@eudia.com","farah.haddad@eudia.com"]},D=[{id:"001Hp00003kIrQDIA0",name:"Accenture",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"accenture.com",industry:"Information Technology Services",csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrEOIA0",name:"AES",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"alesaei-aes.com",industry:"Utilities: Gas and Electric",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrCyIAK",name:"Airbnb",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"airbnb.com",industry:"Internet Services and Retailing",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFrdIAG",name:"Airship Group Inc",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"airship.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrEeIAK",name:"Amazon",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"amazon.com",industry:"Internet Services and Retailing",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000TUdXwIAL",name:"Anthropic",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"anthropic.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000wvc5aIAA",name:"AppliedAI",type:"New",isOwned:!1,hadOpportunity:!0,website:"https://www.applied-ai.com/",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000mCFsTIAW",name:"Arabic Computer Systems",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"acs.com.sa",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Hp00003kIrEyIAK",name:"Aramark Ireland",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"aramark.ie",industry:"Diversified Outsourcing Services",csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000p1hYbIAI",name:"Army Corps of Engineers",type:"New",isOwned:!1,hadOpportunity:!0,website:"https://www.usace.army.mil/",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Wj00000mCFrgIAG",name:"Aryza",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"aryza.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000Y0g8ZIAR",name:"Asana",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"asana.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mI7NaIAK",name:"Aviva Insurance",type:"New",isOwned:!1,hadOpportunity:!0,website:"aviva.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000fFuFMIA0",name:"Bank of Ireland",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"bankofireland.com",industry:"Banking",csmName:null,ownerName:"Tom Clancy"},{id:"001Hp00003kJ9pXIAS",name:"Bayer",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"bayer.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrFVIA0",name:"Best Buy",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"bestbuy.com",industry:"Specialty Retailers: Other",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000WTMCRIA5",name:"BNY Mellon",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"bny.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kIrE3IAK",name:"Cargill",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"cargill.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrE4IAK",name:"Chevron",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"chevron.com",industry:"Petroleum Refining",csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrGKIA0",name:"CHS",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"chsinc.com",industry:"Food Production",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrE5IAK",name:"Coherent",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"coherent.com",industry:"Semiconductors and Lasers",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFrkIAG",name:"Coillte",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"coillte.ie",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000mHDBoIAO",name:"Coimisiun na Mean",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"cnam.ie",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFtTIAW",name:"Coleman Legal",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"colemanlegalpllc.com",industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"001Wj00000mCFqtIAG",name:"CommScope Technologies",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"commscope.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFsHIAW",name:"Consensys",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrGeIAK",name:"Corebridge Financial",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"corebridgefinancial.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000c9oCvIAI",name:"Cox Media Group",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"cmg.com",industry:null,csmName:null,ownerName:"Justin Hills"},{id:"001Wj00000pLPAyIAO",name:"Creed McStay",type:"New",isOwned:!1,hadOpportunity:!0,website:"creedmcstay.ie",industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"001Wj00000mCFsBIAW",name:"Datalex",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"datalex.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000mCFrlIAG",name:"Davy",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"davy.ie",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000Y0jPmIAJ",name:"Delinea",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"delinea.com",industry:null,csmName:null,ownerName:"Justin Hills"},{id:"001Wj00000mCFscIAG",name:"Department of Children, Disability and Equality",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"https://www.gov.ie/en/department-of-children-disability-and-equality/",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Wj00000mCFsNIAW",name:"Department of Climate, Energy and the Environment",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"https://www.gov.ie/en/department-of-climate-energy-and-the-environment/",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Hp00003kIrE6IAK",name:"DHL",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"dhl.com",industry:"Logistics and Shipping",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000aZvt9IAC",name:"Dolby",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"dolbyblaissegee.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrDMIA0",name:"Dropbox",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"dropbox.com",industry:"Cloud Storage and Software",csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrDaIAK",name:"Duracell",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"duracell.com",industry:"Consumer goods",csmName:null,ownerName:"Justin Hills"},{id:"001Hp00003kIrE7IAK",name:"ECMS",type:"Customer - No Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"ecmsglobal-jp.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrHNIA0",name:"Ecolab",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"ecolab.com",industry:"Chemicals",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFszIAG",name:"Electricity Supply Board",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"esb.ie",industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"001Wj00000mCFsUIAW",name:"ESB NI/Electric Ireland",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"esb.ie",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Wj00000hkk0jIAA",name:"Etsy",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"etsy.com",industry:"information technology & services",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrIAIA0",name:"Fox",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"foxcorporation.com",industry:"Entertainment",csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kJ9oeIAC",name:"Fresh Del Monte",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"freshdelmonte.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kIrIJIA0",name:"GE Vernova",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"gevernova.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Hp00003kIrISIA0",name:"Gilead Sciences",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"gilead.com",industry:"Pharmaceuticals",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000mCFrcIAG",name:"Glanbia",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"glanbia.com",industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"001Wj00000mCFt1IAG",name:"Goodbody Stockbrokers",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"goodbody.ie",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Hp00003kIrE8IAK",name:"Graybar Electric",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"graybar.com",industry:"Wholesalers: Diversified",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000mCFseIAG",name:"Hayes Solicitors LLP",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"hayes-solicitors.ie",industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"001Hp00003kIrCnIAK",name:"Home Depot",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"thdroadcompanion.com",industry:"Specialty Retailers: Other",csmName:null,ownerName:"Mitch Loquaci"},{id:"001Wj00000mCFs5IAG",name:"Indeed",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"indeed.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrJ9IAK",name:"Intuit",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"intuit.com",industry:"Computer Software",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrE9IAK",name:"IQVIA",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"onekeydata.com",industry:"Health Care: Pharmacy and Other Services",csmName:null,ownerName:"Sean Boyd"},{id:"001Wj00000mCFtMIAW",name:"Kellanova",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"www.kellanova.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrJOIA0",name:"Keurig Dr Pepper",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"keurigdrpepper.com",industry:"Beverages",csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000hkk0zIAA",name:"Kingspan",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"kingspan.com",industry:"building materials",csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFsoIAG",name:"Mediolanum",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"mediolanum.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrD8IAK",name:"Medtronic",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"medtronic.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kJ9lGIAS",name:"Meta",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"meta.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrDeIAK",name:"National Grid",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"nationalgrid.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000VVJ31IAH",name:"NATO",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"https://www.nato.int/",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Hp00003kIrKmIAK",name:"Northern Trust Management Services",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"northerntrust.com",industry:"Commercial Banks",csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000cpxt0IAA",name:"Novelis",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"novelis.com",industry:null,csmName:null,ownerName:"Mitch Loquaci"},{id:"001Wj00000mCFr6IAG",name:"NTMA",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"ntma.ie",industry:null,csmName:null,ownerName:"Emer Flynn"},{id:"001Wj00000TV1WzIAL",name:"OpenAi",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"openai.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000mCFrIIAW",name:"Orsted",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"orsted.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000bzz9MIAQ",name:"Peregrine Hospitality",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"peregrinehg.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000ZDPUIIA5",name:"Perrigo Pharma",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"perrigo.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrLNIA0",name:"Petsmart",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"petsmart.com",industry:"Retailing",csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000kNp2XIAS",name:"Plusgrade",type:"New",isOwned:!1,hadOpportunity:!0,website:"plusgrade.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kKXSIIA4",name:"Pure Storage",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"purestorage.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000u0eJpIAI",name:"Re-Turn",type:"New",isOwned:!1,hadOpportunity:!0,website:"https://re-turn.ie/",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Hp00003kIrD9IAK",name:"Salesforce",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"salesforce.com",industry:"Computer Software",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mI9NmIAK",name:"Sequoia Climate Fund",type:"New",isOwned:!1,hadOpportunity:!0,website:"sequoiaclimate.org",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrMKIA0",name:"ServiceNow",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"servicenow.com",industry:"Computer Software",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFrMIAW",name:"Sisk Group",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"sisk.com",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Hp00003kIrECIA0",name:"Southwest Airlines",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"southwest.com",industry:"Airlines",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000lxbYRIAY",name:"Spark Brighter Thinking",type:"New",isOwned:!1,hadOpportunity:!0,website:"hellospark.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000c9oD6IAI",name:"Stripe",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"stripe.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000bzz9TIAQ",name:"Tailored Brands",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"tailoredbrands.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000mCFs0IAG",name:"Taoglas Limited",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"taoglas.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000iS9AJIA0",name:"TE Connectivity",type:"New",isOwned:!1,hadOpportunity:!0,website:"te.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000mCFtPIAW",name:"Teamwork.com",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"teamwork.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000PjGDaIAN",name:"The Weir Group PLC",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"global.weir",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrNBIA0",name:"The Wonderful Company",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"wonderful.com",industry:"Multicompany",csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000SFiOvIAL",name:"TikTok",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"tiktok.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000ZDXTRIA5",name:"Tinder LLC",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"tinder.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrCwIAK",name:"Toshiba US",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"toshiba.com",industry:"Electronics and IT Solutions",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000bWBkeIAG",name:"U.S. Air Force",type:"New",isOwned:!1,hadOpportunity:!0,website:"eprc.or.ug",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Wj00000bWBlEIAW",name:"Udemy",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"udemy.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFtOIAW",name:"Uisce Eireann (Irish Water)",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"water.ie",industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"001Wj00000bn8VSIAY",name:"Vista Equity Partners",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"vistaequitypartners.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000p1SuZIAU",name:"Vulcan Special Ops",type:"New",isOwned:!1,hadOpportunity:!0,website:"vulcan-v.com",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Hp00003kIrNwIAK",name:"W.W. Grainger",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"grainger.com",industry:"Wholesalers: Diversified",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000bzz9NIAQ",name:"Wealth Partners Capital Group",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"wealthpcg.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000ZLVpTIAX",name:"Wellspring Philanthropic Fund",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"wpfund.org",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrOAIA0",name:"Western Digital",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"westerndigital.com",industry:"Computers, Office Equipment",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrOLIA0",name:"World Wide Technology",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"wwt.com",industry:"Technology Hardware & Equipment",csmName:null,ownerName:"Julie Stefanich"}],Le={US:["asad.hussain@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com","rajeev.patel@eudia.com"],EMEA:["greg.machale@eudia.com","tom.clancy@eudia.com","nicola.fratini@eudia.com","nathan.shine@eudia.com","stephen.mulholland@eudia.com"],IRE_UK:["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com","riona.mchale@eudia.com"]},ee={"mitchell.loquaci@eudia.com":["asad.hussain@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com","rajeev.patel@eudia.com"],"stephen.mulholland@eudia.com":["greg.machale@eudia.com","tom.clancy@eudia.com","conor.molloy@eudia.com","nathan.shine@eudia.com","nicola.fratini@eudia.com"],"riona.mchale@eudia.com":["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com"]},_e={"sean.boyd@eudia.com":"US","riley.stack@eudia.com":"US","rajeev.patel@eudia.com":"US"};function Be(S){let i=S.toLowerCase().trim();return ue.includes(i)?"admin":pe.includes(i)?"exec":i in me?"sales_leader":he.includes(i)?"cs":"bl"}function Ue(S){let i=S.toLowerCase().trim();return me[i]?.region||null}function ge(S){return Le[S]||[]}function Ge(S){let i=S.toLowerCase().trim();if(ee[i])return ee[i];let t=Ue(i);return t?ge(t):[]}function M(S){let i=S.toLowerCase().trim();return ue.includes(i)||pe.includes(i)}function B(S){let i=S.toLowerCase().trim();return he.includes(i)}function U(S){let i=S.toLowerCase().trim();return Re.includes(i)}function ye(S){let i=S.toLowerCase().trim();return He[i]||[]}var N={version:"2026-02-09",lastUpdated:"2026-02-09",businessLeads:{"alex.fox@eudia.com":{email:"alex.fox@eudia.com",name:"Alex Fox",accounts:[{id:"001Wj00000mCFsT",name:"Arabic Computer Systems",hadOpportunity:!0},{id:"001Wj00000mCFsO",name:"Brown Thomas",hadOpportunity:!0},{id:"001Wj00000mCFt2",name:"Byrne Wallace Shields",hadOpportunity:!0},{id:"001Wj00000mCFsu",name:"Corrigan & Corrigan Solicitors LLP",hadOpportunity:!0},{id:"001Wj00000pzTPY",name:"Defence Forces Tribunal",hadOpportunity:!1},{id:"001Wj00000mCFsc",name:"Department of Children, Disability and Equality",hadOpportunity:!0},{id:"001Wj00000mCFsN",name:"Department of Climate, Energy and the Environment",hadOpportunity:!0},{id:"001Wj00000mCFrZ",name:"Department of Housing",hadOpportunity:!0},{id:"001Wj00000mCFsU",name:"ESB NI/Electric Ireland",hadOpportunity:!0},{id:"001Wj00000pzTPV",name:"MW Keller",hadOpportunity:!1},{id:"001Wj00000pzTPX",name:"Murphy's Ice Cream",hadOpportunity:!1},{id:"001Wj00000mCFrM",name:"Sisk Group",hadOpportunity:!0}]},"ananth.cherukupally@eudia.com":{email:"ananth.cherukupally@eudia.com",name:"Ananth Cherukupally",accounts:[{id:"001Wj00000PfssX",name:"AGC Partners",hadOpportunity:!1},{id:"001Wj00000ahBZt",name:"AMETEK",hadOpportunity:!1},{id:"001Wj00000ahBZr",name:"Accel-KKR",hadOpportunity:!1},{id:"001Wj00000bwVu4",name:"Addtech",hadOpportunity:!1},{id:"001Wj00000YNV7Z",name:"Advent",hadOpportunity:!0},{id:"001Wj00000VZScK",name:"Affinity Consulting Group",hadOpportunity:!1},{id:"001Wj00000lyFyt",name:"Albacore Capital Group",hadOpportunity:!0},{id:"001Wj00000nlL88",name:"Alder",hadOpportunity:!0},{id:"001Wj00000XumF6",name:"Alpine Investors",hadOpportunity:!0},{id:"001Wj00000QTbLP",name:"Alvarez AI Advisors",hadOpportunity:!1},{id:"001Wj00000ahFCJ",name:"American Pacific Group",hadOpportunity:!1},{id:"001Wj00000ah6dg",name:"Angeles Equity Partners",hadOpportunity:!1},{id:"001Hp00003kIrEu",name:"Apollo Global Management",hadOpportunity:!0},{id:"001Wj00000cl5pq",name:"Arizona MBDA Business Center",hadOpportunity:!1},{id:"001Wj00000nlRev",name:"Attack Capital",hadOpportunity:!0},{id:"001Wj00000ahFBx",name:"Audax Group",hadOpportunity:!1},{id:"001Wj00000YhZAE",name:"Beacon Software",hadOpportunity:!0},{id:"001Wj00000cfg0c",name:"Beekers Capital",hadOpportunity:!1},{id:"001Wj00000bwVsk",name:"Bertram Capital",hadOpportunity:!1},{id:"001Wj00000ahBa0",name:"Bessemer Venture Partners",hadOpportunity:!1},{id:"001Wj00000lzDWj",name:"BlueEarth Capital",hadOpportunity:!0},{id:"001Wj00000ah6dZ",name:"Brentwood Associates",hadOpportunity:!1},{id:"001Wj00000ah6dL",name:"Brown & Brown",hadOpportunity:!1},{id:"001Hp00003kIrCh",name:"CBRE Group",hadOpportunity:!0},{id:"001Wj00000cejJz",name:"CVC",hadOpportunity:!0},{id:"001Wj00000ahFCV",name:"Caltius Equity Partners",hadOpportunity:!1},{id:"001Wj00000ahFBz",name:"Capstone Partners",hadOpportunity:!1},{id:"001Wj00000nlB0g",name:"Capvest",hadOpportunity:!0},{id:"001Hp00003kIrFy",name:"Cardinal Health",hadOpportunity:!0},{id:"001Hp00003kIrDg",name:"Carlyle",hadOpportunity:!0},{id:"001Wj00000PbIZ8",name:"Cascadia Capital",hadOpportunity:!1},{id:"001Wj00000ah6dW",name:"Catterton",hadOpportunity:!1},{id:"001Wj00000ahFC7",name:"Century Park Capital Partners",hadOpportunity:!1},{id:"001Wj00000Rjuhj",name:"Citadel",hadOpportunity:!0},{id:"001Wj00000ah6dn",name:"Clearlake Capital Group",hadOpportunity:!1},{id:"001Wj00000ah6dY",name:"Cognex Corporation",hadOpportunity:!1},{id:"001Wj00000ah6do",name:"Comvest Partners",hadOpportunity:!1},{id:"001Wj00000ah6dv",name:"Constellation Software",hadOpportunity:!0},{id:"001Wj00000ahFCI",name:"Cortec Group",hadOpportunity:!1},{id:"001Wj00000ahBa4",name:"Crosslink Capital",hadOpportunity:!1},{id:"001Wj00000ahFCR",name:"DCA Partners",hadOpportunity:!1},{id:"001Wj00000ah6dc",name:"DFO Management",hadOpportunity:!1},{id:"001Wj00000W8fEu",name:"Davis Polk",hadOpportunity:!1},{id:"001Wj00000crdDR",name:"Delcor",hadOpportunity:!0},{id:"001Wj00000ahFCM",name:"Diploma",hadOpportunity:!1},{id:"001Wj00000kcANH",name:"Discord",hadOpportunity:!0},{id:"001Wj00000ahFCU",name:"Doughty Hanson & Co",hadOpportunity:!1},{id:"001Wj00000ah6dd",name:"Edgewater Capital Partners",hadOpportunity:!1},{id:"001Wj00000Y64qh",name:"Emigrant Bank",hadOpportunity:!0},{id:"001Wj00000ah6dM",name:"Encore Consumer Capital",hadOpportunity:!1},{id:"001Wj00000ahFCL",name:"Endeavour Capital",hadOpportunity:!1},{id:"001Wj00000ah6di",name:"FFL Partners",hadOpportunity:!1},{id:"001Wj00000ah6dV",name:"Falfurrias Capital Partners",hadOpportunity:!1},{id:"001Wj00000ah6dU",name:"FirstService Corporation",hadOpportunity:!1},{id:"001Wj00000nlLZU",name:"Five Capital",hadOpportunity:!0},{id:"001Wj00000ahFCK",name:"Flexpoint Ford",hadOpportunity:!1},{id:"001Wj00000QkjJL",name:"Floodgate",hadOpportunity:!1},{id:"001Wj00000bwVu6",name:"Fortive Corporation",hadOpportunity:!1},{id:"001Wj00000ahFCa",name:"Foundry Group",hadOpportunity:!1},{id:"001Hp00003kIrID",name:"Freeport-McMoRan",hadOpportunity:!0},{id:"001Wj00000bwVuN",name:"Fremont Partners",hadOpportunity:!1},{id:"001Wj00000ahFCO",name:"Frontenac Company",hadOpportunity:!1},{id:"001Hp00003kIrII",name:"GE Healthcare",hadOpportunity:!0},{id:"001Hp00003kIrIJ",name:"GE Vernova",hadOpportunity:!0},{id:"001Wj00000lz2Jb",name:"GTIS Partners",hadOpportunity:!0},{id:"001Wj00000ah6dh",name:"Gallant Capital Partners",hadOpportunity:!1},{id:"001Hp00003kJ9oP",name:"General Catalyst",hadOpportunity:!0},{id:"001Wj00000ah6dr",name:"Genstar Capital",hadOpportunity:!1},{id:"001Hp00003kIrIT",name:"GlaxoSmithKline",hadOpportunity:!0},{id:"001Wj00000ahFCb",name:"Goldner Hawn Johnson & Morrison",hadOpportunity:!1},{id:"001Wj00000ah6du",name:"Great Point Partners",hadOpportunity:!1},{id:"001Wj00000ahBZx",name:"Greenoaks Capital",hadOpportunity:!0},{id:"001Wj00000ahFCB",name:"Greenspring Associates",hadOpportunity:!1},{id:"001Wj00000ahFCX",name:"Group 206",hadOpportunity:!1},{id:"001Wj00000ahBZz",name:"Gryphon Investors",hadOpportunity:!1},{id:"001Wj00000ah6dT",name:"HEICO Corporation",hadOpportunity:!1},{id:"001Wj00000cy4m1",name:"HG",hadOpportunity:!0},{id:"001Wj00000ahBZn",name:"HGGC",hadOpportunity:!1},{id:"001Wj00000ah6df",name:"Halma",hadOpportunity:!1},{id:"001Wj00000ah48X",name:"Harvest Partners",hadOpportunity:!1},{id:"001Wj00000ahFCS",name:"HealthpointCapital",hadOpportunity:!1},{id:"001Wj00000lzDtJ",name:"Heidrick & Struggles",hadOpportunity:!0},{id:"001Hp00003kIrIl",name:"Hellman & Friedman",hadOpportunity:!0},{id:"001Wj00000ahFCW",name:"Highview Capital",hadOpportunity:!1},{id:"001Wj00000Pg7rW",name:"Houlihan Lokey",hadOpportunity:!1},{id:"001Wj00000ahFCH",name:"Housatonic Partners",hadOpportunity:!1},{id:"001Wj00000ahFC9",name:"Huron Capital",hadOpportunity:!1},{id:"001Wj00000ahFC6",name:"Indutrade",hadOpportunity:!1},{id:"001Wj00000ahBa5",name:"Insight Partners",hadOpportunity:!1},{id:"001Wj00000nlbr9",name:"Intercorp",hadOpportunity:!0},{id:"001Wj00000ahFCA",name:"Irving Place Capital",hadOpportunity:!1},{id:"001Wj00000bwVtt",name:"Jack Henry & Associates",hadOpportunity:!1},{id:"001Wj00000Pg9oT",name:"Jackim Woods & Co.",hadOpportunity:!1},{id:"001Wj00000ah6de",name:"Jonas Software",hadOpportunity:!1},{id:"001Hp00003kIrJU",name:"KKR",hadOpportunity:!1},{id:"001Wj00000ahBa1",name:"Kayne Anderson Capital Advisors",hadOpportunity:!1},{id:"001Wj00000m5kud",name:"Kelly Services",hadOpportunity:!0},{id:"001Wj00000ahBZp",name:"Keysight Technologies",hadOpportunity:!1},{id:"001Wj00000ahFC8",name:"L Squared Capital Partners",hadOpportunity:!1},{id:"001Wj00000QGTNV",name:"LCS Forensic Accounting & Advisory",hadOpportunity:!1},{id:"001Wj00000ahFCD",name:"Lagercrantz Group",hadOpportunity:!1},{id:"001Wj00000ahBZs",name:"Levine Leichtman Capital Partners",hadOpportunity:!1},{id:"001Wj00000Z6zhP",name:"Liberty Mutual Insurance",hadOpportunity:!0},{id:"001Wj00000ahFCC",name:"Lifco",hadOpportunity:!1},{id:"001Wj00000ahFCP",name:"LightBay Capital",hadOpportunity:!1},{id:"001Wj00000iYEVS",name:"Lightstone Group",hadOpportunity:!0},{id:"001Wj00000ahFCT",name:"Lincolnshire Management",hadOpportunity:!1},{id:"001Wj00000c8ynV",name:"Littelfuse",hadOpportunity:!0},{id:"001Wj00000W95CX",name:"Long Lake",hadOpportunity:!0},{id:"001Wj00000ahBa3",name:"Luminate Capital",hadOpportunity:!1},{id:"001Wj00000ahFC1",name:"Lumine Group",hadOpportunity:!1},{id:"001Wj00000bwVuH",name:"Markel Corporation",hadOpportunity:!1},{id:"001Wj00000Pfppo",name:"Marks Baughan",hadOpportunity:!1},{id:"001Wj00000ah6dm",name:"Martis Capital",hadOpportunity:!1},{id:"001Hp00003kKrRR",name:"Marvell Technology",hadOpportunity:!0},{id:"001Wj00000PbJ2B",name:"Meridian Capital",hadOpportunity:!1},{id:"001Wj00000ahFC3",name:"Nexa Equity",hadOpportunity:!1},{id:"001Wj00000ahBZv",name:"Norwest Venture Partners",hadOpportunity:!1},{id:"001Wj00000ah6dp",name:"Novanta",hadOpportunity:!1},{id:"001Wj00000ah6dQ",name:"Pacific Avenue Capital Partners",hadOpportunity:!1},{id:"001Wj00000ah6dt",name:"Palladium Equity Partners",hadOpportunity:!1},{id:"001Wj00000iXNFs",name:"Palomar Holdings",hadOpportunity:!0},{id:"001Wj00000ahFCG",name:"Pamlico Capital",hadOpportunity:!1},{id:"001Wj00000W3R2u",name:"Paradigm",hadOpportunity:!1},{id:"001Wj00000bWBlQ",name:"Pegasystems",hadOpportunity:!0},{id:"001Wj00000YcPTM",name:"Percheron Capital",hadOpportunity:!0},{id:"001Wj00000bzz9M",name:"Peregrine Hospitality",hadOpportunity:!0},{id:"001Wj00000VZkJ3",name:"PerformLaw",hadOpportunity:!1},{id:"001Hp00003ljCJ8",name:"Petco",hadOpportunity:!0},{id:"001Wj00000ahFBy",name:"Pharos Capital Group",hadOpportunity:!1},{id:"001Wj00000bwVuF",name:"Pool Corporation",hadOpportunity:!1},{id:"001Wj00000ah48Y",name:"Pritzker Private Capital",hadOpportunity:!1},{id:"001Wj00000mRFNX",name:"Publicis Group",hadOpportunity:!0},{id:"001Hp00003kKXSI",name:"Pure Storage",hadOpportunity:!0},{id:"001Wj00000ah6dS",name:"Quad-C Management",hadOpportunity:!1},{id:"001Hp00003kIrLo",name:"Raymond James Financial",hadOpportunity:!1},{id:"001Wj00000ah6ds",name:"Resilience Capital Partners",hadOpportunity:!1},{id:"001Wj00000m0jBC",name:"RingCentral",hadOpportunity:!0},{id:"001Wj00000ahFC4",name:"Riverside Acceleration Capital",hadOpportunity:!1},{id:"001Wj00000ah48a",name:"Riverside Partners",hadOpportunity:!1},{id:"001Wj00000ahFCE",name:"Rustic Canyon Partners",hadOpportunity:!1},{id:"001Wj00000ah6dR",name:"Sageview Capital",hadOpportunity:!1},{id:"001Wj00000ahFCN",name:"Salt Creek Capital",hadOpportunity:!1},{id:"001Wj00000lzlLX",name:"Sandbox",hadOpportunity:!0},{id:"001Wj00000nldrK",name:"Scout Motors",hadOpportunity:!0},{id:"001Wj00000ah48Z",name:"Searchlight Capital",hadOpportunity:!1},{id:"001Wj00000ahBZq",name:"Serent Capital",hadOpportunity:!1},{id:"001Hp00003kIrEB",name:"Silver Lake",hadOpportunity:!0},{id:"001Wj00000ahBZo",name:"Siris Capital Group",hadOpportunity:!1},{id:"001Wj00000ah6db",name:"Solace Capital Partners",hadOpportunity:!1},{id:"001Wj00000ahFCF",name:"Solis Capital Partners",hadOpportunity:!1},{id:"001Wj00000VkQyY",name:"Sonja Cotton & Associates",hadOpportunity:!1},{id:"001Wj00000ah6dO",name:"Sorenson Capital",hadOpportunity:!1},{id:"001Wj00000lygkU",name:"SoundPoint Capital",hadOpportunity:!0},{id:"001Wj00000lxbYR",name:"Spark Brighter Thinking",hadOpportunity:!0},{id:"001Wj00000ah6dj",name:"Spectrum Equity",hadOpportunity:!0},{id:"001Wj00000lusqi",name:"Symphony Technology Partners",hadOpportunity:!0},{id:"001Wj00000tOAoE",name:"TA Associates",hadOpportunity:!0},{id:"001Hp00003kKrU1",name:"TPG",hadOpportunity:!0},{id:"001Wj00000dNhDy",name:"TSS Europe",hadOpportunity:!0},{id:"001Wj00000QTbzh",name:"Taytrom",hadOpportunity:!1},{id:"001Wj00000ahFCY",name:"The Courtney Group",hadOpportunity:!1},{id:"001Wj00000ahFCZ",name:"The Riverside Company",hadOpportunity:!1},{id:"001Wj00000cgCF8",name:"Titan AI",hadOpportunity:!1},{id:"001Wj00000nlOIv",name:"Together Fund",hadOpportunity:!0},{id:"001Wj00000ah6dX",name:"Topicus.com",hadOpportunity:!1},{id:"001Hp00003kIrNO",name:"TransDigm Group",hadOpportunity:!1},{id:"001Wj00000ah6dN",name:"Transom Capital Group",hadOpportunity:!1},{id:"001Wj00000ahBZu",name:"Trimble Inc.",hadOpportunity:!1},{id:"001Wj00000ah6dl",name:"Trivest Partners",hadOpportunity:!1},{id:"001Wj00000dXDo3",name:"Tucker's Farm",hadOpportunity:!0},{id:"001Wj00000ah6da",name:"Tyler Technologies",hadOpportunity:!1},{id:"001Wj00000Y6VMa",name:"UBS",hadOpportunity:!0},{id:"001Wj00000ahFCQ",name:"Vance Street Capital",hadOpportunity:!1},{id:"001Wj00000bn8VS",name:"Vista Equity Partners",hadOpportunity:!0},{id:"001Wj00000ahFC0",name:"Vitec Software",hadOpportunity:!1},{id:"001Wj00000ah6dP",name:"Volaris Group",hadOpportunity:!1},{id:"001Hp00003kIrO2",name:"Watsco",hadOpportunity:!1},{id:"001Wj00000ahBZw",name:"West Lane Capital Partners",hadOpportunity:!1},{id:"001Wj00000ahBZy",name:"Zebra Technologies",hadOpportunity:!1}]},"asad.hussain@eudia.com":{email:"asad.hussain@eudia.com",name:"Asad Hussain",accounts:[{id:"001Hp00003kIrFC",name:"AT&T",hadOpportunity:!0},{id:"001Hp00003kIrCy",name:"Airbnb",hadOpportunity:!0},{id:"001Hp00003kIrEe",name:"Amazon",hadOpportunity:!0},{id:"001Wj00000WElj9",name:"American Arbitration Association",hadOpportunity:!0},{id:"001Hp00003kIrCz",name:"American Express",hadOpportunity:!0},{id:"001Wj00000hewsX",name:"Amkor",hadOpportunity:!0},{id:"001Wj00000WZ05x",name:"Applied Intuition",hadOpportunity:!0},{id:"001Hp00003kIrEx",name:"Applied Materials",hadOpportunity:!1},{id:"001Hp00003kIrEz",name:"Archer Daniels Midland",hadOpportunity:!0},{id:"001Wj00000Y0g8Z",name:"Asana",hadOpportunity:!0},{id:"001Wj00000gGYAQ",name:"Autodesk",hadOpportunity:!0},{id:"001Wj00000c0wRA",name:"Away",hadOpportunity:!0},{id:"001Wj00000WTMCR",name:"BNY Mellon",hadOpportunity:!0},{id:"001Wj00000c6DHy",name:"BetterUp",hadOpportunity:!0},{id:"001Hp00003kIrFY",name:"BlackRock",hadOpportunity:!1},{id:"001Hp00003kIrFe",name:"Booz Allen Hamilton",hadOpportunity:!1},{id:"001Wj00000XhcVG",name:"Box.com",hadOpportunity:!0},{id:"001Wj00000bWBla",name:"CNA Insurance",hadOpportunity:!0},{id:"001Wj00000XiYqz",name:"Canva",hadOpportunity:!0},{id:"001Hp00003kIrG0",name:"Carrier Global",hadOpportunity:!1},{id:"001Wj00000mosEX",name:"Carta",hadOpportunity:!0},{id:"001Wj00000ah6dk",name:"Charlesbank Capital Partners",hadOpportunity:!0},{id:"001Wj00000XiXjd",name:"Circle",hadOpportunity:!0},{id:"001Hp00003kIrE5",name:"Coherent",hadOpportunity:!0},{id:"001Hp00003kIrGf",name:"Corning",hadOpportunity:!0},{id:"001Wj00000fgfGu",name:"Cyware",hadOpportunity:!0},{id:"001Hp00003kIrE6",name:"DHL",hadOpportunity:!0},{id:"001Wj00000duIWr",name:"Deepmind",hadOpportunity:!0},{id:"001Hp00003kIrGy",name:"Dell Technologies",hadOpportunity:!1},{id:"001Hp00003kIrGz",name:"Deloitte",hadOpportunity:!0},{id:"001Wj00000W8ZKl",name:"Docusign",hadOpportunity:!0},{id:"001Hp00003kIrHN",name:"Ecolab",hadOpportunity:!0},{id:"001Wj00000dheQN",name:"Emory",hadOpportunity:!0},{id:"001Wj00000bWIxP",name:"Ericsson",hadOpportunity:!0},{id:"001Hp00003kIrHs",name:"FedEx",hadOpportunity:!1},{id:"001Wj00000lMcwT",name:"Flo Health",hadOpportunity:!0},{id:"001Hp00003kIrI3",name:"Fluor",hadOpportunity:!0},{id:"001Hp00003kIrIA",name:"Fox",hadOpportunity:!0},{id:"001Hp00003kJ9oe",name:"Fresh Del Monte",hadOpportunity:!0},{id:"001Wj00000Y6HEY",name:"G-III Apparel Group",hadOpportunity:!0},{id:"001Wj00000kNTF0",name:"GLG",hadOpportunity:!0},{id:"001Hp00003kIrIK",name:"Geico",hadOpportunity:!0},{id:"001Hp00003lhVuD",name:"General Atlantic",hadOpportunity:!0},{id:"001Wj00000dw1gb",name:"Glean",hadOpportunity:!0},{id:"001Hp00003kJ9l1",name:"Google",hadOpportunity:!0},{id:"001Wj00000oqVXg",name:"Goosehead Insurance",hadOpportunity:!0},{id:"001Wj00000tuXZb",name:"Gopuff",hadOpportunity:!0},{id:"001Hp00003kIrDP",name:"HP",hadOpportunity:!0},{id:"001Hp00003kIrIt",name:"HSBC",hadOpportunity:!0},{id:"001Hp00003kL3Mo",name:"Honeywell",hadOpportunity:!0},{id:"001Hp00003kIrIy",name:"Huntsman",hadOpportunity:!0},{id:"001Wj00000d7IL8",name:"IAC",hadOpportunity:!0},{id:"001Hp00003kIrJ0",name:"IBM",hadOpportunity:!0},{id:"001Wj00000hdoLx",name:"Insight Enterprises Inc.",hadOpportunity:!0},{id:"001Wj00000gH7ua",name:"JFrog",hadOpportunity:!0},{id:"001Wj00000tNwur",name:"Janus Henderson",hadOpportunity:!1},{id:"001Wj00000iC14X",name:"Klarna",hadOpportunity:!0},{id:"001Wj00000wSLUl",name:"LexisNexis",hadOpportunity:!1},{id:"001Wj00000mCFtJ",name:"LinkedIn",hadOpportunity:!0},{id:"001Hp00003kIrJu",name:"Lockheed Martin",hadOpportunity:!0},{id:"001Hp00003kIrKC",name:"Mass Mutual Life Insurance",hadOpportunity:!0},{id:"001Hp00003kIrKO",name:"Microsoft",hadOpportunity:!0},{id:"001Wj00000lyDQk",name:"MidOcean Partners",hadOpportunity:!0},{id:"001Hp00003kIrKT",name:"Morgan Stanley",hadOpportunity:!0},{id:"001Wj00000bWIxq",name:"Motiva",hadOpportunity:!0},{id:"001Hp00003kIrKr",name:"NVIDIA",hadOpportunity:!1},{id:"001Hp00003kIrCx",name:"Novartis",hadOpportunity:!0},{id:"001Wj00000hVTTB",name:"One Oncology",hadOpportunity:!0},{id:"001Wj00000Y6VVW",name:"Oscar Health",hadOpportunity:!0},{id:"001Wj00000eLHLO",name:"Palo Alto Networks",hadOpportunity:!1},{id:"001Wj00000kNp2X",name:"Plusgrade",hadOpportunity:!0},{id:"001Wj00000YoLqW",name:"Procore Technologies",hadOpportunity:!0},{id:"001Wj00000lXD0F",name:"RBI (Burger King)",hadOpportunity:!1},{id:"001Hp00003kIrLx",name:"Republic Services",hadOpportunity:!1},{id:"001Wj00000bWJ0J",name:"SAP",hadOpportunity:!1},{id:"001Hp00003kIrD9",name:"Salesforce",hadOpportunity:!0},{id:"001Wj00000fPr6N",name:"Santander",hadOpportunity:!0},{id:"001Hp00003kIrMK",name:"ServiceNow",hadOpportunity:!0},{id:"001Wj00000eL760",name:"Shell",hadOpportunity:!1},{id:"001Wj00000kNmsg",name:"Skims",hadOpportunity:!0},{id:"001Wj00000aCGR3",name:"Solventum",hadOpportunity:!0},{id:"001Hp00003kIrEC",name:"Southwest Airlines",hadOpportunity:!0},{id:"001Hp00003kIrMc",name:"SpaceX",hadOpportunity:!1},{id:"001Wj00000SdYHq",name:"Spotify",hadOpportunity:!0},{id:"001Hp00003kIrDl",name:"StoneX Group",hadOpportunity:!0},{id:"001Wj00000WYtsU",name:"Tenable",hadOpportunity:!0},{id:"001Hp00003kIrN5",name:"Tesla",hadOpportunity:!1},{id:"001Wj00000c0wRK",name:"The Initial Group",hadOpportunity:!0},{id:"001Wj00000bWBlX",name:"Thomson Reuters Ventures",hadOpportunity:!1},{id:"001Hp00003kIrCs",name:"UPS",hadOpportunity:!0},{id:"001Wj00000tuRNo",name:"Virtusa",hadOpportunity:!0},{id:"001Hp00003kIrNw",name:"W.W. Grainger",hadOpportunity:!0},{id:"001Hp00003kIrNy",name:"Walmart",hadOpportunity:!0},{id:"001Wj00000Y64qk",name:"Warburg Pincus LLC",hadOpportunity:!1},{id:"001Wj00000bzz9N",name:"Wealth Partners Capital Group",hadOpportunity:!0},{id:"001Wj00000tuolf",name:"Wynn Las Vegas",hadOpportunity:!0},{id:"001Wj00000bzz9Q",name:"Youtube",hadOpportunity:!0},{id:"001Wj00000uzs1f",name:"Zero RFI",hadOpportunity:!0}]},"conor.molloy@eudia.com":{email:"conor.molloy@eudia.com",name:"Conor Molloy",accounts:[{id:"001Wj00000mCFrf",name:"APEX Group",hadOpportunity:!1},{id:"001Wj00000xxtg6",name:"ASR Nederland",hadOpportunity:!1},{id:"001Hp00003kIrQD",name:"Accenture",hadOpportunity:!0},{id:"001Wj00000qLixn",name:"Al Dahra Group Llc",hadOpportunity:!0},{id:"001Wj00000syNyn",name:"Alliance Healthcare",hadOpportunity:!1},{id:"001Hp00003kIrEy",name:"Aramark Ireland",hadOpportunity:!0},{id:"001Wj00000tWwXk",name:"Aramex",hadOpportunity:!1},{id:"001Wj00000xyXlY",name:"Arkema",hadOpportunity:!1},{id:"001Wj00000mCFrg",name:"Aryza",hadOpportunity:!0},{id:"001Wj00000xz3F7",name:"Aurubis",hadOpportunity:!1},{id:"001Wj00000bWIzJ",name:"BAE Systems, Inc.",hadOpportunity:!1},{id:"001Wj00000fFhea",name:"BBC News",hadOpportunity:!1},{id:"001Wj00000Y6Vk4",name:"BBC Studios",hadOpportunity:!1},{id:"001Wj00000xypIc",name:"BMW Group",hadOpportunity:!1},{id:"001Wj00000eLPna",name:"BP",hadOpportunity:!1},{id:"001Wj00000tsfWO",name:"Baker Tilly",hadOpportunity:!0},{id:"001Wj00000tWwXr",name:"Bestseller",hadOpportunity:!1},{id:"001Wj00000xz3LZ",name:"Bouygues",hadOpportunity:!1},{id:"001Wj00000xz3Td",name:"British Broadcasting Corporation",hadOpportunity:!1},{id:"001Wj00000xyc3f",name:"Carrefour",hadOpportunity:!1},{id:"001Wj00000tWwXy",name:"Citco",hadOpportunity:!1},{id:"001Wj00000mCFrk",name:"Coillte",hadOpportunity:!0},{id:"001Wj00000mCFsH",name:"Consensys",hadOpportunity:!0},{id:"001Wj00000xxS3B",name:"Currys",hadOpportunity:!1},{id:"001Wj00000Y6Vgo",name:"Cushman & Wakefield",hadOpportunity:!1},{id:"001Wj00000tWwY2",name:"DB Schenker",hadOpportunity:!1},{id:"001Wj00000xxpXf",name:"DZ Bank",hadOpportunity:!1},{id:"001Wj00000bWIzG",name:"DZB BANK GmbH",hadOpportunity:!1},{id:"001Wj00000Y6VMZ",name:"Danone",hadOpportunity:!1},{id:"001Wj00000xyCKX",name:"Deutsche Bahn",hadOpportunity:!1},{id:"001Wj00000tWwY3",name:"Dyson",hadOpportunity:!1},{id:"001Wj00000xy3Iu",name:"E.ON",hadOpportunity:!1},{id:"001Wj00000xz3Jx",name:"Electricite de France",hadOpportunity:!1},{id:"001Hp00003kIrHR",name:"Electronic Arts",hadOpportunity:!1},{id:"001Wj00000xz373",name:"Energie Baden-Wurttemberg",hadOpportunity:!1},{id:"001Wj00000xwnL0",name:"Evonik Industries",hadOpportunity:!1},{id:"001Wj00000xyr5v",name:"FMS Wertmanagement",hadOpportunity:!1},{id:"001Wj00000Y6DDb",name:"Federal Reserve Bank of New York",hadOpportunity:!1},{id:"001Wj00000tWwYf",name:"Fenergo",hadOpportunity:!1},{id:"001Wj00000xxuFZ",name:"Finatis",hadOpportunity:!1},{id:"001Wj00000xz3QP",name:"Groupe SEB",hadOpportunity:!1},{id:"001Wj00000syXLZ",name:"Guerbet",hadOpportunity:!1},{id:"001Wj00000xyP83",name:"Heraeus Holding",hadOpportunity:!1},{id:"001Wj00000xxuVh",name:"Hermes International",hadOpportunity:!1},{id:"001Wj00000xz32D",name:"Hornbach Group",hadOpportunity:!1},{id:"001Wj00000hkk0u",name:"ICON",hadOpportunity:!1},{id:"001Wj00000mCFr2",name:"ICON Clinical Research",hadOpportunity:!0},{id:"001Wj00000Y64qd",name:"ION",hadOpportunity:!0},{id:"001Wj00000xz3AH",name:"Ingka Group",hadOpportunity:!1},{id:"001Wj00000tWwXa",name:"Jacobs Engineering Group",hadOpportunity:!1},{id:"001Wj00000xz30c",name:"Johnson Matthey",hadOpportunity:!1},{id:"001Wj00000mCFtM",name:"Kellanova",hadOpportunity:!0},{id:"001Wj00000xz3S1",name:"Klockner",hadOpportunity:!1},{id:"001Wj00000tWwYC",name:"Kuehne & Nagel",hadOpportunity:!1},{id:"001Wj00000bWIym",name:"LSEG",hadOpportunity:!1},{id:"001Wj00000Y6VZE",name:"Linde",hadOpportunity:!1},{id:"001Wj00000xy1Lu",name:"M&G",hadOpportunity:!1},{id:"001Wj00000xz0h4",name:"Metinvest",hadOpportunity:!1},{id:"001Wj00000xyNse",name:"NN Group",hadOpportunity:!1},{id:"001Wj00000xyECc",name:"Network Rail",hadOpportunity:!1},{id:"001Wj00000xyudG",name:"Nordex",hadOpportunity:!1},{id:"001Wj00000tWwXc",name:"Ocorian",hadOpportunity:!1},{id:"001Wj00000fFW1m",name:"Okta",hadOpportunity:!1},{id:"001Wj00000mCFrI",name:"Orsted",hadOpportunity:!0},{id:"001Wj00000tWwYK",name:"PGIM",hadOpportunity:!1},{id:"001Wj00000xz38f",name:"PPF Group",hadOpportunity:!1},{id:"001Wj00000tWwYi",name:"Penneys",hadOpportunity:!1},{id:"001Wj00000tWwYL",name:"Philips Electronics",hadOpportunity:!1},{id:"001Wj00000tWwYP",name:"Reddit",hadOpportunity:!1},{id:"001Wj00000mCFrU",name:"Riot Games",hadOpportunity:!0},{id:"001Wj00000xyD0Q",name:"Rolls-Royce",hadOpportunity:!1},{id:"001Wj00000xxIqC",name:"Royal Ahold Delhaize",hadOpportunity:!1},{id:"001Wj00000xz3Gj",name:"Rubis",hadOpportunity:!1},{id:"001Wj00000xyrh0",name:"Salzgitter",hadOpportunity:!1},{id:"001Wj00000bWBm6",name:"Schneider Electric",hadOpportunity:!1},{id:"001Wj00000mI9Nm",name:"Sequoia Climate Fund",hadOpportunity:!1},{id:"001Wj00000fCp7J",name:"Siemens",hadOpportunity:!1},{id:"001Wj00000tWwYR",name:"Smurfit Kappa",hadOpportunity:!1},{id:"001Wj00000tWwYS",name:"Stewart",hadOpportunity:!1},{id:"001Wj00000syavy",name:"Symrise AG",hadOpportunity:!1},{id:"001Wj00000mCFs0",name:"Taoglas Limited",hadOpportunity:!0},{id:"001Wj00000mCFtP",name:"Teamwork.com",hadOpportunity:!0},{id:"001Wj00000sxsOq",name:"TechnipFMC",hadOpportunity:!1},{id:"001Wj00000tWwXe",name:"Teneo",hadOpportunity:!1},{id:"001Wj00000Y64qc",name:"Thales",hadOpportunity:!1},{id:"001Hp00003kIrNJ",name:"Toyota",hadOpportunity:!0},{id:"001Wj00000mCFqw",name:"Ulster Bank",hadOpportunity:!1},{id:"001Wj00000xxDSI",name:"Unedic",hadOpportunity:!1},{id:"001Wj00000mCFs2",name:"Vantage Towers",hadOpportunity:!0},{id:"001Hp00003kIrNs",name:"Vistra",hadOpportunity:!0},{id:"001Wj00000Y6VZD",name:"WPP",hadOpportunity:!0},{id:"001Wj00000ZLVpT",name:"Wellspring Philanthropic Fund",hadOpportunity:!0},{id:"001Wj00000mCFsY",name:"World Rugby",hadOpportunity:!1},{id:"001Wj00000xyygs",name:"Wurth",hadOpportunity:!1},{id:"001Wj00000aLlzL",name:"Xerox",hadOpportunity:!1},{id:"001Wj00000j3QNL",name:"adidas",hadOpportunity:!1}]},"david.vanreyk@eudia.com":{email:"david.vanreyk@eudia.com",name:"David Van Reyk",accounts:[{id:"001Wj00000cIA4i",name:"Amerivet",hadOpportunity:!0},{id:"001Wj00000dw9pN",name:"Ardian",hadOpportunity:!0}]},"emer.flynn@eudia.com":{email:"emer.flynn@eudia.com",name:"Emer Flynn",accounts:[{id:"001Wj00000syUts",name:"Bakkavor",hadOpportunity:!1},{id:"001Wj00000syAdO",name:"Bonduelle",hadOpportunity:!1},{id:"001Wj00000syAoe",name:"Gerresheimer",hadOpportunity:!1},{id:"001Wj00000syBb5",name:"Harbour Energy",hadOpportunity:!1},{id:"001Wj00000soqIv",name:"Lundbeck",hadOpportunity:!1},{id:"001Wj00000mCFr6",name:"NTMA",hadOpportunity:!0},{id:"001Wj00000sxy9J",name:"Orion Pharma",hadOpportunity:!1},{id:"001Wj00000soqNk",name:"Sobi",hadOpportunity:!1},{id:"001Wj00000sy54F",name:"SubSea7",hadOpportunity:!1},{id:"001Wj00000sxvzJ",name:"Virbac",hadOpportunity:!1}]},"greg.machale@eudia.com":{email:"greg.machale@eudia.com",name:"Greg MacHale",accounts:[{id:"001Wj00000Y64ql",name:"ABN AMRO Bank N.V.",hadOpportunity:!1},{id:"001Wj00000tWwYd",name:"AXA",hadOpportunity:!1},{id:"001Hp00003kIrEF",name:"Abbott Laboratories",hadOpportunity:!0},{id:"001Wj00000tWwXg",name:"Abtran",hadOpportunity:!1},{id:"001Wj00000umCEl",name:"Aerogen",hadOpportunity:!1},{id:"001Wj00000xyMyB",name:"Air Liquide",hadOpportunity:!1},{id:"001Wj00000tWwYa",name:"Allergan",hadOpportunity:!1},{id:"001Wj00000sgXdB",name:"Allianz Insurance",hadOpportunity:!0},{id:"001Wj00000tWwYb",name:"Almac Group",hadOpportunity:!1},{id:"001Hp00003kIrEm",name:"Amgen",hadOpportunity:!1},{id:"001Wj00000pzTPu",name:"Arrow Global Group PLC/Mars Capital",hadOpportunity:!1},{id:"001Wj00000tWwXm",name:"Arvato Digital Services",hadOpportunity:!1},{id:"001Wj00000tWwXn",name:"Arvato Supply Chain Solutions",hadOpportunity:!1},{id:"001Wj00000tWwYc",name:"Arvato Systems",hadOpportunity:!1},{id:"001Wj00000xz3VF",name:"Asklepios",hadOpportunity:!1},{id:"001Wj00000vWwfx",name:"Associated British Foods",hadOpportunity:!1},{id:"001Hp00003kIrFB",name:"AstraZeneca",hadOpportunity:!1},{id:"001Wj00000bWJ0A",name:"Atos",hadOpportunity:!1},{id:"001Wj00000hfWMu",name:"Aya Healthcare",hadOpportunity:!1},{id:"001Wj00000tWwXV",name:"BCM Group",hadOpportunity:!1},{id:"001Wj00000tWwXU",name:"BCMGlobal ASI Ltd",hadOpportunity:!1},{id:"001Wj00000Y6VMd",name:"BNP Paribas",hadOpportunity:!0},{id:"001Wj00000X4OqN",name:"BT Group",hadOpportunity:!0},{id:"001Wj00000vRJ13",name:"BWG Group",hadOpportunity:!1},{id:"001Wj00000bWBsw",name:"Bausch + Lomb",hadOpportunity:!1},{id:"001Hp00003kIrFO",name:"Baxter International",hadOpportunity:!1},{id:"001Wj00000wLIjh",name:"Baywa",hadOpportunity:!1},{id:"001Wj00000tWwXs",name:"Bidvest Noonan",hadOpportunity:!1},{id:"001Wj00000mCFqr",name:"Biomarin International Limited",hadOpportunity:!0},{id:"001Hp00003kIrFd",name:"Booking Holdings",hadOpportunity:!0},{id:"001Wj00000T5gdt",name:"Bosch",hadOpportunity:!1},{id:"001Hp00003kIrFg",name:"Boston Scientific",hadOpportunity:!1},{id:"001Wj00000xyNsd",name:"Brenntag",hadOpportunity:!1},{id:"001Wj00000tgYgj",name:"British American Tobacco ( BAT )",hadOpportunity:!1},{id:"001Wj00000ulXoK",name:"British Petroleum ( BP )",hadOpportunity:!1},{id:"001Hp00003kIrDK",name:"Bupa",hadOpportunity:!1},{id:"001Wj00000bWBkr",name:"CRH",hadOpportunity:!1},{id:"001Wj00000uZ5J7",name:"Canada Life",hadOpportunity:!0},{id:"001Hp00003kIrFu",name:"Capgemini",hadOpportunity:!1},{id:"001Wj00000tWwYe",name:"Capita",hadOpportunity:!1},{id:"001Wj00000mCFt9",name:"Cerberus European Servicing",hadOpportunity:!0},{id:"001Wj00000tWwXz",name:"CluneTech",hadOpportunity:!1},{id:"001Wj00000wKnrE",name:"Co-operative Group ( Co-op )",hadOpportunity:!1},{id:"001Wj00000Y6HEM",name:"Commerzbank AG",hadOpportunity:!1},{id:"001Wj00000aLp9L",name:"Compass",hadOpportunity:!1},{id:"001Wj00000cSBr6",name:"Compass Group Equity Partners",hadOpportunity:!1},{id:"001Wj00000Y6VMk",name:"Computershare",hadOpportunity:!0},{id:"001Wj00000uP5x8",name:"Cornmarket Financial Services",hadOpportunity:!0},{id:"001Wj00000tWwY0",name:"Cornmarket Hill Trading Limited",hadOpportunity:!1},{id:"001Hp00003kIrGk",name:"Covestro",hadOpportunity:!1},{id:"001Wj00000tWwXY",name:"DCC Vital",hadOpportunity:!1},{id:"001Wj00000mCFrV",name:"Danske Bank",hadOpportunity:!1},{id:"001Hp00003kJ9fx",name:"Deutsche Bank AG",hadOpportunity:!1},{id:"001Wj00000Y6VMM",name:"Diageo",hadOpportunity:!0},{id:"001Wj00000prFOX",name:"Doosan Bobcat",hadOpportunity:!0},{id:"001Wj00000wKzZ1",name:"Drax Group",hadOpportunity:!1},{id:"001Hp00003kIrHQ",name:"EG Group",hadOpportunity:!1},{id:"001Wj00000hUcQZ",name:"EY",hadOpportunity:!0},{id:"001Wj00000wK30S",name:"EY ( Ernst & Young )",hadOpportunity:!1},{id:"001Hp00003kIrHL",name:"Eaton Corporation",hadOpportunity:!1},{id:"001Wj00000mCFtR",name:"Ekco Cloud Limited",hadOpportunity:!0},{id:"001Hp00003kIrHS",name:"Elevance Health",hadOpportunity:!1},{id:"001Hp00003kIrHT",name:"Eli Lilly",hadOpportunity:!1},{id:"001Wj00000Y6HEn",name:"Ferring Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000tWwYn",name:"Fibrus",hadOpportunity:!1},{id:"001Hp00003kIrHu",name:"Fidelity Investments",hadOpportunity:!1},{id:"001Hp00003kIrI0",name:"Fiserv",hadOpportunity:!1},{id:"001Wj00000xxg4V",name:"Fnac Darty",hadOpportunity:!1},{id:"001Wj00000wL79x",name:"Frasers Group",hadOpportunity:!1},{id:"001Wj00000aLlyX",name:"Gartner",hadOpportunity:!1},{id:"001Wj00000fFuFY",name:"Grant Thornton",hadOpportunity:!0},{id:"001Wj00000uZ4A9",name:"Great West Lifec co",hadOpportunity:!0},{id:"001Wj00000pzTPt",name:"Gym Plus Coffee",hadOpportunity:!1},{id:"001Wj00000xW3SE",name:"Hayfin",hadOpportunity:!0},{id:"001Wj00000pzTPm",name:"Hedgserv",hadOpportunity:!1},{id:"001Wj00000xxsbv",name:"Heidelberg Materials",hadOpportunity:!1},{id:"001Wj00000wvtPl",name:"ICEYE",hadOpportunity:!0},{id:"001Wj00000mCFrH",name:"Indra",hadOpportunity:!1},{id:"001Wj00000uZtcT",name:"Ineos",hadOpportunity:!0},{id:"001Wj00000vXdt1",name:"International Airline Group ( IAG )",hadOpportunity:!1},{id:"001Wj00000wKnZU",name:"International Distribution Services",hadOpportunity:!1},{id:"001Wj00000wKTao",name:"John Swire & Sons",hadOpportunity:!1},{id:"001Wj00000vaqot",name:"Johnson Controls",hadOpportunity:!1},{id:"001Wj00000xwwRX",name:"Jumbo Groep Holding",hadOpportunity:!1},{id:"001Hp00003kIrJb",name:"KPMG",hadOpportunity:!1},{id:"001Wj00000Y6VZM",name:"Kering",hadOpportunity:!1},{id:"001Wj00000mCFrr",name:"Kerry Group",hadOpportunity:!1},{id:"001Wj00000xyyk7",name:"La Poste",hadOpportunity:!1},{id:"001Wj00000tWwYr",name:"Laya Healthcare",hadOpportunity:!1},{id:"001Wj00000tWwYE",name:"Leaseplan",hadOpportunity:!1},{id:"001Wj00000tWwYF",name:"Linked Finance",hadOpportunity:!1},{id:"001Wj00000Y6HEA",name:"Lloyds Banking Group",hadOpportunity:!1},{id:"001Wj00000xyDV4",name:"LyondellBasell Industries",hadOpportunity:!1},{id:"001Wj00000tWwYG",name:"MSC - Mediterranean Shipping Company",hadOpportunity:!1},{id:"001Wj00000wvGLB",name:"MTU Maintenance Lease Services",hadOpportunity:!1},{id:"001Wj00000iC14L",name:"MUFG Investor Services",hadOpportunity:!1},{id:"001Wj00000xyp2U",name:"MVV Energie",hadOpportunity:!1},{id:"001Wj00000tWwYp",name:"Mail Metrics",hadOpportunity:!0},{id:"001Wj00000qFtCk",name:"Mars Capital",hadOpportunity:!1},{id:"001Wj00000pAeWg",name:"Meetingsbooker",hadOpportunity:!0},{id:"001Hp00003kIrKJ",name:"Mercedes-Benz Group",hadOpportunity:!0},{id:"001Wj00000YEMaI",name:"Mercer",hadOpportunity:!1},{id:"001Wj00000vwSUX",name:"Mercor",hadOpportunity:!0},{id:"001Wj00000mCFtU",name:"Mercury Engineering",hadOpportunity:!0},{id:"001Wj00000yGZth",name:"Monzo",hadOpportunity:!1},{id:"001Wj00000tWwYg",name:"Musgrave",hadOpportunity:!1},{id:"001Wj00000lPFP3",name:"Nomura",hadOpportunity:!0},{id:"001Wj00000tWwYH",name:"Norbrook Laboratories",hadOpportunity:!1},{id:"001Hp00003kIrKn",name:"Northrop Grumman",hadOpportunity:!1},{id:"001Wj00000xxcH4",name:"Orange",hadOpportunity:!1},{id:"001Wj00000tWwYI",name:"P.J. Carroll (BAT Ireland)",hadOpportunity:!1},{id:"001Wj00000mCFsf",name:"Pepper Finance Corporation",hadOpportunity:!0},{id:"001Wj00000mCFrO",name:"Peptalk",hadOpportunity:!0},{id:"001Wj00000mCFr1",name:"Permanent TSB plc",hadOpportunity:!0},{id:"001Wj00000Y6QfR",name:"Pernod Ricard",hadOpportunity:!0},{id:"001Wj00000vVxFy",name:"Phoenix Group",hadOpportunity:!1},{id:"001Wj00000tWwYM",name:"Pinewood Laboratories",hadOpportunity:!1},{id:"001Wj00000tWwYN",name:"Pinsent Masons",hadOpportunity:!1},{id:"001Wj00000tWwYO",name:"Pramerica",hadOpportunity:!1},{id:"001Hp00003kIrLf",name:"PwC",hadOpportunity:!1},{id:"001Hp00003kIrLi",name:"Quest Diagnostics",hadOpportunity:!0},{id:"001Wj00000xy735",name:"RATP Group",hadOpportunity:!1},{id:"001Wj00000xyKjS",name:"Randstad",hadOpportunity:!1},{id:"001Wj00000mCFsF",name:"Regeneron",hadOpportunity:!0},{id:"001Wj00000xwh4H",name:"Renault",hadOpportunity:!1},{id:"001Wj00000xy1P5",name:"Rheinmetall",hadOpportunity:!1},{id:"001Wj00000tWwYQ",name:"Roche",hadOpportunity:!1},{id:"001Wj00000wKi8O",name:"Royal London",hadOpportunity:!1},{id:"001Wj00000mCFsR",name:"Ryanair",hadOpportunity:!0},{id:"001Wj00000xyJqd",name:"SCOR",hadOpportunity:!1},{id:"001Wj00000pAxKo",name:"SSP Group",hadOpportunity:!0},{id:"001Wj00000bWIzx",name:"Saint-Gobain",hadOpportunity:!1},{id:"001Wj00000pzTPv",name:"Scottish Friendly",hadOpportunity:!1},{id:"001Wj00000bzz9U",name:"Signify Group",hadOpportunity:!0},{id:"001Wj00000fFuG4",name:"Sky",hadOpportunity:!1},{id:"001Hp00003kIrDR",name:"Smith & Nephew",hadOpportunity:!1},{id:"001Hp00003kIrE1",name:"Societe Generale",hadOpportunity:!1},{id:"001Hp00003kIrMj",name:"State Street",hadOpportunity:!0},{id:"001Wj00000xyy4A",name:"Sudzucker",hadOpportunity:!1},{id:"001Wj00000mCFtB",name:"SurveyMonkey",hadOpportunity:!1},{id:"001Wj00000xypQh",name:"TUI",hadOpportunity:!1},{id:"001Wj00000tWwYT",name:"Takeda",hadOpportunity:!1},{id:"001Wj00000wKD4c",name:"Talanx",hadOpportunity:!1},{id:"001Wj00000mCFr9",name:"Tesco",hadOpportunity:!0},{id:"001Wj00000tWwYX",name:"Tullow Oil",hadOpportunity:!1},{id:"001Wj00000mCFsS",name:"Uniphar PLC",hadOpportunity:!0},{id:"001Hp00003kIrNg",name:"UnitedHealth Group",hadOpportunity:!1},{id:"001Wj00000mCFsx",name:"Vodafone Ireland",hadOpportunity:!1},{id:"001Wj00000xybh4",name:"Wendel",hadOpportunity:!1},{id:"001Wj00000sCb3D",name:"Willis Towers Watson",hadOpportunity:!1},{id:"001Wj00000tWwYY",name:"Winthrop",hadOpportunity:!1},{id:"001Wj00000pzTPW",name:"WizzAir",hadOpportunity:!1},{id:"001Wj00000mCFrm",name:"eShopWorld",hadOpportunity:!0},{id:"001Hp00003kJ9Ck",name:"wnco.com",hadOpportunity:!1}]},"himanshu.agarwal@eudia.com":{email:"himanshu.agarwal@eudia.com",name:"Himanshu Agarwal",accounts:[{id:"001Hp00003kIrEs",name:"AON",hadOpportunity:!0},{id:"001Wj00000RwUpO",name:"Acrisure",hadOpportunity:!0},{id:"001Hp00003kIrCd",name:"Adobe",hadOpportunity:!1},{id:"001Hp00003kIrEU",name:"Albertsons",hadOpportunity:!0},{id:"001Wj00000T6Hrw",name:"Atlassian",hadOpportunity:!0},{id:"001Wj00000ZRrYl",name:"Avis Budget Group",hadOpportunity:!0},{id:"001Wj00000kIYAD",name:"Axis Bank",hadOpportunity:!0},{id:"001Hp00003kIrD0",name:"Broadcom",hadOpportunity:!0},{id:"001Hp00003kIrGh",name:"Costco Wholesale",hadOpportunity:!1},{id:"001Hp00003kIrCu",name:"Disney",hadOpportunity:!1},{id:"001Hp00003kIrIF",name:"Gap",hadOpportunity:!0},{id:"001Hp00003kIrDN",name:"Genpact",hadOpportunity:!0},{id:"001Wj00000Zcmad",name:"Geodis",hadOpportunity:!0},{id:"001Wj00000Q2yaX",name:"Innovative Driven",hadOpportunity:!1},{id:"001Hp00003lhshd",name:"Instacart",hadOpportunity:!0},{id:"001Hp00003kIrJx",name:"Lowe's",hadOpportunity:!1},{id:"001Hp00003kIrDk",name:"Moderna",hadOpportunity:!0},{id:"001Wj00000hDvCc",name:"Nykaa",hadOpportunity:!0},{id:"001Wj00000h9r1F",name:"Piramal Finance",hadOpportunity:!0},{id:"001Hp00003kIrDc",name:"Progressive",hadOpportunity:!0},{id:"001Wj00000cyDxS",name:"Pyxus",hadOpportunity:!0},{id:"001Wj00000XXvnk",name:"Relativity",hadOpportunity:!0},{id:"001Wj00000kIFDh",name:"Reliance",hadOpportunity:!0},{id:"001Wj00000eKsGZ",name:"Snowflake",hadOpportunity:!1},{id:"001Hp00003kIrNr",name:"Visa",hadOpportunity:!0},{id:"001Hp00003kIrO0",name:"Warner Bros Discovery",hadOpportunity:!1},{id:"001Hp00003kIrDT",name:"xAI",hadOpportunity:!0}]},"jon.cobb@eudia.com":{email:"jon.cobb@eudia.com",name:"Jon Cobb",accounts:[{id:"001Wj00000XTOQZ",name:"Armstrong World Industries",hadOpportunity:!0},{id:"001Wj00000c0Cxn",name:"U.S. Aircraft Insurance Group",hadOpportunity:!0}]},"julie.stefanich@eudia.com":{email:"julie.stefanich@eudia.com",name:"Julie Stefanich",accounts:[{id:"001Wj00000asSHB",name:"Airbus",hadOpportunity:!0},{id:"001Hp00003kIrEl",name:"Ameriprise Financial",hadOpportunity:!0},{id:"001Wj00000X6IDs",name:"Andersen",hadOpportunity:!0},{id:"001Hp00003kIrEv",name:"Apple",hadOpportunity:!0},{id:"001Wj00000soLVH",name:"Base Power",hadOpportunity:!0},{id:"001Hp00003kJ9pX",name:"Bayer",hadOpportunity:!0},{id:"001Hp00003kIrFP",name:"Bechtel",hadOpportunity:!0},{id:"001Hp00003kIrFZ",name:"Block",hadOpportunity:!0},{id:"001Hp00003kIrE3",name:"Cargill",hadOpportunity:!0},{id:"001Hp00003kIrGD",name:"Charles Schwab",hadOpportunity:!0},{id:"001Hp00003kIrE4",name:"Chevron",hadOpportunity:!0},{id:"001Hp00003kIrDh",name:"Comcast",hadOpportunity:!0},{id:"001Hp00003kIrGe",name:"Corebridge Financial",hadOpportunity:!0},{id:"001Wj00000eLJAK",name:"CrowdStrike",hadOpportunity:!1},{id:"001Hp00003liBe9",name:"DoorDash",hadOpportunity:!1},{id:"001Hp00003kIrE7",name:"ECMS",hadOpportunity:!0},{id:"001Hp00003kIrHP",name:"Edward Jones",hadOpportunity:!0},{id:"001Wj00000iRzqv",name:"Florida Crystals Corporation",hadOpportunity:!0},{id:"001Wj00000XS3MX",name:"Flutter",hadOpportunity:!0},{id:"001Hp00003kIrIP",name:"Genworth Financial",hadOpportunity:!0},{id:"001Hp00003kIrIX",name:"Goldman Sachs",hadOpportunity:!0},{id:"001Wj00000rceVp",name:"Hikma",hadOpportunity:!0},{id:"001Hp00003kIrJV",name:"KLA",hadOpportunity:!0},{id:"001Wj00000XkT43",name:"Kaiser Permanente",hadOpportunity:!0},{id:"001Wj00000aLmhe",name:"Macmillan",hadOpportunity:!0},{id:"001Wj00000X6G8q",name:"Mainsail Partners",hadOpportunity:!0},{id:"001Hp00003kIrDb",name:"McKinsey & Company",hadOpportunity:!0},{id:"001Hp00003kIrKL",name:"MetLife",hadOpportunity:!0},{id:"001Hp00003kIrCp",name:"Mosaic",hadOpportunity:!0},{id:"001Hp00003kIrDe",name:"National Grid",hadOpportunity:!0},{id:"001Hp00003kIrKY",name:"Netflix",hadOpportunity:!0},{id:"001Hp00003kIrKj",name:"Nordstrom",hadOpportunity:!0},{id:"001Hp00003kIrL2",name:"O'Reilly Automotive",hadOpportunity:!0},{id:"001Hp00003kIrDv",name:"Oracle",hadOpportunity:!0},{id:"001Hp00003kIrLP",name:"PG&E",hadOpportunity:!1},{id:"001Hp00003kIrLH",name:"PayPal inc.",hadOpportunity:!1},{id:"001Hp00003kIrLN",name:"Petsmart",hadOpportunity:!0},{id:"001Hp00003kIrLZ",name:"Procter & Gamble",hadOpportunity:!0},{id:"001Wj00000XcHEb",name:"Resmed",hadOpportunity:!0},{id:"001Hp00003lhsUY",name:"Rio Tinto Group",hadOpportunity:!0},{id:"001Wj00000svQI3",name:"Safelite",hadOpportunity:!0},{id:"001Wj00000Yfysf",name:"Samsara",hadOpportunity:!0},{id:"001Wj00000fRtLm",name:"State Farm",hadOpportunity:!0},{id:"001Hp00003kIrNH",name:"T-Mobile",hadOpportunity:!0},{id:"001Hp00003kIrCr",name:"TIAA",hadOpportunity:!0},{id:"001Wj00000bIVo1",name:"TSMC",hadOpportunity:!0},{id:"001Wj00000bzz9T",name:"Tailored Brands",hadOpportunity:!0},{id:"001Hp00003kIrNB",name:"The Wonderful Company",hadOpportunity:!0},{id:"001Hp00003kIrNV",name:"Uber",hadOpportunity:!0},{id:"001Wj00000Y6VYk",name:"Verifone",hadOpportunity:!0},{id:"001Hp00003kIrOL",name:"World Wide Technology",hadOpportunity:!0},{id:"001Wj00000bWIza",name:"eBay",hadOpportunity:!1}]},"justin.hills@eudia.com":{email:"justin.hills@eudia.com",name:"Justin Hills",accounts:[{id:"001Wj00000vCx6j",name:"1800 Flowers",hadOpportunity:!1},{id:"001Wj00000Y6VM4",name:"Ares Management Corporation",hadOpportunity:!0},{id:"001Hp00003kIrG8",name:"Centene",hadOpportunity:!0},{id:"001Wj00000c9oCv",name:"Cox Media Group",hadOpportunity:!0},{id:"001Wj00000vCPMs",name:"Crusoe",hadOpportunity:!1},{id:"001Wj00000vCiAw",name:"Deel",hadOpportunity:!1},{id:"001Wj00000Y0jPm",name:"Delinea",hadOpportunity:!0},{id:"001Wj00000iwKGQ",name:"Dominos",hadOpportunity:!0},{id:"001Hp00003kIrDa",name:"Duracell",hadOpportunity:!0},{id:"001Wj00000Y6Vde",name:"EPIC Insurance Brokers & Consultants",hadOpportunity:!1},{id:"001Hp00003kIrIC",name:"Freddie Mac",hadOpportunity:!1},{id:"001Hp00003kJ9gW",name:"Genentech",hadOpportunity:!0},{id:"001Hp00003kIrDV",name:"Intel",hadOpportunity:!0},{id:"001Hp00003kIrJJ",name:"Johnson & Johnson",hadOpportunity:!0},{id:"001Wj00000gnrug",name:"Kraken",hadOpportunity:!0},{id:"001Wj00000op4EW",name:"McCormick & Co Inc",hadOpportunity:!0},{id:"001Wj00000RCeqA",name:"Nielsen",hadOpportunity:!0},{id:"001Wj00000YEMZp",name:"Notion",hadOpportunity:!1},{id:"001Wj00000ix7c2",name:"Nouryon",hadOpportunity:!0},{id:"001Wj00000WYyKI",name:"Ramp",hadOpportunity:!0},{id:"001Wj00000hzxnD",name:"Ro Healthcare",hadOpportunity:!1},{id:"001Hp00003kIrMi",name:"Starbucks",hadOpportunity:!0},{id:"001Wj00000o5G0v",name:"StockX",hadOpportunity:!0},{id:"001Wj00000f3bWU",name:"TransUnion",hadOpportunity:!0},{id:"001Wj00000oqRyc",name:"Walgreens Boots Alliance",hadOpportunity:!0}]},"mike.ayres@eudia.com":{email:"mike.ayres@eudia.com",name:"Mike Ayres",accounts:[{id:"001Wj00000synYD",name:"Barry Callebaut Group",hadOpportunity:!1}]},"mike@eudia.com":{email:"mike@eudia.com",name:"Mike Masiello",accounts:[{id:"001Wj00000celOy",name:"Arizona Gov Office",hadOpportunity:!1},{id:"001Wj00000p1lCP",name:"Army Applications Lab",hadOpportunity:!0},{id:"001Wj00000p1hYb",name:"Army Corps of Engineers",hadOpportunity:!0},{id:"001Wj00000ZxEpD",name:"Army Futures Command",hadOpportunity:!0},{id:"001Hp00003lhZrR",name:"DARPA",hadOpportunity:!0},{id:"001Wj00000bWBlA",name:"Defense Innovation Unit (DIU)",hadOpportunity:!0},{id:"001Hp00003kJzoR",name:"Gov - Civ",hadOpportunity:!1},{id:"001Hp00003kJuJ5",name:"Gov - DOD",hadOpportunity:!0},{id:"001Wj00000p1PVH",name:"IFC",hadOpportunity:!0},{id:"001Wj00000UkYiC",name:"MITRE",hadOpportunity:!1},{id:"001Wj00000VVJ31",name:"NATO",hadOpportunity:!0},{id:"001Wj00000Ukxzt",name:"SIIA",hadOpportunity:!1},{id:"001Wj00000p1Ybm",name:"SOCOM",hadOpportunity:!0},{id:"001Wj00000Zwarp",name:"Second Front",hadOpportunity:!1},{id:"001Hp00003lhcL9",name:"Social Security Administration",hadOpportunity:!0},{id:"001Wj00000p1jH3",name:"State of Alaska",hadOpportunity:!0},{id:"001Wj00000hVa6V",name:"State of Arizona",hadOpportunity:!0},{id:"001Wj00000p0PcE",name:"State of California",hadOpportunity:!0},{id:"001Wj00000bWBke",name:"U.S. Air Force",hadOpportunity:!0},{id:"001Wj00000bWIzN",name:"U.S. Army",hadOpportunity:!0},{id:"001Hp00003kIrDU",name:"U.S. Government",hadOpportunity:!1},{id:"001Wj00000p1SRX",name:"U.S. Marine Corps",hadOpportunity:!0},{id:"001Wj00000hfaDc",name:"U.S. Navy",hadOpportunity:!0},{id:"001Wj00000Rrm5O",name:"UK Government",hadOpportunity:!0},{id:"001Hp00003lieJP",name:"USDA",hadOpportunity:!0},{id:"001Wj00000p1SuZ",name:"Vulcan Special Ops",hadOpportunity:!0}]},"mitch.loquaci@eudia.com":{email:"mitch.loquaci@eudia.com",name:"Mitch Loquaci",accounts:[{id:"001Hp00003kIrCn",name:"Home Depot",hadOpportunity:!0},{id:"001Wj00000wlTbU",name:"Mimecast",hadOpportunity:!1},{id:"001Wj00000cpxt0",name:"Novelis",hadOpportunity:!0}]},"nathan.shine@eudia.com":{email:"nathan.shine@eudia.com",name:"Nathan Shine",accounts:[{id:"001Wj00000xy4hv",name:"ASDA Group",hadOpportunity:!1},{id:"001Wj00000xz26A",name:"Achmea",hadOpportunity:!1},{id:"001Wj00000xyb9C",name:"Adient",hadOpportunity:!1},{id:"001Hp00003kIrEn",name:"Amphenol",hadOpportunity:!0},{id:"001Wj00000mCFr3",name:"Ancestry",hadOpportunity:!0},{id:"001Wj00000xxHhF",name:"Ashtead Group",hadOpportunity:!1},{id:"001Wj00000mCFr5",name:"Boomi",hadOpportunity:!1},{id:"001Wj00000mCFrQ",name:"CaliberAI",hadOpportunity:!1},{id:"001Wj00000WiFP8",name:"Cantor Fitzgerald",hadOpportunity:!0},{id:"001Wj00000mCFrj",name:"CarTrawler",hadOpportunity:!0},{id:"001Wj00000xz2UM",name:"Carnival",hadOpportunity:!1},{id:"001Wj00000pzTPd",name:"Circle K",hadOpportunity:!1},{id:"001Wj00000xyP82",name:"Claas Group",hadOpportunity:!1},{id:"001Wj00000bW3KA",name:"Cloud Software Group",hadOpportunity:!1},{id:"001Wj00000mHDBo",name:"Coimisiun na Mean",hadOpportunity:!0},{id:"001Wj00000mCFqt",name:"CommScope Technologies",hadOpportunity:!0},{id:"001Wj00000xz2ZC",name:"Continental",hadOpportunity:!1},{id:"001Wj00000Y6wFZ",name:"Coursera",hadOpportunity:!1},{id:"001Wj00000xz3DV",name:"Credit Mutuel Group",hadOpportunity:!1},{id:"001Wj00000Y6DDY",name:"Credit Suisse",hadOpportunity:!1},{id:"001Wj00000pzTPZ",name:"CubeMatch",hadOpportunity:!1},{id:"001Wj00000pzTPb",name:"Dawn Meats",hadOpportunity:!1},{id:"001Wj00000xxtwB",name:"Deutsche Telekom",hadOpportunity:!1},{id:"001Hp00003kIrDM",name:"Dropbox",hadOpportunity:!0},{id:"001Wj00000mCFra",name:"Dunnes Stores",hadOpportunity:!0},{id:"001Wj00000xxq75",name:"ELO Group",hadOpportunity:!1},{id:"001Wj00000xyEnj",name:"Engie",hadOpportunity:!1},{id:"001Wj00000mCFqu",name:"Fexco",hadOpportunity:!0},{id:"001Wj00000mCFsA",name:"First Derivatives",hadOpportunity:!1},{id:"001Wj00000mCFtD",name:"Flynn O'Driscoll, Business Lawyers",hadOpportunity:!1},{id:"001Wj00000xyMmu",name:"Forvia",hadOpportunity:!1},{id:"001Wj00000xz3Bt",name:"Freudenberg Group",hadOpportunity:!1},{id:"001Wj00000mCFro",name:"GemCap",hadOpportunity:!0},{id:"001Wj00000xxqjp",name:"Groupama",hadOpportunity:!1},{id:"001Wj00000xyFdR",name:"Groupe Eiffage",hadOpportunity:!1},{id:"001Wj00000xxtuZ",name:"Hays",hadOpportunity:!1},{id:"001Wj00000xy4A2",name:"HelloFresh",hadOpportunity:!1},{id:"001Wj00000mCFrq",name:"ID-Pal",hadOpportunity:!1},{id:"001Wj00000xz3IL",name:"ING Group",hadOpportunity:!1},{id:"001Wj00000xz2xN",name:"Inchcape",hadOpportunity:!1},{id:"001Wj00000mCFs5",name:"Indeed",hadOpportunity:!0},{id:"001Wj00000sooaT",name:"Ipsen",hadOpportunity:!1},{id:"001Wj00000mCFss",name:"Irish League of Credit Unions",hadOpportunity:!0},{id:"001Wj00000mCFrS",name:"Irish Life",hadOpportunity:!0},{id:"001Wj00000mCFsV",name:"Irish Residential Properties REIT Plc",hadOpportunity:!1},{id:"001Hp00003kIrJO",name:"Keurig Dr Pepper",hadOpportunity:!0},{id:"001Wj00000hkk0z",name:"Kingspan",hadOpportunity:!0},{id:"001Wj00000mCFrs",name:"Kitman Labs",hadOpportunity:!0},{id:"001Wj00000xy1VZ",name:"LDC Group",hadOpportunity:!1},{id:"001Wj00000mCFtF",name:"Let's Get Checked",hadOpportunity:!1},{id:"001Hp00003kIrJo",name:"Liberty Insurance",hadOpportunity:!1},{id:"001Wj00000xz2yz",name:"Marks and Spencer Group",hadOpportunity:!1},{id:"001Wj00000mCFsM",name:"McDermott Creed & Martyn",hadOpportunity:!0},{id:"001Hp00003kIrKF",name:"McKesson",hadOpportunity:!1},{id:"001Wj00000mCFso",name:"Mediolanum",hadOpportunity:!0},{id:"001Wj00000xyP9g",name:"Munich Re Group",hadOpportunity:!1},{id:"001Wj00000xxIyF",name:"Nationwide Building Society",hadOpportunity:!1},{id:"001Wj00000xxgZB",name:"Nebius Group",hadOpportunity:!1},{id:"001Wj00000symlp",name:"Nestl\xE9 Health Science",hadOpportunity:!1},{id:"001Wj00000xyYPq",name:"Nexans",hadOpportunity:!1},{id:"001Wj00000xybvb",name:"Next",hadOpportunity:!1},{id:"001Wj00000syczN",name:"Nomad Foods",hadOpportunity:!1},{id:"001Wj00000mCFrF",name:"OKG Payments Services Limited",hadOpportunity:!0},{id:"001Wj00000mCFqy",name:"Oneview Healthcare",hadOpportunity:!1},{id:"001Wj00000aCGRB",name:"Optum",hadOpportunity:!1},{id:"001Wj00000sylmX",name:"Orlen",hadOpportunity:!1},{id:"001Wj00000mCFrL",name:"PROS",hadOpportunity:!1},{id:"001Wj00000ZDPUI",name:"Perrigo Pharma",hadOpportunity:!0},{id:"001Wj00000xz33p",name:"Phoenix Pharma",hadOpportunity:!1},{id:"001Wj00000mCFqz",name:"Phoenix Tower International",hadOpportunity:!0},{id:"001Wj00000pzTPf",name:"Pipedrive",hadOpportunity:!1},{id:"001Wj00000mCFtS",name:"Poe Kiely Hogan Lanigan",hadOpportunity:!0},{id:"001Wj00000xxwys",name:"REWE Group",hadOpportunity:!1},{id:"001Wj00000xz3On",name:"Rexel",hadOpportunity:!1},{id:"001Wj00000xyJLy",name:"Royal BAM Group",hadOpportunity:!1},{id:"001Wj00000xysZq",name:"SPIE",hadOpportunity:!1},{id:"001Wj00000xxuVg",name:"SSE",hadOpportunity:!1},{id:"001Wj00000xxk1y",name:"Schaeffler",hadOpportunity:!1},{id:"001Wj00000syeJe",name:"Schott Pharma",hadOpportunity:!1},{id:"001Wj00000mCFrX",name:"South East Financial Services Cluster",hadOpportunity:!1},{id:"001Wj00000mCFry",name:"Spectrum Wellness Holdings Limited",hadOpportunity:!0},{id:"001Wj00000mCFsq",name:"Speed Fibre Group(enet)",hadOpportunity:!0},{id:"001Wj00000mCFtH",name:"StepStone Group",hadOpportunity:!0},{id:"001Hp00003kIrMp",name:"Stryker",hadOpportunity:!1},{id:"001Wj00000pzTPa",name:"SuperNode Ltd",hadOpportunity:!1},{id:"001Wj00000mCFtI",name:"Swish Fibre",hadOpportunity:!1},{id:"001Wj00000SFiOv",name:"TikTok",hadOpportunity:!0},{id:"001Wj00000ZDXTR",name:"Tinder LLC",hadOpportunity:!0},{id:"001Wj00000mCFrC",name:"Tines Security Services Limited",hadOpportunity:!0},{id:"001Wj00000xxQsc",name:"UDG Healthcare",hadOpportunity:!1},{id:"001Wj00000pzTPe",name:"Udaras na Gaeltachta",hadOpportunity:!1},{id:"001Wj00000bWBlE",name:"Udemy",hadOpportunity:!0},{id:"001Wj00000Y6VMX",name:"Unilever",hadOpportunity:!1},{id:"001Wj00000pzTPc",name:"Urban Volt",hadOpportunity:!1},{id:"001Wj00000xwB2o",name:"Vitesco Technologies Group",hadOpportunity:!1},{id:"001Hp00003liCZY",name:"Workday",hadOpportunity:!1},{id:"001Wj00000xyOlT",name:"X5 Retail Group",hadOpportunity:!1},{id:"001Wj00000xyXQZ",name:"Zalando",hadOpportunity:!1},{id:"001Wj00000Y6VZ3",name:"Ziff Davis",hadOpportunity:!1},{id:"001Wj00000mCFsZ",name:"Zurich Irish Life plc",hadOpportunity:!0}]},"nicola.fratini@eudia.com":{email:"nicola.fratini@eudia.com",name:"Nicola Fratini",accounts:[{id:"001Wj00000mCFqs",name:"AIB",hadOpportunity:!0},{id:"001Wj00000tWwXp",name:"AXIS Capital",hadOpportunity:!1},{id:"001Wj00000tWwXh",name:"Actavo Group Ltd",hadOpportunity:!1},{id:"001Wj00000thuKE",name:"Aer Lingus",hadOpportunity:!0},{id:"001Wj00000tWwXi",name:"Aer Rianta",hadOpportunity:!1},{id:"001Wj00000mCFrG",name:"AerCap",hadOpportunity:!0},{id:"001Wj00000YEMaB",name:"Aligned Incentives, a Bureau Veritas company",hadOpportunity:!1},{id:"001Wj00000mCFs7",name:"Allied Irish Banks plc",hadOpportunity:!0},{id:"001Wj00000mCFsb",name:"Amundi Ireland Limited",hadOpportunity:!0},{id:"001Wj00000uZ7w2",name:"Anna Charles",hadOpportunity:!1},{id:"001Wj00000TUdXw",name:"Anthropic",hadOpportunity:!0},{id:"001Wj00000mCFrD",name:"Applegreen",hadOpportunity:!1},{id:"001Wj00000wvc5a",name:"AppliedAI",hadOpportunity:!0},{id:"001Wj00000socke",name:"Archer The Well Company",hadOpportunity:!1},{id:"001Wj00000tWwXl",name:"Ardagh Glass Sales",hadOpportunity:!1},{id:"001Wj00000sgB1h",name:"Autorek",hadOpportunity:!1},{id:"001Wj00000mCFrh",name:"Avant Money",hadOpportunity:!0},{id:"001Wj00000tWwXT",name:"Avantcard",hadOpportunity:!1},{id:"001Wj00000mI7Na",name:"Aviva Insurance",hadOpportunity:!0},{id:"001Wj00000tWwXo",name:"Avolon",hadOpportunity:!1},{id:"001Wj00000uNUIB",name:"Bank of China",hadOpportunity:!0},{id:"001Hp00003kJ9kN",name:"Barclays",hadOpportunity:!0},{id:"001Wj00000ttPZB",name:"Barings",hadOpportunity:!0},{id:"001Wj00000tWwXW",name:"Beauparc Group",hadOpportunity:!0},{id:"001Wj00000xxRyK",name:"Bertelsmann",hadOpportunity:!1},{id:"001Wj00000tWwXX",name:"Bidx1",hadOpportunity:!1},{id:"001Wj00000soanc",name:"Borr Drilling",hadOpportunity:!1},{id:"001Wj00000tWwXu",name:"Boylesports",hadOpportunity:!1},{id:"001Wj00000uYz0o",name:"Bud Financial",hadOpportunity:!1},{id:"001Wj00000tWwXv",name:"Bunzl",hadOpportunity:!1},{id:"001Wj00000xxtGE",name:"Burelle",hadOpportunity:!1},{id:"001Wj00000mCFr0",name:"CNP Santander Insurance Services Limited",hadOpportunity:!0},{id:"001Wj00000tWwXw",name:"Cairn Homes",hadOpportunity:!0},{id:"001Wj00000uZ2hp",name:"Centrica",hadOpportunity:!1},{id:"001Wj00000uYYWv",name:"Checkout.com",hadOpportunity:!1},{id:"001Wj00000Y64qg",name:"Christian Dior Couture",hadOpportunity:!1},{id:"001Wj00000Y6VLh",name:"Citi",hadOpportunity:!0},{id:"001Wj00000mCFrE",name:"Clanwilliam Group",hadOpportunity:!0},{id:"001Wj00000tWwYl",name:"Clevercards",hadOpportunity:!1},{id:"001Wj00000mCFsm",name:"Coca-Cola HBC Ireland Limited",hadOpportunity:!0},{id:"001Wj00000xz30b",name:"Compagnie de l'Odet",hadOpportunity:!1},{id:"001Wj00000xxtOM",name:"Credit Industriel & Commercial",hadOpportunity:!1},{id:"001Wj00000uZ7RN",name:"Cuvva",hadOpportunity:!1},{id:"001Wj00000tx2MQ",name:"CyberArk",hadOpportunity:!0},{id:"001Wj00000tWwY1",name:"DAA",hadOpportunity:!1},{id:"001Wj00000xyNnm",name:"DS Smith",hadOpportunity:!1},{id:"001Wj00000hkk0s",name:"DSM",hadOpportunity:!1},{id:"001Wj00000hfWMt",name:"Dassault Syst?mes",hadOpportunity:!1},{id:"001Wj00000mCFsB",name:"Datalex",hadOpportunity:!0},{id:"001Wj00000mCFrl",name:"Davy",hadOpportunity:!0},{id:"001Wj00000tWwYm",name:"Deliveroo",hadOpportunity:!1},{id:"001Wj00000w0uVV",name:"Doceree",hadOpportunity:!0},{id:"001Wj00000vbvuX",name:"Dole plc",hadOpportunity:!1},{id:"001Wj00000tWwXZ",name:"EVO Payments",hadOpportunity:!1},{id:"001Wj00000xxsvH",name:"EXOR Group",hadOpportunity:!1},{id:"001Wj00000tWwY4",name:"Easons",hadOpportunity:!1},{id:"001Wj00000xz35R",name:"EasyJet",hadOpportunity:!1},{id:"001Wj00000xx4SK",name:"Edeka Zentrale",hadOpportunity:!1},{id:"001Wj00000uJwxo",name:"Eir",hadOpportunity:!0},{id:"001Wj00000tWwY5",name:"Elavon",hadOpportunity:!1},{id:"001Wj00000pzTPn",name:"Euronext Dublin",hadOpportunity:!1},{id:"001Wj00000sg8Gc",name:"FARFETCH",hadOpportunity:!0},{id:"001Wj00000mIEAX",name:"FNZ Group",hadOpportunity:!0},{id:"001Wj00000tWwY7",name:"First Data",hadOpportunity:!1},{id:"001Wj00000soigL",name:"Fresenius Kabi",hadOpportunity:!1},{id:"001Wj00000xyXyQ",name:"FrieslandCampina",hadOpportunity:!1},{id:"001Wj00000xyAP9",name:"GasTerra",hadOpportunity:!1},{id:"001Wj00000mCFt1",name:"Goodbody Stockbrokers",hadOpportunity:!0},{id:"001Wj00000soN5f",name:"Greencore",hadOpportunity:!1},{id:"001Wj00000xyyli",name:"Groupe BPCE",hadOpportunity:!1},{id:"001Wj00000xz9xF",name:"Haleon",hadOpportunity:!1},{id:"001Wj00000xz3S2",name:"Hapag-Lloyd",hadOpportunity:!1},{id:"001Wj00000tWwY9",name:"Henderson Group",hadOpportunity:!1},{id:"001Wj00000Y6VMb",name:"Henkel",hadOpportunity:!1},{id:"001Hp00003liHvf",name:"Hubspot",hadOpportunity:!0},{id:"001Wj00000sg9MN",name:"INNIO Group",hadOpportunity:!1},{id:"001Wj00000bzz9O",name:"IPG Mediabrands",hadOpportunity:!0},{id:"001Wj00000tWwYA",name:"IPL Plastics",hadOpportunity:!1},{id:"001Wj00000ZDXrd",name:"Intercom",hadOpportunity:!0},{id:"001Wj00000tWwYB",name:"Ires Reit",hadOpportunity:!1},{id:"001Wj00000xy2WS",name:"J. Sainsbury",hadOpportunity:!1},{id:"001Wj00000xyG3B",name:"JD Sports Fashion",hadOpportunity:!1},{id:"001Wj00000ullPp",name:"Jet2 Plc",hadOpportunity:!0},{id:"001Wj00000xyIeR",name:"KION Group",hadOpportunity:!1},{id:"001Wj00000tWwXb",name:"Keywords Studios",hadOpportunity:!1},{id:"001Wj00000xxdOO",name:"Kingfisher",hadOpportunity:!1},{id:"001Wj00000xy0o1",name:"Knorr-Bremse",hadOpportunity:!1},{id:"001Wj00000xxuVi",name:"L'Oreal",hadOpportunity:!1},{id:"001Wj00000xwh4I",name:"Landesbank Baden-Wurttemberg",hadOpportunity:!1},{id:"001Wj00000au3sw",name:"Lenovo",hadOpportunity:!0},{id:"001Wj00000sobq8",name:"MOL Magyarorsz\xE1g",hadOpportunity:!1},{id:"001Wj00000xwrq3",name:"Michelin",hadOpportunity:!1},{id:"001Wj00000xz3i9",name:"Mondi Group",hadOpportunity:!1},{id:"001Wj00000xxaf3",name:"NatWest Group",hadOpportunity:!1},{id:"001Wj00000xzFJV",name:"Norddeutsche Landesbank",hadOpportunity:!1},{id:"001Hp00003kIrKm",name:"Northern Trust Management Services",hadOpportunity:!0},{id:"001Wj00000bWIxi",name:"Novo Nordisk",hadOpportunity:!1},{id:"001Wj00000TV1Wz",name:"OpenAi",hadOpportunity:!0},{id:"001Wj00000tWwYh",name:"Origin Enterprises",hadOpportunity:!1},{id:"001Wj00000xz3dJ",name:"Otto",hadOpportunity:!1},{id:"001Wj00000tWwYs",name:"Panda Waste",hadOpportunity:!1},{id:"001Wj00000tWwYJ",name:"Paysafe",hadOpportunity:!1},{id:"001Wj00000souuM",name:"Premier Foods",hadOpportunity:!1},{id:"001Wj00000xyzrT",name:"RWE",hadOpportunity:!1},{id:"001Wj00000u0eJp",name:"Re-Turn",hadOpportunity:!0},{id:"001Wj00000xyAdg",name:"SGAM La Mondiale",hadOpportunity:!1},{id:"001Wj00000sg2T0",name:"SHEIN",hadOpportunity:!0},{id:"001Wj00000hfaEC",name:"Safran",hadOpportunity:!1},{id:"001Wj00000sonmQ",name:"Sandoz",hadOpportunity:!1},{id:"001Wj00000xz9ik",name:"Savencia",hadOpportunity:!1},{id:"001Wj00000xyGKs",name:"Sodexo",hadOpportunity:!1},{id:"001Wj00000c9oD6",name:"Stripe",hadOpportunity:!0},{id:"001Hp00003kKrS0",name:"Sword Health",hadOpportunity:!0},{id:"001Wj00000soZus",name:"Tate & Lyle",hadOpportunity:!1},{id:"001Wj00000mEEkG",name:"Team Car Care dba Jiffy Lube",hadOpportunity:!0},{id:"001Hp00003kIrN0",name:"Teleperformance",hadOpportunity:!1},{id:"001Wj00000vzG8f",name:"Temu",hadOpportunity:!1},{id:"001Wj00000xy9fz",name:"Tennet Holding",hadOpportunity:!1},{id:"001Wj00000tWwXf",name:"The Est\xE9e Lauder Companies Inc.",hadOpportunity:!1},{id:"001Wj00000Y6DDc",name:"The HEINEKEN Company",hadOpportunity:!1},{id:"001Wj00000tWwYV",name:"The Irish Stock Exchange",hadOpportunity:!1},{id:"001Wj00000xxp7o",name:"Thuga Holding",hadOpportunity:!1},{id:"001Wj00000xyBgC",name:"ThyssenKrupp",hadOpportunity:!1},{id:"001Wj00000tWwYW",name:"Total Produce plc",hadOpportunity:!1},{id:"001Wj00000xxxLU",name:"TotalEnergies",hadOpportunity:!1},{id:"001Wj00000mIBpN",name:"Transworld Business Advisors",hadOpportunity:!0},{id:"001Wj00000mCFs1",name:"Twitter",hadOpportunity:!0},{id:"001Wj00000xV8Vg",name:"UNHCR, the UN Refugee Agency",hadOpportunity:!0},{id:"001Wj00000xxo5I",name:"United Internet",hadOpportunity:!1},{id:"001Wj00000bWIzw",name:"Veolia | Water Tech",hadOpportunity:!1},{id:"001Hp00003kIrDA",name:"Verizon",hadOpportunity:!0},{id:"001Wj00000tWwXd",name:"Virgin Media Ireland Limited",hadOpportunity:!1},{id:"001Wj00000sgaj9",name:"Volkswagon",hadOpportunity:!0},{id:"001Wj00000ZDTG9",name:"Waystone",hadOpportunity:!0},{id:"001Wj00000pB5DX",name:"White Swan Data",hadOpportunity:!0},{id:"001Wj00000xwL2A",name:"Wm. Morrison Supermarkets",hadOpportunity:!1},{id:"001Wj00000mIB6E",name:"Zendesk",hadOpportunity:!0},{id:"001Wj00000S4r49",name:"Zoom",hadOpportunity:!0}]},"olivia.jung@eudia.com":{email:"olivia.jung@eudia.com",name:"Olivia Jung",accounts:[{id:"001Hp00003kIrED",name:"3M",hadOpportunity:!1},{id:"001Hp00003kIrEK",name:"ADP",hadOpportunity:!1},{id:"001Hp00003kIrEO",name:"AES",hadOpportunity:!0},{id:"001Hp00003kIrEG",name:"AbbVie",hadOpportunity:!1},{id:"001Wj00000mCFrd",name:"Airship Group Inc",hadOpportunity:!0},{id:"001Hp00003kIrET",name:"Albemarle",hadOpportunity:!1},{id:"001Hp00003kIrEZ",name:"Ally Financial",hadOpportunity:!1},{id:"001Hp00003kIrEc",name:"Altria Group",hadOpportunity:!1},{id:"001Hp00003kIrEf",name:"Ameren",hadOpportunity:!1},{id:"001Hp00003kIrEi",name:"American Family Insurance Group",hadOpportunity:!1},{id:"001Wj00000YIOI1",name:"Aptiv",hadOpportunity:!0},{id:"001Hp00003kIrFA",name:"Astellas",hadOpportunity:!0},{id:"001Hp00003kIrFD",name:"Autoliv",hadOpportunity:!1},{id:"001Hp00003kIrDJ",name:"Avery Dennison",hadOpportunity:!1},{id:"001Hp00003kIrDG",name:"Bain",hadOpportunity:!0},{id:"001Hp00003kIrFL",name:"Bank of America",hadOpportunity:!0},{id:"001Hp00003kIrFN",name:"Bath & Body Works",hadOpportunity:!1},{id:"001Hp00003kIrFQ",name:"Becton Dickinson",hadOpportunity:!1},{id:"001Hp00003kIrFV",name:"Best Buy",hadOpportunity:!0},{id:"001Hp00003kIrDY",name:"Blackstone",hadOpportunity:!0},{id:"001Hp00003kIrFb",name:"Boeing",hadOpportunity:!0},{id:"001Hp00003kIrFf",name:"BorgWarner",hadOpportunity:!1},{id:"001Hp00003kIrFk",name:"Bristol-Myers Squibb",hadOpportunity:!0},{id:"001Hp00003kIrFo",name:"Burlington Stores",hadOpportunity:!1},{id:"001Wj00000Y6VLn",name:"CHANEL",hadOpportunity:!1},{id:"001Hp00003kIrGK",name:"CHS",hadOpportunity:!0},{id:"001Hp00003kJ9kw",name:"CSL",hadOpportunity:!0},{id:"001Hp00003kIrGq",name:"CVS Health",hadOpportunity:!1},{id:"001Hp00003kIrG7",name:"Cencora (formerly AmerisourceBergen)",hadOpportunity:!1},{id:"001Hp00003kIrGE",name:"Charter Communications",hadOpportunity:!0},{id:"001Hp00003kIrDZ",name:"Ciena",hadOpportunity:!0},{id:"001Hp00003kIrGL",name:"Cintas",hadOpportunity:!1},{id:"001Wj00000c6df9",name:"Clear",hadOpportunity:!0},{id:"001Wj00000eLOI4",name:"Cleveland Clinic",hadOpportunity:!1},{id:"001Hp00003kIrGO",name:"Cleveland-Cliffs",hadOpportunity:!1},{id:"001Hp00003kIrGQ",name:"Coca-Cola",hadOpportunity:!1},{id:"001Hp00003kIrGX",name:"Conagra Brands",hadOpportunity:!1},{id:"001Hp00003kIrGZ",name:"Consolidated Edison",hadOpportunity:!0},{id:"001Wj00000jK5Hl",name:"Crate & Barrel",hadOpportunity:!0},{id:"001Hp00003kIrGo",name:"Cummins",hadOpportunity:!0},{id:"001Hp00003kIrGu",name:"Danaher",hadOpportunity:!1},{id:"001Wj00000bzz9R",name:"Datadog",hadOpportunity:!0},{id:"001Wj00000aZvt9",name:"Dolby",hadOpportunity:!0},{id:"001Hp00003kIrHB",name:"Dominion Energy",hadOpportunity:!1},{id:"001Hp00003kIrHE",name:"Dow",hadOpportunity:!1},{id:"001Hp00003kIrHH",name:"Duke Energy",hadOpportunity:!1},{id:"001Wj00000hkk0j",name:"Etsy",hadOpportunity:!0},{id:"001Hp00003kIrI7",name:"Ford",hadOpportunity:!1},{id:"001Hp00003kIrIL",name:"General Dynamics",hadOpportunity:!1},{id:"001Wj00000ScUQ3",name:"General Electric",hadOpportunity:!1},{id:"001Hp00003kIrIN",name:"General Motors",hadOpportunity:!1},{id:"001Hp00003kIrIS",name:"Gilead Sciences",hadOpportunity:!0},{id:"001Hp00003kIrE8",name:"Graybar Electric",hadOpportunity:!0},{id:"001Hp00003kIrDO",name:"Guardian Life Ins",hadOpportunity:!0},{id:"001Wj00000dvgdb",name:"HealthEquity",hadOpportunity:!0},{id:"001Hp00003kIrJ9",name:"Intuit",hadOpportunity:!0},{id:"001Wj00000aLlyV",name:"J.Crew",hadOpportunity:!0},{id:"001Hp00003kKKMc",name:"JPmorganchase",hadOpportunity:!0},{id:"001Hp00003kIrJI",name:"John Deere",hadOpportunity:!1},{id:"001Hp00003kIrDQ",name:"Jones Lang LaSalle",hadOpportunity:!0},{id:"001Wj00000hfaE1",name:"Lowe",hadOpportunity:!1},{id:"001Hp00003kIrDj",name:"Marsh McLennan",hadOpportunity:!0},{id:"001Hp00003kIrEA",name:"Mastercard",hadOpportunity:!0},{id:"001Wj00000QBapC",name:"Mayo Clinic",hadOpportunity:!1},{id:"001Hp00003kIrD7",name:"McDonald's",hadOpportunity:!1},{id:"001Hp00003kIrD8",name:"Medtronic",hadOpportunity:!0},{id:"001Hp00003kIrKK",name:"Merck",hadOpportunity:!0},{id:"001Hp00003kJ9lG",name:"Meta",hadOpportunity:!0},{id:"001Hp00003kIrKS",name:"Mondelez International",hadOpportunity:!0},{id:"001Hp00003kIrKU",name:"Motorola Solutions",hadOpportunity:!0},{id:"001Wj00000Y6VYj",name:"NBCUniversal",hadOpportunity:!1},{id:"001Wj00000j3QN2",name:"Nasdaq Private Market",hadOpportunity:!1},{id:"001Hp00003kIrCq",name:"Nationwide Insurance",hadOpportunity:!1},{id:"001Wj00000Y6VML",name:"Nestle",hadOpportunity:!1},{id:"001Hp00003kIrLF",name:"Paramount",hadOpportunity:!1},{id:"001Hp00003kIrLO",name:"Pfizer",hadOpportunity:!0},{id:"001Wj00000wzgaP",name:"Philip Morris International",hadOpportunity:!1},{id:"001Hp00003kIrLa",name:"Prudential",hadOpportunity:!1},{id:"001Hp00003kIrLp",name:"Raytheon Technologies",hadOpportunity:!1},{id:"001Hp00003kIrDz",name:"Shopify",hadOpportunity:!0},{id:"001Wj00000eLWPF",name:"Stellantis",hadOpportunity:!1},{id:"001Wj00000iS9AJ",name:"TE Connectivity",hadOpportunity:!0},{id:"001Hp00003kIrMx",name:"Target",hadOpportunity:!1},{id:"001Wj00000PjGDa",name:"The Weir Group PLC",hadOpportunity:!0},{id:"001Hp00003kIrDF",name:"Thermo Fisher Scientific",hadOpportunity:!0},{id:"001Hp00003kIrCw",name:"Toshiba US",hadOpportunity:!0},{id:"001Hp00003kIrNb",name:"Unisys",hadOpportunity:!0},{id:"001Hp00003kIrO7",name:"Wells Fargo",hadOpportunity:!0},{id:"001Wj00000kD7MA",name:"Wellspan Health",hadOpportunity:!0},{id:"001Hp00003kIrOA",name:"Western Digital",hadOpportunity:!0},{id:"001Wj00000kD3s1",name:"White Cap",hadOpportunity:!0}]},"rajeev.patel@eudia.com":{email:"rajeev.patel@eudia.com",name:"Rajeev Patel",accounts:[{id:"001Wj00000fFW35",name:"Alnylam Pharmaceuticals",hadOpportunity:!0},{id:"001Wj00000woNmQ",name:"Beiersdorf",hadOpportunity:!1},{id:"001Wj00000vCOx2",name:"Cambridge Associates",hadOpportunity:!1},{id:"001Wj00000wE56T",name:"Care Vet Health",hadOpportunity:!1},{id:"001Wj00000dIjyB",name:"CareVet, LLC",hadOpportunity:!1},{id:"001Wj00000xZEkY",name:"Modern Treasury",hadOpportunity:!1},{id:"001Wj00000vv2vX",name:"Nextdoor",hadOpportunity:!1}]},"riley.stack@eudia.com":{email:"riley.stack@eudia.com",name:"Riley Stack",accounts:[{id:"001Wj00000XiEDy",name:"Coinbase",hadOpportunity:!0},{id:"001Wj00000YEMa8",name:"Turing",hadOpportunity:!0}]},"sean.boyd@eudia.com":{email:"sean.boyd@eudia.com",name:"Sean Boyd",accounts:[{id:"001Hp00003kIrE9",name:"IQVIA",hadOpportunity:!0}]},"tom.clancy@eudia.com":{email:"tom.clancy@eudia.com",name:"Tom Clancy",accounts:[{id:"001Wj00000pB30V",name:"AIR (Advanced Inhalation Rituals)",hadOpportunity:!0},{id:"001Wj00000qLRqW",name:"ASML",hadOpportunity:!0},{id:"001Wj00000xyA0y",name:"Aegon",hadOpportunity:!1},{id:"001Wj00000xxpcR",name:"Air France-KLM Group",hadOpportunity:!1},{id:"001Wj00000xyIg2",name:"Akzo Nobel",hadOpportunity:!1},{id:"001Wj00000qFynV",name:"Alexion Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000xwuUW",name:"Alstom",hadOpportunity:!1},{id:"001Wj00000xxtL6",name:"Anglo American",hadOpportunity:!1},{id:"001Wj00000syHJt",name:"Aryzta",hadOpportunity:!1},{id:"001Wj00000tWwXq",name:"BAM Ireland",hadOpportunity:!1},{id:"001Wj00000c9oCe",name:"BLDG Management Co., Inc.",hadOpportunity:!0},{id:"001Wj00000hfWN1",name:"Balfour Beatty US",hadOpportunity:!1},{id:"001Wj00000fFuFM",name:"Bank of Ireland",hadOpportunity:!0},{id:"001Wj00000xy23Q",name:"Bayerische Landesbank",hadOpportunity:!1},{id:"001Wj00000tWwXt",name:"Boots",hadOpportunity:!1},{id:"001Wj00000xyIOL",name:"Ceconomy",hadOpportunity:!1},{id:"001Wj00000tWwXx",name:"Chanelle Pharma",hadOpportunity:!1},{id:"001Hp00003kIrD3",name:"Cisco Systems",hadOpportunity:!0},{id:"001Wj00000xyqxq",name:"Computacenter",hadOpportunity:!1},{id:"001Wj00000xy0ss",name:"Constellium",hadOpportunity:!1},{id:"001Wj00000Y6Vk0",name:"Credit Agricole CIB",hadOpportunity:!1},{id:"001Wj00000xwf7G",name:"Daimler Truck Holding",hadOpportunity:!1},{id:"001Wj00000xyaWU",name:"Delivery Hero",hadOpportunity:!1},{id:"001Wj00000mCFsz",name:"Electricity Supply Board",hadOpportunity:!0},{id:"001Wj00000sp0Bl",name:"Ensco PLC",hadOpportunity:!1},{id:"001Wj00000xz374",name:"EssilorLuxottica",hadOpportunity:!1},{id:"001Wj00000hfaDT",name:"Experian",hadOpportunity:!1},{id:"001Wj00000tWwY6",name:"Fineos",hadOpportunity:!1},{id:"001Wj00000mCFsd",name:"Fujitsu",hadOpportunity:!1},{id:"001Wj00000mCFrc",name:"Glanbia",hadOpportunity:!0},{id:"001Wj00000mHuzr",name:"IHRB",hadOpportunity:!1},{id:"001Wj00000xy9Ho",name:"Imperial Brands",hadOpportunity:!1},{id:"001Wj00000sp1nl",name:"Ina Groupa",hadOpportunity:!1},{id:"001Wj00000xz3ev",name:"Infineon",hadOpportunity:!1},{id:"001Wj00000xyMzn",name:"JDE Peet's",hadOpportunity:!1},{id:"001Wj00000hfWN2",name:"Jazz Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000soxsD",name:"Jazz Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000xxtcq",name:"John Lewis Partnership",hadOpportunity:!1},{id:"001Wj00000tWwYo",name:"Just Eat",hadOpportunity:!1},{id:"001Wj00000xz3jl",name:"KfW Group",hadOpportunity:!1},{id:"001Wj00000tWwYD",name:"Ladbrokes",hadOpportunity:!1},{id:"001Wj00000xystC",name:"Lanxess Group",hadOpportunity:!1},{id:"001Wj00000vRNFu",name:"Legal & General",hadOpportunity:!1},{id:"001Wj00000xxgZC",name:"Legrand",hadOpportunity:!1},{id:"001Wj00000Y64qm",name:"Louis Dreyfus Company",hadOpportunity:!1},{id:"001Wj00000xyGRQ",name:"Lufthansa Group",hadOpportunity:!1},{id:"001Wj00000pA6d7",name:"Masdar Future Energy Company",hadOpportunity:!0},{id:"001Wj00000xz0xC",name:"Metro",hadOpportunity:!1},{id:"001Wj00000xzAen",name:"Motability Operations Group",hadOpportunity:!1},{id:"001Wj00000mCFrv",name:"Ornua",hadOpportunity:!1},{id:"001Hp00003kIrLK",name:"Pepsi",hadOpportunity:!1},{id:"001Wj00000qFudS",name:"Pluralsight",hadOpportunity:!1},{id:"001Wj00000xyODc",name:"Puma",hadOpportunity:!1},{id:"001Wj00000iC14Z",name:"RELX",hadOpportunity:!1},{id:"001Wj00000tWwYj",name:"Rabobank",hadOpportunity:!1},{id:"001Wj00000xyU9M",name:"Reckitt Benckiser",hadOpportunity:!1},{id:"001Wj00000xz3bh",name:"Rentokil Initial",hadOpportunity:!1},{id:"001Wj00000sp1hL",name:"SBM Offshore",hadOpportunity:!1},{id:"001Wj00000xybkK",name:"SHV Holdings",hadOpportunity:!1},{id:"001Wj00000xz3gX",name:"SNCF Group",hadOpportunity:!1},{id:"001Wj00000tWwYt",name:"Sage",hadOpportunity:!1},{id:"001Wj00000sGEuO",name:"Sanofi",hadOpportunity:!1},{id:"001Wj00000qL7AG",name:"Seismic",hadOpportunity:!0},{id:"001Wj00000soyhp",name:"Stada Group",hadOpportunity:!1},{id:"001Wj00000xytSg",name:"Standard Chartered",hadOpportunity:!1},{id:"001Wj00000tWwYq",name:"Symantec",hadOpportunity:!1},{id:"001Wj00000pAPW2",name:"Tarmac",hadOpportunity:!0},{id:"001Wj00000xxvA1",name:"Technip Energies",hadOpportunity:!1},{id:"001Wj00000tWwYU",name:"Tegral Building Products",hadOpportunity:!1},{id:"001Wj00000fFuFq",name:"The Boots Group",hadOpportunity:!1},{id:"001Wj00000tWwYk",name:"Three",hadOpportunity:!1},{id:"001Wj00000xy5HP",name:"Trane Technologies",hadOpportunity:!1},{id:"001Wj00000sohCP",name:"Trans Ocean",hadOpportunity:!1},{id:"001Wj00000mCFtO",name:"Uisce Eireann (Irish Water)",hadOpportunity:!0},{id:"001Wj00000xyQ5k",name:"Uniper",hadOpportunity:!1},{id:"001Wj00000xz1GY",name:"Valeo",hadOpportunity:!1},{id:"001Wj00000pBibT",name:"Version1",hadOpportunity:!0},{id:"001Wj00000xy2BT",name:"Vivendi",hadOpportunity:!1},{id:"001Wj00000xyulK",name:"Wacker Chemie",hadOpportunity:!1},{id:"001Wj00000tWwYZ",name:"Wyeth Nutritionals Ireland",hadOpportunity:!1},{id:"001Wj00000mI9qo",name:"XACT Data Discovery",hadOpportunity:!0},{id:"001Wj00000xyq3P",name:"ZF Friedrichshafen",hadOpportunity:!1}]}}},H=class{constructor(i){this.cachedData=null;this.serverUrl=i}async getAccountsForUser(i){return(await this.getAccountsWithProspects(i)).accounts}async getAccountsWithProspects(i){let t=i.toLowerCase().trim(),e=await this.fetchFromServerWithProspects(t);if(e&&(e.accounts.length>0||e.prospects.length>0))return console.log(`[AccountOwnership] Got ${e.accounts.length} active + ${e.prospects.length} prospects from server for ${t}`),e;console.log(`[AccountOwnership] Using static data fallback for ${t}`);let n=this.getAccountsFromStatic(t),a=n.filter(s=>s.hadOpportunity!==!1),r=n.filter(s=>s.hadOpportunity===!1);return{accounts:a,prospects:r}}getAccountsFromStatic(i){if(Be(i)==="sales_leader"){let r=Ge(i);if(r.length===0)return console.log(`[AccountOwnership] No direct reports found for sales leader: ${i}`),[];let s=new Map;for(let c of r){let l=N.businessLeads[c];if(l)for(let d of l.accounts)s.has(d.id)||s.set(d.id,{...d,isOwned:!1})}let o=Array.from(s.values()).sort((c,l)=>c.name.localeCompare(l.name));return console.log(`[AccountOwnership] Found ${o.length} static accounts for sales leader ${i} (from ${r.length} direct reports)`),o}let e=N.businessLeads[i],n=e?e.accounts.map(r=>({...r,isOwned:!0})):[],a=_e[i];if(a){let r=ge(a),s=new Set(n.map(c=>c.id));for(let c of r){let l=N.businessLeads[c];if(l)for(let d of l.accounts)s.has(d.id)||(n.push({...d,isOwned:!1}),s.add(d.id))}let o=n.sort((c,l)=>c.name.localeCompare(l.name));return console.log(`[AccountOwnership] Pod-view user ${i} (${a}): ${o.length} static accounts (${e?.accounts.length||0} owned + region)`),o}return e?(console.log(`[AccountOwnership] Found ${e.accounts.length} static accounts for ${i} (own accounts only)`),e.accounts):(console.log(`[AccountOwnership] No static mapping found for: ${i}`),[])}async fetchFromServer(i){let t=await this.fetchFromServerWithProspects(i);return t?t.accounts:null}async fetchFromServerWithProspects(i){let t=`${this.serverUrl}/api/accounts/ownership/${encodeURIComponent(i)}`;console.log(`[AccountOwnership] Fetching accounts from: ${t}`);let e=n=>({id:n.id,name:n.name,type:n.type||"Prospect",hadOpportunity:n.hadOpportunity??!0,website:n.website||void 0,industry:n.industry||void 0});try{let{requestUrl:n}=await import("obsidian"),a=await n({url:t,method:"GET",headers:{Accept:"application/json"},throw:!1});if(console.log(`[AccountOwnership] requestUrl status: ${a.status}`),a.status===200&&a.json?.success){let r=(a.json.accounts||[]).map(e),s=(a.json.prospectAccounts||[]).map(e);return console.log(`[AccountOwnership] requestUrl success: ${r.length} accounts, ${s.length} prospects`),{accounts:r,prospects:s}}console.log("[AccountOwnership] requestUrl returned non-success:",a.status,a.json?.message||"")}catch(n){console.error("[AccountOwnership] requestUrl failed:",n?.message||n)}try{console.log("[AccountOwnership] Trying native fetch fallback...");let n=await fetch(t,{method:"GET",headers:{Accept:"application/json"}});if(console.log(`[AccountOwnership] fetch status: ${n.status}`),n.ok){let a=await n.json();if(a?.success){let r=(a.accounts||[]).map(e),s=(a.prospectAccounts||[]).map(e);return console.log(`[AccountOwnership] fetch success: ${r.length} accounts, ${s.length} prospects`),{accounts:r,prospects:s}}}}catch(n){console.error("[AccountOwnership] Native fetch also failed:",n?.message||n)}return console.warn(`[AccountOwnership] Both requestUrl and fetch failed for ${i}`),null}async getNewAccounts(i,t){let e=await this.getAccountsForUser(i),n=t.map(a=>a.toLowerCase().trim());return e.filter(a=>{let r=a.name.toLowerCase().trim();return!n.some(s=>s===r||s.startsWith(r)||r.startsWith(s))})}findTeamLeader(i){let t=i.toLowerCase().trim();for(let[e,n]of Object.entries(ee))if(n.includes(t))return e;return null}hasUser(i){return i.toLowerCase().trim()in N.businessLeads}getAllBusinessLeads(){return Object.keys(N.businessLeads)}getBusinessLead(i){let t=i.toLowerCase().trim();return N.businessLeads[t]||null}getDataVersion(){return N.version}async getAllAccountsForAdmin(i){let t=i.toLowerCase().trim();if(!M(t))return console.log(`[AccountOwnership] ${t} is not an admin, returning owned accounts only`),this.getAccountsForUser(t);let e=await this.fetchAllAccountsFromServer();if(e&&e.length>0){let n=await this.getAccountsForUser(t),a=new Set(n.map(r=>r.id));return e.map(r=>({...r,isOwned:a.has(r.id)}))}return console.log("[AccountOwnership] Using static data fallback for admin all-accounts"),this.getAllAccountsFromStatic(t)}getAllAccountsFromStatic(i){let t=new Map,e=new Set,n=N.businessLeads[i];if(n)for(let a of n.accounts)e.add(a.id),t.set(a.id,{...a,isOwned:!0});for(let a of Object.values(N.businessLeads))for(let r of a.accounts)t.has(r.id)||t.set(r.id,{...r,isOwned:!1});return Array.from(t.values()).sort((a,r)=>a.name.localeCompare(r.name))}async getCSAccounts(i){let t=i.toLowerCase().trim();console.log(`[AccountOwnership] Fetching CS accounts for: ${t}`);let e=3,n=3e3;for(let r=1;r<=e;r++)try{let{requestUrl:s,Notice:o}=await import("obsidian");console.log(`[AccountOwnership] CS fetch attempt ${r}/${e} for ${t}`);let c=await s({url:`${this.serverUrl}/api/bl-accounts/${encodeURIComponent(t)}`,method:"GET",headers:{Accept:"application/json"},throw:!1});if(console.log(`[AccountOwnership] CS fetch response status: ${c.status}`),c.status===200&&c.json?.success){let l=(c.json.accounts||[]).map(u=>({id:u.id,name:u.name,type:u.customerType||u.type||"Customer",isOwned:!1,hadOpportunity:!0,website:u.website||null,industry:u.industry||null,ownerName:u.ownerName||null,csmName:u.csmName||null})),d=(c.json.prospectAccounts||[]).map(u=>({id:u.id,name:u.name,type:u.customerType||u.type||"Prospect",isOwned:!1,hadOpportunity:!1,website:u.website||null,industry:u.industry||null,ownerName:u.ownerName||null,csmName:u.csmName||null}));if(l.length>0)return console.log(`[AccountOwnership] CS accounts for ${t}: ${l.length} active + ${d.length} prospects`),new o(`Found ${l.length} CS accounts`),{accounts:l,prospects:d};if(console.warn(`[AccountOwnership] CS fetch attempt ${r}: server returned success but 0 accounts (Salesforce not ready)`),r<e){console.log(`[AccountOwnership] Retrying in ${n}ms...`),await new Promise(u=>setTimeout(u,n));continue}}else console.warn(`[AccountOwnership] CS fetch attempt ${r} returned status ${c.status} for ${t}`),r<e&&(console.log(`[AccountOwnership] Retrying in ${n}ms...`),await new Promise(l=>setTimeout(l,n)))}catch(s){console.error(`[AccountOwnership] CS account fetch attempt ${r} failed for ${t}:`,s),r<e&&(console.log(`[AccountOwnership] Retrying in ${n}ms after error...`),await new Promise(o=>setTimeout(o,n)))}console.warn(`[AccountOwnership] Server returned no CS accounts after ${e} attempts. Using static fallback (${D.length} accounts).`);let{Notice:a}=await import("obsidian");return new a(`Loading ${D.length} CS accounts (server warming up)`),{accounts:[...D],prospects:[]}}async fetchAllAccountsFromServer(){try{let{requestUrl:i}=await import("obsidian"),t=await i({url:`${this.serverUrl}/api/accounts/all`,method:"GET",headers:{Accept:"application/json"}});return t.json?.success&&t.json?.accounts?t.json.accounts.map(e=>({id:e.id,name:e.name,type:e.type||"Prospect"})):null}catch(i){return console.log("[AccountOwnership] Server fetch all accounts failed:",i),null}}};var fe=[{value:"America/New_York",label:"Eastern Time (ET)"},{value:"America/Chicago",label:"Central Time (CT)"},{value:"America/Denver",label:"Mountain Time (MT)"},{value:"America/Los_Angeles",label:"Pacific Time (PT)"},{value:"Europe/London",label:"London (GMT/BST)"},{value:"Europe/Dublin",label:"Dublin (GMT/IST)"},{value:"Europe/Paris",label:"Central Europe (CET)"},{value:"Europe/Berlin",label:"Berlin (CET)"},{value:"UTC",label:"UTC"}],ze={serverUrl:"https://gtm-wizard.onrender.com",accountsFolder:"Accounts",recordingsFolder:"Recordings",syncOnStartup:!0,autoSyncAfterTranscription:!0,saveAudioFiles:!0,appendTranscript:!0,lastSyncTime:null,cachedAccounts:[],enableSmartTags:!0,showCalendarView:!0,userEmail:"",setupCompleted:!1,calendarConfigured:!1,salesforceConnected:!1,accountsImported:!1,importedAccountCount:0,timezone:"America/New_York",lastAccountRefreshDate:null,archiveRemovedAccounts:!0,syncAccountsOnStartup:!0,sfAutoSyncEnabled:!0,sfAutoSyncIntervalMinutes:15,audioCaptureMode:"full_call",audioMicDeviceId:"",audioSystemDeviceId:"",audioSetupDismissed:!1,meetingTemplate:"meddic",lastUpdateVersion:null,lastUpdateTimestamp:null,pendingUpdateVersion:null,healQueue:[]},te=class{constructor(i,t=""){this.enabled=!0;this.pluginVersion="4.9.0";this.serverUrl=i,this.userEmail=t}setUserEmail(i){this.userEmail=i}async reportError(i,t){this.enabled&&this.send("error",i,t)}async reportWarning(i,t){this.enabled&&this.send("warning",i,t)}async reportInfo(i,t){this.enabled&&this.send("info",i,t)}async sendHeartbeat(i,t){if(!this.enabled||!this.userEmail)return null;try{return(await(0,p.requestUrl)({url:`${this.serverUrl}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"heartbeat",userEmail:this.userEmail,pluginVersion:this.pluginVersion,platform:"obsidian",accountCount:i,connections:t})})).json}catch{return null}}async reportSync(i){if(this.enabled)try{(0,p.requestUrl)({url:`${this.serverUrl}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"sync",userEmail:this.userEmail||"anonymous",pluginVersion:this.pluginVersion,platform:"obsidian",context:i})}).catch(()=>{})}catch{}}async checkForPushedConfig(){if(!this.userEmail)return[];try{let i=await(0,p.requestUrl)({url:`${this.serverUrl}/api/admin/users/${encodeURIComponent(this.userEmail)}/config`,method:"GET",headers:{"Content-Type":"application/json"}});return i.json?.hasUpdates&&i.json?.updates?(console.log("[Eudia] Received pushed config from admin:",i.json.updates),i.json.updates):[]}catch{return[]}}async reportRecordingStart(i){this.enabled&&this.send("recording_start","Recording started",i)}async reportRecordingStop(i){this.enabled&&this.send("recording_stop",`Recording stopped (${i.durationSec}s)`,i)}async reportTranscriptionResult(i){if(!this.enabled)return;let t=i.success?`Transcription complete (${i.transcriptLength} chars)`:`Transcription failed: ${i.error||"unknown"}`;this.send("transcription_result",t,i)}async reportAutoHealScan(i){this.enabled&&this.send("autoheal_scan",`AutoHeal: ${i.healed} healed, ${i.failed} failed`,i)}async reportUpdateCheck(i){this.enabled&&this.send("update_check",`Update check: ${i.updateResult}`,i)}async reportSafetyNetFailure(i){this.enabled&&this.send("safety_net_failure",`Safety net save failed: ${i.error}`,i)}async send(i,t,e){try{(0,p.requestUrl)({url:`${this.serverUrl}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:i,message:t,context:e,userEmail:this.userEmail||"anonymous",pluginVersion:this.pluginVersion,platform:"obsidian"})}).catch(()=>{})}catch{}}},G="eudia-calendar-view",_="eudia-setup-view",L="eudia-live-query-view",ne=class extends p.EditorSuggest{constructor(i,t){super(i),this.plugin=t}onTrigger(i,t,e){let n=t.getLine(i.line),a=t.getValue(),r=t.posToOffset(i),s=a.indexOf("---"),o=a.indexOf("---",s+3);if(s===-1||r<s||r>o)return null;let c=n.match(/^account:\s*(.*)$/);if(!c)return null;let l=c[1].trim(),d=n.indexOf(":")+1,u=n.substring(d).match(/^\s*/)?.[0].length||0;return{start:{line:i.line,ch:d+u},end:i,query:l}}getSuggestions(i){let t=i.query.toLowerCase(),e=this.plugin.settings.cachedAccounts;return t?e.filter(n=>n.name.toLowerCase().includes(t)).sort((n,a)=>{let r=n.name.toLowerCase().startsWith(t),s=a.name.toLowerCase().startsWith(t);return r&&!s?-1:s&&!r?1:n.name.localeCompare(a.name)}).slice(0,10):e.slice(0,10)}renderSuggestion(i,t){t.createEl("div",{text:i.name,cls:"suggestion-title"})}selectSuggestion(i,t){this.context&&this.context.editor.replaceRange(i.name,this.context.start,this.context.end)}},ae=class{constructor(i,t,e,n){this.containerEl=null;this.waveformBars=[];this.durationEl=null;this.waveformData=new Array(16).fill(0);this.onPause=i,this.onResume=t,this.onStop=e,this.onCancel=n}show(){if(this.containerEl)return;this.containerEl=document.createElement("div"),this.containerEl.className="eudia-transcription-bar active";let i=document.createElement("div");i.className="eudia-recording-dot",this.containerEl.appendChild(i);let t=document.createElement("div");t.className="eudia-waveform",this.waveformBars=[];for(let r=0;r<16;r++){let s=document.createElement("div");s.className="eudia-waveform-bar",s.style.height="2px",t.appendChild(s),this.waveformBars.push(s)}this.containerEl.appendChild(t),this.durationEl=document.createElement("div"),this.durationEl.className="eudia-duration",this.durationEl.textContent="0:00",this.containerEl.appendChild(this.durationEl);let e=document.createElement("div");e.className="eudia-controls-minimal";let n=document.createElement("button");n.className="eudia-control-btn stop",n.innerHTML='<span class="eudia-stop-icon"></span>',n.title="Stop and summarize",n.onclick=()=>this.onStop(),e.appendChild(n);let a=document.createElement("button");a.className="eudia-control-btn cancel",a.textContent="Cancel",a.onclick=()=>this.onCancel(),e.appendChild(a),this.containerEl.appendChild(e),document.body.appendChild(this.containerEl)}hide(){this.containerEl&&(this.containerEl.remove(),this.containerEl=null,this.waveformBars=[],this.durationEl=null)}updateState(i){if(this.containerEl){if(this.waveformData.shift(),this.waveformData.push(i.audioLevel),this.waveformBars.forEach((t,e)=>{let n=this.waveformData[e]||0,a=Math.max(2,Math.min(24,n*.24));t.style.height=`${a}px`}),this.durationEl){let t=Math.floor(i.duration/60),e=Math.floor(i.duration%60);this.durationEl.textContent=`${t}:${e.toString().padStart(2,"0")}`}this.containerEl.className=i.isPaused?"eudia-transcription-bar paused":"eudia-transcription-bar active"}}showProcessing(){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar processing";let i=document.createElement("div");i.className="eudia-processing-spinner",this.containerEl.appendChild(i);let t=document.createElement("div");t.className="eudia-processing-text",t.textContent="Processing...",this.containerEl.appendChild(t)}showComplete(i){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar complete";let t=document.createElement("div");t.className="eudia-complete-checkmark",this.containerEl.appendChild(t);let e=document.createElement("div");if(e.className="eudia-complete-content",i.summaryPreview){let o=document.createElement("div");o.className="eudia-summary-preview",o.textContent=i.summaryPreview.length>80?i.summaryPreview.substring(0,80)+"...":i.summaryPreview,e.appendChild(o)}let n=document.createElement("div");n.className="eudia-complete-stats-row";let a=Math.floor(i.duration/60),r=Math.floor(i.duration%60);n.textContent=`${a}:${r.toString().padStart(2,"0")} recorded`,i.nextStepsCount>0&&(n.textContent+=` | ${i.nextStepsCount} action${i.nextStepsCount>1?"s":""}`),i.meddiccCount>0&&(n.textContent+=` | ${i.meddiccCount} signals`),e.appendChild(n),this.containerEl.appendChild(e);let s=document.createElement("button");s.className="eudia-control-btn close",s.textContent="Dismiss",s.onclick=()=>this.hide(),this.containerEl.appendChild(s),setTimeout(()=>this.hide(),8e3)}};var ie=class extends p.Modal{constructor(i,t,e){super(i),this.plugin=t,this.onSelect=e}onOpen(){let{contentEl:i}=this;i.empty(),i.addClass("eudia-account-selector"),i.createEl("h3",{text:"Select Account for Meeting Note"}),this.searchInput=i.createEl("input",{type:"text",placeholder:"Search accounts..."}),this.searchInput.style.cssText="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);",this.resultsContainer=i.createDiv({cls:"eudia-account-results"}),this.resultsContainer.style.cssText="max-height: 300px; overflow-y: auto;",this.updateResults(""),this.searchInput.addEventListener("input",()=>this.updateResults(this.searchInput.value)),this.searchInput.focus()}updateResults(i){this.resultsContainer.empty();let t=this.plugin.settings.cachedAccounts,e=i?t.filter(n=>n.name.toLowerCase().includes(i.toLowerCase())).slice(0,15):t.slice(0,15);if(e.length===0){this.resultsContainer.createDiv({cls:"eudia-no-results",text:"No accounts found"});return}e.forEach(n=>{let a=this.resultsContainer.createDiv({cls:"eudia-account-item",text:n.name});a.onclick=()=>{this.onSelect(n),this.close()}})}onClose(){this.contentEl.empty()}},K=class extends p.Modal{constructor(t,e,n){super(t);this.accountContext=null;this.sessionId=null;this.plugin=e,this.accountContext=n||null}onOpen(){let{contentEl:t}=this;t.empty(),t.addClass("eudia-intelligence-modal");let e=t.createDiv({cls:"eudia-intelligence-header"});e.createEl("h2",{text:this.accountContext?`Ask about ${this.accountContext.name}`:"Ask gtm-brain"}),this.accountContext?e.createEl("p",{text:"Get insights, prep for meetings, or ask about this account.",cls:"eudia-intelligence-subtitle"}):e.createEl("p",{text:"Ask questions about your accounts, deals, or pipeline.",cls:"eudia-intelligence-subtitle"});let n=t.createDiv({cls:"eudia-intelligence-input-container"});this.queryInput=n.createEl("textarea",{placeholder:this.accountContext?`e.g., "What should I know before my next meeting?" or "What's the deal status?"`:`e.g., "Who owns Dolby?" or "What's my late stage pipeline?"`}),this.queryInput.addClass("eudia-intelligence-input"),this.queryInput.rows=3;let r=t.createDiv({cls:"eudia-intelligence-actions"}).createEl("button",{text:"Ask",cls:"eudia-btn-primary"});r.onclick=()=>this.submitQuery(),this.queryInput.onkeydown=d=>{d.key==="Enter"&&!d.shiftKey&&(d.preventDefault(),this.submitQuery())},this.threadContainer=t.createDiv({cls:"eudia-intelligence-thread"}),this.responseContainer=t.createDiv({cls:"eudia-intelligence-response"}),this.responseContainer.style.display="none";let o=t.createDiv({cls:"eudia-intelligence-thread-actions"}).createEl("button",{text:"New conversation",cls:"eudia-btn-secondary"});o.onclick=()=>{this.threadContainer.empty(),this.sessionId=null,this.queryInput.value="",this.queryInput.focus()};let c=t.createDiv({cls:"eudia-intelligence-suggestions"});c.createEl("p",{text:"Suggested:",cls:"eudia-suggestions-label"});let l;if(this.accountContext)l=["What should I know before my next meeting?","Summarize our relationship and deal status","What are the key pain points?"];else{let u=(this.plugin.settings.cachedAccounts||[]).slice(0,3).map(y=>y.name);u.length>=2?l=[`What should I know about ${u[0]} before my next meeting?`,`What's the account history with ${u[1]}?`,"What's my late-stage pipeline?"]:l=["What should I know before my next meeting?","What accounts need attention this week?","What is my late-stage pipeline?"]}l.forEach(d=>{let u=c.createEl("button",{text:d,cls:"eudia-suggestion-btn"});u.onclick=()=>{this.queryInput.value=d,this.submitQuery()}}),setTimeout(()=>this.queryInput.focus(),100)}async submitQuery(){let t=this.queryInput.value.trim();if(!t)return;this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-user"}).setText(t),this.queryInput.value="";let n=this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-loading"}),a=this.accountContext?.name?` about ${this.accountContext.name}`:"";n.setText(`Thinking${a}...`),this.scrollThread();try{let r={query:t,accountId:this.accountContext?.id,accountName:this.accountContext?.name,userEmail:this.plugin.settings.userEmail};this.sessionId&&(r.sessionId=this.sessionId);let s=await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/intelligence/query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(r),throw:!1,contentType:"application/json"});if(n.remove(),s.status>=400){let o=s.json?.error||`Server error (${s.status}). Please try again.`;this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-error"}).setText(o),this.scrollThread();return}if(s.json?.success){s.json.sessionId&&(this.sessionId=s.json.sessionId);let o=s.json.answer||"",c=[],l=o.match(/---\s*\n\s*You might also ask:\s*\n((?:\d+\.\s*.+\n?)+)/i);if(l){o=o.substring(0,o.indexOf(l[0])).trim();let b=l[1].trim().split(`
`);for(let v of b){let C=v.replace(/^\d+\.\s*/,"").trim();C.length>5&&c.push(C)}}let d=this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-ai"}),u=d.createDiv({cls:"eudia-intelligence-answer"});if(u.innerHTML=this.formatResponse(o),s.json.context){let b=s.json.context,v=[];b.accountName&&v.push(b.accountName),b.opportunityCount>0&&v.push(`${b.opportunityCount} opps`),b.hasNotes&&v.push("notes"),b.hasCustomerBrain&&v.push("history");let C=b.dataFreshness==="cached"||b.dataFreshness==="session-cached"?" (cached)":"";v.length&&d.createDiv({cls:"eudia-intelligence-context-info"}).setText(`${v.join(" \u2022 ")}${C}`)}if(c.length>0){let b=d.createDiv({cls:"eudia-suggestions-inline"});for(let v of c.slice(0,3)){let C=b.createEl("button",{text:v,cls:"eudia-suggestion-chip-inline"});C.onclick=()=>{this.queryInput.value=v,this.submitQuery()}}}let y=d.createDiv({cls:"eudia-feedback-row"}),m=y.createEl("button",{text:"\u2191 Helpful",cls:"eudia-feedback-btn"}),g=y.createEl("button",{text:"\u2193 Not helpful",cls:"eudia-feedback-btn"}),O=async(b,v,C)=>{v.disabled=!0,v.style.fontWeight="600",v.style.color=b==="helpful"?"var(--text-success)":"var(--text-error)",C.style.display="none";try{await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/intelligence/feedback`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:t,answerSnippet:o.substring(0,300),accountName:this.accountContext?.name||"",accountId:this.accountContext?.id||"",userEmail:this.plugin.settings.userEmail,sessionId:this.sessionId||"",rating:b}),throw:!1})}catch{}};m.onclick=()=>O("helpful",m,g),g.onclick=()=>O("not_helpful",g,m)}else{let o=s.json?.error||"Could not get an answer. Try rephrasing your question.";this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-error"}).setText(o)}this.scrollThread()}catch(r){n.remove(),console.error("[GTM Brain] Intelligence query error:",r);let s="Unable to connect. Please check your internet connection and try again.";r?.message?.includes("timeout")?s="Request timed out. The server may be busy - please try again.":(r?.message?.includes("network")||r?.message?.includes("fetch"))&&(s="Network error. Please check your connection and try again."),this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-error"}).setText(s),this.scrollThread()}}scrollThread(){this.threadContainer.scrollTop=this.threadContainer.scrollHeight}formatResponse(t){let e=t;return e=e.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu,""),e=e.replace(/\n{3,}/g,`

`),e=e.replace(/^([•\-]\s+.+)\n\n(?=[•\-]\s+)/gm,`$1
`),e=e.replace(/^(#{2,3}\s+.+)\n\n/gm,`$1
`),e=e.replace(/^#{1,3}\s+.+\n+(?=#{1,3}\s|\s*$)/gm,""),e=e.replace(/^#{2,3}\s+(.+)$/gm,'</p><h3 class="eudia-intel-header">$1</h3><p>'),e=e.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>"),e=e.replace(/^-\s+\[\s*\]\s+(.+)$/gm,'<li class="eudia-intel-todo">$1</li>'),e=e.replace(/^-\s+\[x\]\s+(.+)$/gm,'<li class="eudia-intel-done">$1</li>'),e=e.replace(/^[•\-]\s+(.+)$/gm,"<li>$1</li>"),e=e.replace(/(<li[^>]*>.*?<\/li>\s*)+/g,'<ul class="eudia-intel-list">$&</ul>'),e=e.replace(/\n\n/g,"</p><p>"),e=e.replace(/\n/g,"<br>"),e=e.replace(/<p>\s*(<ul)/g,"$1"),e=e.replace(/<\/ul>\s*<\/p>/g,"</ul>"),e=e.replace(/<p>\s*(<h3)/g,"$1"),e=e.replace(/<\/h3>\s*<\/p>/g,"</h3>"),e=e.replace(/<\/li>\s*<br>\s*<li/g,"</li><li"),e=e.replace(/<p>\s*<\/p>/g,""),e=e.replace(/<p>\s*<br>\s*<\/p>/g,""),e=e.replace(/(<br>\s*){2,}/g,""),e=e.replace(/<\/h3>\s*<br>/g,"</h3>"),e=e.replace(/<br>\s*<h3/g,"<h3"),e=e.replace(/<br>\s*<ul/g,"<ul"),e=e.replace(/<\/ul>\s*<br>/g,"</ul>"),e=e.replace(/^(<br>)+|(<br>)+$/g,""),e="<p>"+e+"</p>",e=e.replace(/<p><\/p>/g,""),e}onClose(){this.contentEl.empty()}};var se=class extends p.ItemView{constructor(t,e){super(t);this.emailInput=null;this.pollInterval=null;this.plugin=e,this.accountOwnershipService=new H(e.settings.serverUrl),this.steps=[{id:"calendar",title:"Connect Your Calendar",description:"View your meetings and create notes with one click",status:"pending"},{id:"salesforce",title:"Connect to Salesforce",description:"Sync notes and access your accounts",status:"pending"},{id:"transcribe",title:"Ready to Transcribe",description:"Record and summarize meetings automatically",status:"pending"}]}getViewType(){return _}getDisplayText(){return"Setup"}getIcon(){return"settings"}async onOpen(){await this.checkExistingStatus(),await this.render()}async onClose(){this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null)}async checkExistingStatus(){if(this.plugin.settings.userEmail){this.steps[0].status="complete";try{(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0&&(this.steps[1].status="complete",this.plugin.settings.salesforceConnected=!0)}catch{}if(this.plugin.settings.accountsImported){let e=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(s=>s.children!==void 0)||[];e.length>0?(this.steps[2].status="complete",console.log(`[Eudia] Vault reopen: ${e.length} account folders verified`)):(console.warn("[Eudia] accountsImported=true but 0 account folders found \u2014 resetting for re-import"),this.plugin.settings.accountsImported=!1,this.plugin.settings.importedAccountCount=0,await this.plugin.saveSettings());try{let s=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");s&&await this.plugin.app.vault.delete(s)}catch{}let n=this.plugin.settings.userEmail,r=(this.plugin.settings.cachedAccounts||[]).filter(s=>s.id&&String(s.id).startsWith("001"));if(n&&r.length>0){let s=this.plugin.settings.accountsFolder||"Accounts",o=!1;for(let c of r.slice(0,5)){let l=(c.name||"").replace(/[<>:"/\\|?*]/g,"_").trim(),d=`${s}/${l}/Contacts.md`,u=this.plugin.app.vault.getAbstractFileByPath(d);if(u instanceof p.TFile&&!this.plugin.app.metadataCache.getFileCache(u)?.frontmatter?.enriched_at){o=!0;break}}o&&(console.log("[Eudia Setup] Accounts need enrichment \u2014 triggering on vault reopen..."),setTimeout(async()=>{try{let c=r.map(l=>({id:l.id,name:l.name,type:"",isOwned:!1,hadOpportunity:!0,website:null,industry:null}));await this.plugin.enrichAccountFolders(c),console.log(`[Eudia] Vault-reopen enrichment complete: ${c.length} accounts enriched`)}catch(c){console.log("[Eudia] Vault-reopen enrichment failed (will retry next open):",c)}},3e3))}}else{console.log("[Eudia Setup] Email set but accounts not imported \u2014 auto-retrying import...");let t=this.plugin.app.workspace.leftSplit,e=t?.collapsed;try{let n=this.plugin.settings.userEmail,a=M(n)?"admin":B(n)?"cs":"bl",r=[],s=[];if(console.log(`[Eudia Setup] Auto-retry for ${n} (group: ${a})`),a==="cs")r=[...D],console.log(`[Eudia Setup] Auto-retry CS: using ${r.length} static accounts`);else if(a==="admin")r=await this.accountOwnershipService.getAllAccountsForAdmin(n);else{let o=await this.accountOwnershipService.getAccountsWithProspects(n);r=o.accounts,s=o.prospects}if(r.length>0||s.length>0){if(t&&!e&&t.collapse(),a==="admin"?await this.plugin.createAdminAccountFolders(r):(await this.plugin.createTailoredAccountFolders(r,{}),s.length>0&&await this.plugin.createProspectAccountFiles(s)),U(n))try{await this.plugin.createCSManagerDashboard(n,r)}catch{}this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=r.length+s.length,await this.plugin.saveSettings(),this.steps[2].status="complete";try{let o=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");o&&await this.plugin.app.vault.delete(o)}catch{}t&&!e&&t.expand(),console.log(`[Eudia Setup] Auto-retry imported ${r.length} accounts for ${n}`),new p.Notice(`Enriching ${r.length} accounts with Salesforce contacts...`);try{let o=a==="cs"?r:[...r,...s];await this.plugin.enrichAccountFolders(o),new p.Notice(`${r.length} accounts loaded and enriched!`),console.log("[Eudia Setup] Auto-retry enrichment complete")}catch(o){console.log("[Eudia Setup] Auto-retry enrichment failed:",o),new p.Notice(`${r.length} accounts imported! Contacts will populate on next open.`)}}else console.warn(`[Eudia Setup] Auto-retry returned 0 accounts for ${n}. Server may still be starting.`),t&&!e&&t.expand()}catch(n){console.error("[Eudia Setup] Auto-retry account import failed:",n),t&&!e&&t.expand()}}}}getCompletionPercentage(){let t=this.steps.filter(e=>e.status==="complete").length;return Math.round(t/this.steps.length*100)}async render(){let t=this.containerEl.children[1];t.empty(),t.addClass("eudia-setup-view"),this.renderHeader(t),this.renderSteps(t),this.renderGettingStarted(t),this.renderFooter(t)}renderGettingStarted(t){let e=t.createDiv({cls:"eudia-getting-started"});e.createEl("h3",{text:"Your Sidebar Tools",cls:"eudia-getting-started-title"});let n=[{icon:"calendar",name:"Calendar",desc:"View your external meetings. Click any event to create a meeting note under the matched account. Adjust your timezone in the Eudia Transcription Plugin settings."},{icon:"microphone",name:"Transcribe",desc:"Click the mic icon before a meeting to start recording. AI transcribes and extracts key insights, objections, and next steps automatically."},{icon:"message-circle",name:"Ask GTM Brain",desc:"Query Salesforce data in natural language \u2014 pipeline, contacts, deal history, and account intelligence."}];for(let a of n){let r=e.createDiv({cls:"eudia-getting-started-row"}),s=r.createDiv({cls:"eudia-getting-started-icon"});(0,p.setIcon)(s,a.icon);let o=r.createDiv({cls:"eudia-getting-started-text"});o.createEl("strong",{text:a.name}),o.createEl("span",{text:` \u2014 ${a.desc}`})}}renderHeader(t){let e=t.createDiv({cls:"eudia-setup-header"}),n=e.createDiv({cls:"eudia-setup-title-section"});n.createEl("h1",{text:"Welcome to Eudia Sales Vault",cls:"eudia-setup-main-title"}),n.createEl("p",{text:"Complete these steps to transcribe and summarize meetings -- capturing objections, next steps, and pain points to drive better client outcomes and smarter selling.",cls:"eudia-setup-subtitle"});let a=e.createDiv({cls:"eudia-setup-progress-section"}),r=this.getCompletionPercentage(),s=a.createDiv({cls:"eudia-setup-progress-label"});s.createSpan({text:"Setup Progress"}),s.createSpan({text:`${r}%`,cls:"eudia-setup-progress-value"});let c=a.createDiv({cls:"eudia-setup-progress-bar"}).createDiv({cls:"eudia-setup-progress-fill"});c.style.width=`${r}%`}renderSteps(t){let e=t.createDiv({cls:"eudia-setup-steps-container"});this.renderCalendarStep(e),this.renderSalesforceStep(e),this.renderTranscribeStep(e)}renderCalendarStep(t){let e=this.steps[0],n=t.createDiv({cls:`eudia-setup-step-card ${e.status}`}),a=n.createDiv({cls:"eudia-setup-step-header"}),r=a.createDiv({cls:"eudia-setup-step-number"});r.setText(e.status==="complete"?"":"1"),e.status==="complete"&&r.addClass("eudia-step-complete");let s=a.createDiv({cls:"eudia-setup-step-info"});s.createEl("h3",{text:e.title}),s.createEl("p",{text:e.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(e.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:`Connected as ${this.plugin.settings.userEmail}`});else{let c=o.createDiv({cls:"eudia-setup-input-group"});this.emailInput=c.createEl("input",{type:"email",placeholder:"yourname@eudia.com",cls:"eudia-setup-input"}),this.plugin.settings.userEmail&&(this.emailInput.value=this.plugin.settings.userEmail);let l=c.createEl("button",{text:"Connect",cls:"eudia-setup-btn primary"});l.onclick=async()=>{await this.handleCalendarConnect()},this.emailInput.onkeydown=async d=>{d.key==="Enter"&&await this.handleCalendarConnect()},o.createDiv({cls:"eudia-setup-validation-message"}),o.createEl("p",{cls:"eudia-setup-help-text",text:"Your calendar syncs automatically via Microsoft 365. We use your email to identify your meetings."})}}async handleCalendarConnect(){if(!this.emailInput)return;let t=this.emailInput.value.trim().toLowerCase(),e=this.containerEl.querySelector(".eudia-setup-validation-message");if(!t){e&&(e.textContent="Please enter your email",e.className="eudia-setup-validation-message error");return}if(!t.endsWith("@eudia.com")){e&&(e.textContent="Please use your @eudia.com email address",e.className="eudia-setup-validation-message error");return}e&&(e.textContent="Validating...",e.className="eudia-setup-validation-message loading");try{let n=await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${encodeURIComponent(t)}`,method:"GET",throw:!1});if(n.status===200&&n.json?.authorized){this.plugin.settings.userEmail=t,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),this.steps[0].status="complete",new p.Notice("Calendar connected successfully!"),e&&(e.textContent="Importing your accounts...",e.className="eudia-setup-validation-message loading");let a=this.plugin.app.workspace.leftSplit,r=a?.collapsed;a&&!r&&a.collapse();try{let s,o=[],c=M(t)?"admin":B(t)?"cs":"bl";if(console.log(`[Eudia] User group detected: ${c} for ${t}`),c==="cs"){if(console.log(`[Eudia] CS user detected \u2014 loading ${D.length} accounts from static data (instant, no server needed)`),s=[...D],o=[],e&&(e.textContent=`Loading ${s.length} Customer Success accounts...`),await this.plugin.createTailoredAccountFolders(s,{}),U(t))try{await this.plugin.createCSManagerDashboard(t,s)}catch(u){console.error("[Eudia] CS Manager dashboard creation failed (non-blocking):",u)}let d=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(u=>u.children!==void 0)||[];d.length>0?(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length,console.log(`[Eudia] CS accounts verified: ${d.length} folders created`)):(console.warn(`[Eudia] CS folder creation may have failed \u2014 ${d.length} folders found. Keeping accountsImported=false for retry.`),this.plugin.settings.accountsImported=!1),await this.plugin.saveSettings();try{let u=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");u&&await this.plugin.app.vault.delete(u)}catch{}console.log(`[Eudia] CS accounts created: ${s.length} folders from static data`),e&&(e.textContent=`Enriching ${s.length} accounts with Salesforce contacts...`),new p.Notice(`Enriching ${s.length} accounts with contacts from Salesforce...`),console.log(`[Eudia] Starting synchronous enrichment for ${s.length} CS accounts...`);try{await this.plugin.enrichAccountFolders(s),console.log("[Eudia] Synchronous enrichment complete"),new p.Notice(`${s.length} accounts loaded with contacts from Salesforce!`),e&&(e.textContent=`${s.length} accounts loaded and enriched with Salesforce contacts!`)}catch(u){console.log("[Eudia] Synchronous enrichment failed, will retry in background:",u),new p.Notice(`${s.length} accounts loaded! Contacts will populate shortly...`);let y=t,m=[5e3,2e4,6e4],g=async O=>{let b=m[O];if(b!==void 0){await new Promise(v=>setTimeout(v,b));try{await this.plugin.enrichAccountFolders(s),console.log(`[Eudia] Background enrichment retry ${O+1} succeeded`)}catch{return g(O+1)}}};g(0)}}else if(c==="admin"){if(console.log("[Eudia] Admin user detected - importing all accounts"),s=await this.accountOwnershipService.getAllAccountsForAdmin(t),s.length>0){e&&(e.textContent=`Creating ${s.length} account folders...`),await this.plugin.createAdminAccountFolders(s);let d=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(y=>y.children!==void 0)||[];d.length>0?(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length,console.log(`[Eudia] Admin accounts verified: ${d.length} folders created`)):(console.warn("[Eudia] Admin folder creation may have failed \u2014 keeping accountsImported=false for retry"),this.plugin.settings.accountsImported=!1),await this.plugin.saveSettings();try{let y=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");y&&await this.plugin.app.vault.delete(y)}catch{}new p.Notice(`Imported ${s.length} accounts! Enriching with Salesforce data...`);let u=s.filter(y=>y.id&&y.id.startsWith("001"));if(u.length>0){e&&(e.textContent=`Enriching ${u.length} accounts with Salesforce contacts...`);try{await this.plugin.enrichAccountFolders(u),new p.Notice(`${s.length} accounts loaded and enriched with Salesforce data!`),console.log(`[Eudia] Admin/exec synchronous enrichment complete: ${u.length} accounts`),e&&(e.textContent=`${s.length} accounts loaded and enriched!`)}catch(y){console.log("[Eudia] Admin/exec synchronous enrichment failed, will retry on next open:",y),new p.Notice(`${s.length} accounts imported! Contacts will populate on next vault open.`);let m=[5e3,2e4,6e4],g=async O=>{let b=m[O];if(b!==void 0){await new Promise(v=>setTimeout(v,b));try{await this.plugin.enrichAccountFolders(u),console.log(`[Eudia] Admin/exec background enrichment retry ${O+1} succeeded`)}catch{return g(O+1)}}};g(0)}}}}else{let l=await this.accountOwnershipService.getAccountsWithProspects(t);if(s=l.accounts,o=l.prospects,s.length>0||o.length>0){e&&(e.textContent=`Creating ${s.length} account folders...`),await this.plugin.createTailoredAccountFolders(s,{}),o.length>0&&await this.plugin.createProspectAccountFiles(o);let u=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(m=>m.children!==void 0)||[];u.length>0?(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length+o.length,console.log(`[Eudia] BL accounts verified: ${u.length} folders created`)):(console.warn("[Eudia] BL folder creation may have failed \u2014 keeping accountsImported=false for retry"),this.plugin.settings.accountsImported=!1),await this.plugin.saveSettings();try{let m=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");m&&await this.plugin.app.vault.delete(m)}catch{}new p.Notice(`Imported ${s.length} active accounts + ${o.length} prospects!`);let y=[...s,...o];setTimeout(async()=>{try{await this.plugin.enrichAccountFolders(y)}catch(m){console.log("[Eudia] Background enrichment skipped:",m)}},500)}else{console.warn(`[Eudia] No accounts returned for ${t} \u2014 auto-retrying...`);let d=!1;for(let u=1;u<=3;u++){e&&(e.textContent=`Server warming up... retrying in 10s (attempt ${u}/3)`,e.className="eudia-setup-validation-message warning"),await new Promise(y=>setTimeout(y,1e4));try{let y=await this.plugin.accountOwnershipService.getAccountsWithProspects(t);if(y.accounts.length>0||y.prospects.length>0){s=y.accounts,o=y.prospects,e&&(e.textContent=`Creating ${s.length} account folders...`),await this.plugin.createTailoredAccountFolders(s,{}),o.length>0&&await this.plugin.createProspectAccountFiles(o),(this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(O=>O.children!==void 0)||[]).length>0&&(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length+o.length),await this.plugin.saveSettings(),new p.Notice(`Imported ${s.length} accounts + ${o.length} prospects!`),d=!0;break}}catch(y){console.warn(`[Eudia] Retry ${u} failed:`,y)}}d||(e&&(e.textContent="Could not load accounts after 3 attempts. Close this window, wait 1 minute, then re-open Obsidian and try again.",e.className="eudia-setup-validation-message error"),new p.Notice("Account import failed after retries. Wait 1 minute and try again."))}}}catch(s){console.error("[Eudia] Account import failed:",s),e&&(e.textContent="Account import failed. Please try again.",e.className="eudia-setup-validation-message error"),new p.Notice("Account import failed \u2014 please try again.")}finally{a&&!r&&a.expand()}await this.render()}else e&&(e.innerHTML=`<strong>${t}</strong> is not authorized for calendar access. Contact your admin.`,e.className="eudia-setup-validation-message error")}catch{e&&(e.textContent="Connection failed. Please try again.",e.className="eudia-setup-validation-message error")}}renderSalesforceStep(t){let e=this.steps[1],n=t.createDiv({cls:`eudia-setup-step-card ${e.status}`}),a=n.createDiv({cls:"eudia-setup-step-header"}),r=a.createDiv({cls:"eudia-setup-step-number"});r.setText(e.status==="complete"?"":"2"),e.status==="complete"&&r.addClass("eudia-step-complete");let s=a.createDiv({cls:"eudia-setup-step-info"});s.createEl("h3",{text:e.title}),s.createEl("p",{text:e.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(!this.plugin.settings.userEmail){o.createDiv({cls:"eudia-setup-disabled-message",text:"Complete the calendar step first"});return}if(e.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:"Salesforce connected successfully"}),this.plugin.settings.accountsImported&&o.createDiv({cls:"eudia-setup-account-status",text:`${this.plugin.settings.importedAccountCount} accounts imported`});else{let l=o.createDiv({cls:"eudia-setup-button-group"}).createEl("button",{text:"Connect to Salesforce",cls:"eudia-setup-btn primary"}),d=o.createDiv({cls:"eudia-setup-sf-status"});l.onclick=async()=>{let u=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(u,"_blank"),d.textContent="Complete the login in the popup window...",d.className="eudia-setup-sf-status loading",new p.Notice("Complete the Salesforce login in the popup window",5e3),this.startSalesforcePolling(d)},o.createEl("p",{cls:"eudia-setup-help-text",text:"This links your Obsidian notes to your Salesforce account for automatic sync."})}}startSalesforcePolling(t){this.pollInterval&&window.clearInterval(this.pollInterval);let e=0,n=60;this.pollInterval=window.setInterval(async()=>{e++;try{(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),this.steps[1].status="complete",new p.Notice("Salesforce connected successfully!"),await this.importTailoredAccounts(t),await this.render()):e>=n&&(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),t.textContent="Connection timed out. Please try again.",t.className="eudia-setup-sf-status error")}catch{}},5e3)}async importTailoredAccounts(t){t.textContent="Importing your accounts...",t.className="eudia-setup-sf-status loading";try{let e=this.plugin.settings.userEmail,n=M(e)?"admin":B(e)?"cs":"bl";console.log(`[Eudia SF Import] Importing for ${e} (group: ${n})`);let a,r=[];if(n==="cs"){console.log("[Eudia SF Import] CS user SF Connect \u2014 fetching live data from Salesforce..."),t.textContent="Syncing with Salesforce for latest account data...";try{let m=await this.accountOwnershipService.getCSAccounts(e);a=m.accounts,r=m.prospects,console.log(`[Eudia SF Import] CS server sync: ${a.length} accounts (with real SF IDs + CSM data)`)}catch{if(this.plugin.settings.accountsImported){t.textContent="Salesforce connected! Account folders already loaded. Enrichment will retry later.",t.className="eudia-setup-sf-status success",this.steps[1].status="complete";return}a=[...D],console.log(`[Eudia SF Import] CS server unavailable \u2014 using ${a.length} static accounts`)}}else if(n==="admin")console.log("[Eudia] Admin user detected - importing all accounts"),t.textContent="Admin detected - importing all accounts...",a=await this.accountOwnershipService.getAllAccountsForAdmin(e);else{let m=await this.accountOwnershipService.getAccountsWithProspects(e);a=m.accounts,r=m.prospects}if(a.length===0&&r.length===0){t.textContent="No accounts found for your email. Contact your admin.",t.className="eudia-setup-sf-status warning";return}t.textContent=`Creating ${a.length} account folders...`;let s=this.plugin.app.workspace.leftSplit,o=s?.collapsed;if(s&&!o&&s.collapse(),M(e)?await this.plugin.createAdminAccountFolders(a):(await this.plugin.createTailoredAccountFolders(a,{}),r.length>0&&await this.plugin.createProspectAccountFiles(r)),U(e))try{await this.plugin.createCSManagerDashboard(e,a)}catch{}this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=a.length+r.length,await this.plugin.saveSettings();try{let m=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");m&&await this.plugin.app.vault.delete(m)}catch{}s&&!o&&s.expand(),this.steps[2].status="complete";let c=a.filter(m=>m.isOwned!==!1).length,l=a.filter(m=>m.isOwned===!1).length;n==="admin"&&l>0?t.textContent=`${c} owned + ${l} view-only accounts imported! Enriching...`:t.textContent=`${a.length} active + ${r.length} prospect accounts imported! Enriching...`,t.className="eudia-setup-sf-status success";let d=[...a,...r],u=e,y=n;setTimeout(async()=>{try{let m=d.filter(g=>g.id&&g.id.startsWith("001"));if(m.length>0?(t.textContent=`Enriching ${m.length} accounts with Salesforce data...`,await this.plugin.enrichAccountFolders(m),t.textContent=`${a.length} accounts imported, ${m.length} enriched with Salesforce data`):t.textContent=`${a.length} accounts imported (enrichment requires Salesforce IDs)`,y==="cs"&&U(u))try{console.log("[Eudia SF Import] Regenerating CS Manager dashboard with live CSM data..."),await this.plugin.createCSManagerDashboard(u,a),console.log("[Eudia SF Import] CS Manager dashboard updated with CSM assignments")}catch(g){console.error("[Eudia SF Import] Dashboard regeneration failed (non-blocking):",g)}}catch(m){console.log("[Eudia] Background enrichment skipped:",m),t.textContent=`${a.length+r.length} accounts imported (enrichment will retry on next launch)`}},500)}catch{t.textContent="Failed to import accounts. Please try again.",t.className="eudia-setup-sf-status error";let n=this.plugin.app.workspace.leftSplit;if(n?.collapsed===!1)try{n.expand()}catch{}}}renderTranscribeStep(t){let e=this.steps[2],n=t.createDiv({cls:`eudia-setup-step-card ${e.status}`}),a=n.createDiv({cls:"eudia-setup-step-header"}),r=a.createDiv({cls:"eudia-setup-step-number"});r.setText(e.status==="complete"?"":"3"),e.status==="complete"&&r.addClass("eudia-step-complete");let s=a.createDiv({cls:"eudia-setup-step-info"});s.createEl("h3",{text:e.title}),s.createEl("p",{text:e.description});let o=n.createDiv({cls:"eudia-setup-step-content"}),c=o.createDiv({cls:"eudia-setup-instructions"}),l=c.createDiv({cls:"eudia-setup-instruction"}),d=l.createSpan({cls:"eudia-setup-instruction-icon"});(0,p.setIcon)(d,"microphone"),l.createSpan({text:"Click the microphone icon in the left sidebar during a call"});let u=c.createDiv({cls:"eudia-setup-instruction"}),y=u.createSpan({cls:"eudia-setup-instruction-icon"});(0,p.setIcon)(y,"terminal"),u.createSpan({text:'Or press Cmd/Ctrl+P and search for "Transcribe Meeting"'});let m=c.createDiv({cls:"eudia-setup-instruction"}),g=m.createSpan({cls:"eudia-setup-instruction-icon"});(0,p.setIcon)(g,"file-text"),m.createSpan({text:"AI will summarize and extract key insights automatically"}),e.status!=="complete"&&o.createEl("p",{cls:"eudia-setup-help-text muted",text:"This step completes automatically after connecting to Salesforce and importing accounts."})}renderFooter(t){let e=t.createDiv({cls:"eudia-setup-footer"});if(this.steps.every(r=>r.status==="complete")){let r=e.createDiv({cls:"eudia-setup-completion"}),s=r.createEl("h2",{cls:"eudia-setup-completion-title"}),o=s.createSpan({cls:"eudia-setup-completion-icon"});(0,p.setIcon)(o,"check-circle"),s.createSpan({text:" You're all set!"}),r.createEl("p",{text:"Your sales vault is ready. Click below to start using Eudia."});let c=e.createEl("button",{text:"Open Calendar \u2192",cls:"eudia-setup-btn primary large"});c.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(_),await this.plugin.activateCalendarView()}}else{let r=e.createEl("button",{text:"Skip Setup (I'll do this later)",cls:"eudia-setup-btn secondary"});r.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(_),new p.Notice("You can complete setup anytime from Settings \u2192 Eudia Sync")}}let a=e.createEl("a",{text:"Advanced Settings",cls:"eudia-setup-settings-link"});a.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")}}},re=class extends p.ItemView{constructor(t,e){super(t);this.updateInterval=null;this.chatHistory=[];this.plugin=e}getViewType(){return L}getDisplayText(){return"Live Query"}getIcon(){return"message-circle"}async onOpen(){await this.render(),this.updateInterval=window.setInterval(()=>this.updateStatus(),5e3)}async onClose(){this.updateInterval&&window.clearInterval(this.updateInterval)}updateStatus(){let t=this.containerEl.querySelector(".eudia-lq-status");if(t)if(this.plugin.audioRecorder?.isRecording()){let e=Math.round((this.plugin.liveTranscript?.length||0)/5),n=this.plugin.audioRecorder.getState().duration,a=Math.floor(n/60),r=n%60;t.setText(`Recording ${a}:${r.toString().padStart(2,"0")} \u2014 ${e} words captured`),t.style.color="var(--text-success)"}else t.setText("Not recording. Start a recording to use Live Query."),t.style.color="var(--text-muted)"}async render(){let t=this.containerEl.children[1];t.empty(),t.addClass("eudia-live-query-view"),t.style.cssText="display:flex;flex-direction:column;height:100%;padding:12px;";let e=t.createDiv({cls:"eudia-lq-status"});e.style.cssText="font-size:12px;padding:8px 0;border-bottom:1px solid var(--background-modifier-border);margin-bottom:8px;",this.updateStatus();let n=t.createDiv({cls:"eudia-lq-quick-actions"});n.style.cssText="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;";let a=[{label:"Summarize so far",query:"Give me a concise summary of everything discussed so far."},{label:"Action items",query:"What action items or next steps have been discussed so far?"},{label:"Key concerns",query:"What concerns, objections, or risks have been raised?"}];for(let l of a){let d=n.createEl("button",{text:l.label});d.style.cssText="font-size:11px;padding:4px 10px;border-radius:12px;border:1px solid var(--background-modifier-border);cursor:pointer;background:var(--background-secondary);",d.onclick=()=>this.submitQuery(l.query,r,o)}let r=t.createDiv({cls:"eudia-lq-chat"});r.style.cssText="flex:1;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:8px;";for(let l of this.chatHistory)this.renderMessage(r,l.role,l.text);if(this.chatHistory.length===0){let l=r.createDiv();l.style.cssText="color:var(--text-muted);font-size:12px;text-align:center;padding:20px 0;",l.setText("Ask a question about the conversation while recording.")}let s=t.createDiv({cls:"eudia-lq-input-area"});s.style.cssText="display:flex;gap:8px;border-top:1px solid var(--background-modifier-border);padding-top:8px;";let o=s.createEl("textarea",{attr:{placeholder:"Ask about the conversation...",rows:"2"}});o.style.cssText="flex:1;resize:none;border-radius:8px;padding:8px;font-size:13px;border:1px solid var(--background-modifier-border);background:var(--background-primary);";let c=s.createEl("button",{text:"Ask"});c.style.cssText="padding:8px 16px;border-radius:8px;cursor:pointer;align-self:flex-end;font-weight:600;",c.addClass("mod-cta"),c.onclick=()=>this.submitQuery(o.value.trim(),r,o),o.addEventListener("keydown",l=>{l.key==="Enter"&&!l.shiftKey&&(l.preventDefault(),c.click())})}renderMessage(t,e,n){let a=t.querySelector(".eudia-lq-chat > div:only-child");a&&a.textContent?.includes("Ask a question")&&a.remove();let r=t.createDiv(),s=e==="user";r.style.cssText=`padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.5;max-width:90%;${s?"align-self:flex-end;background:var(--interactive-accent);color:var(--text-on-accent);":"align-self:flex-start;background:var(--background-secondary);"}`,r.setText(n)}async submitQuery(t,e,n){if(!t)return;if(!this.plugin.audioRecorder?.isRecording()){new p.Notice("Start a recording first to use Live Query.");return}let a=this.plugin.liveTranscript||"";if(a.length<50){new p.Notice("Not enough transcript captured yet. Keep recording for a few more minutes.");return}this.chatHistory.push({role:"user",text:t}),this.renderMessage(e,"user",t),n.value="";let r=e.createDiv();r.style.cssText="align-self:flex-start;padding:8px 12px;border-radius:10px;font-size:13px;background:var(--background-secondary);color:var(--text-muted);",r.setText("Thinking..."),e.scrollTop=e.scrollHeight;try{let s=await this.plugin.transcriptionService.liveQueryTranscript(t,a,this.plugin.getAccountNameFromActiveFile());r.remove();let o=s.success?s.answer:s.error||"Query failed";this.chatHistory.push({role:"assistant",text:o}),this.renderMessage(e,"assistant",o)}catch(s){r.remove();let o=`Error: ${s.message}`;this.chatHistory.push({role:"assistant",text:o}),this.renderMessage(e,"assistant",o)}e.scrollTop=e.scrollHeight}},oe=class S extends p.ItemView{constructor(t,e){super(t);this.refreshInterval=null;this.lastError=null;this.showExternalOnly=!0;this.weeksBack=2;this.plugin=e}getViewType(){return G}getDisplayText(){return"Calendar"}getIcon(){return"calendar"}async onOpen(){await this.render(),this.refreshInterval=window.setInterval(()=>this.render(),5*60*1e3)}async onClose(){this.refreshInterval&&window.clearInterval(this.refreshInterval)}async render(){let t=this.containerEl.children[1];if(t.empty(),t.addClass("eudia-calendar-view"),!this.plugin.settings.userEmail){this.renderSetupPanel(t);return}this.renderHeader(t),await this.renderCalendarContent(t)}static{this.INTERNAL_SUBJECT_PATTERNS=[/^block\b/i,/\bblock\s+for\b/i,/\bcommute\b/i,/\bpersonal\b/i,/\blunch\b/i,/\bOOO\b/i,/\bout of office\b/i,/\bfocus time\b/i,/\bno meetings?\b/i,/\bmeeting free\b/i,/\btravel\b/i,/\beye appt\b/i,/\bdoctor\b/i,/\bdentist\b/i,/\bgym\b/i,/\bworkout\b/i]}isExternalMeeting(t){if(t.isCustomerMeeting)return!0;if(!t.attendees||t.attendees.length===0)return!1;let e=this.plugin.settings.userEmail?.split("@")[1]||"eudia.com";if(t.attendees.some(a=>{if(a.isExternal===!0)return!0;if(a.isExternal===!1||!a.email)return!1;let r=a.email.split("@")[1]?.toLowerCase();return r&&r!==e.toLowerCase()}))return!0;for(let a of S.INTERNAL_SUBJECT_PATTERNS)if(a.test(t.subject))return!1;return!1}renderHeader(t){let e=t.createDiv({cls:"eudia-calendar-header"}),n=e.createDiv({cls:"eudia-calendar-title-row"});n.createEl("h4",{text:"Your Meetings"});let a=n.createDiv({cls:"eudia-calendar-actions"}),r=a.createEl("button",{cls:"eudia-btn-icon",text:"\u21BB"});r.title="Refresh",r.onclick=async()=>{r.addClass("spinning"),this._forceRefresh=!0,await this.render(),r.removeClass("spinning")};let s=a.createEl("button",{cls:"eudia-btn-icon"});(0,p.setIcon)(s,"settings"),s.title="Settings",s.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")};let o=e.createDiv({cls:"eudia-status-bar"});this.renderConnectionStatus(o);let c=e.createDiv({cls:"eudia-calendar-filter-row"});c.style.cssText="display:flex;align-items:center;gap:8px;margin-top:6px;padding:4px 0;";let l=c.createEl("button",{text:this.showExternalOnly?"External Only":"All Meetings",cls:"eudia-filter-toggle"});l.style.cssText=`font-size:11px;padding:3px 10px;border-radius:12px;cursor:pointer;border:1px solid var(--background-modifier-border);background:${this.showExternalOnly?"var(--interactive-accent)":"var(--background-secondary)"};color:${this.showExternalOnly?"var(--text-on-accent)":"var(--text-muted)"};`,l.title=this.showExternalOnly?"Showing customer/external meetings only \u2014 click to show all":"Showing all meetings \u2014 click to filter to external only",l.onclick=async()=>{this.showExternalOnly=!this.showExternalOnly,await this.render()}}async renderConnectionStatus(t){let e={server:"connecting",calendar:"not_configured",salesforce:"not_configured"},n=this.plugin.settings.serverUrl,a=this.plugin.settings.userEmail;try{(await(0,p.requestUrl)({url:`${n}/api/health`,method:"GET",throw:!1})).status===200?(e.server="connected",e.serverMessage="Server online"):(e.server="error",e.serverMessage="Server unavailable")}catch{e.server="error",e.serverMessage="Cannot reach server"}if(a&&e.server==="connected")try{let d=await(0,p.requestUrl)({url:`${n}/api/calendar/validate/${encodeURIComponent(a)}`,method:"GET",throw:!1});d.status===200&&d.json?.authorized?(e.calendar="connected",e.calendarMessage="Calendar synced"):(e.calendar="not_authorized",e.calendarMessage="Not authorized")}catch{e.calendar="error",e.calendarMessage="Error checking access"}if(a&&e.server==="connected")try{let d=await(0,p.requestUrl)({url:`${n}/api/sf/auth/status?email=${encodeURIComponent(a)}`,method:"GET",throw:!1});d.status===200&&d.json?.connected?(e.salesforce="connected",e.salesforceMessage="Salesforce connected"):(e.salesforce="not_configured",e.salesforceMessage="Not connected")}catch{e.salesforce="not_configured"}let r=t.createDiv({cls:"eudia-status-indicators"}),s=r.createSpan({cls:`eudia-status-dot ${e.server}`});s.title=e.serverMessage||"Server";let o=r.createSpan({cls:`eudia-status-dot ${e.calendar}`});o.title=e.calendarMessage||"Calendar";let c=r.createSpan({cls:`eudia-status-dot ${e.salesforce}`});if(c.title=e.salesforceMessage||"Salesforce",t.createDiv({cls:"eudia-status-labels"}).createSpan({cls:"eudia-status-label",text:this.plugin.settings.userEmail}),e.calendar==="not_authorized"){let d=t.createDiv({cls:"eudia-status-warning"});d.innerHTML=`<strong>${a}</strong> is not authorized for calendar access. Contact your admin.`}}async renderCalendarContent(t){let e=t.createDiv({cls:"eudia-calendar-content"}),n=e.createDiv({cls:"eudia-calendar-loading"});n.innerHTML='<div class="eudia-spinner"></div><span>Loading meetings...</span>';try{let a=new F(this.plugin.settings.serverUrl,this.plugin.settings.userEmail,this.plugin.settings.timezone||"America/New_York"),r=this._forceRefresh||!1;this._forceRefresh=!1;let s=await a.getWeekMeetings(r);if(!s.success){n.remove(),this.renderError(e,s.error||"Failed to load calendar");return}let o=new Date,c=new Date(o);c.setDate(c.getDate()-this.weeksBack*7);let l=new Date(o);l.setDate(l.getDate()-1);let d=[];try{d=await a.getMeetingsInRange(c,l)}catch{console.log("[Calendar] Could not fetch past meetings")}n.remove();let u={};for(let v of d){let C=v.start.split("T")[0];u[C]||(u[C]=[]),u[C].push(v)}for(let[v,C]of Object.entries(s.byDay||{})){u[v]||(u[v]=[]);let f=new Set(u[v].map(h=>h.id));for(let h of C)f.has(h.id)||u[v].push(h)}let y={};for(let[v,C]of Object.entries(u)){let f=this.showExternalOnly?C.filter(h=>this.isExternalMeeting(h)):C;f.length>0&&(y[v]=f)}let m=Object.keys(y).sort();if(m.length===0){this.renderEmptyState(e);return}await this.renderCurrentMeeting(e,a);let g=e.createEl("button",{text:"\u2190 Load earlier meetings",cls:"eudia-load-earlier"});g.style.cssText="width:100%;padding:8px;margin-bottom:8px;font-size:12px;cursor:pointer;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-muted);",g.onclick=async()=>{this.weeksBack+=2,await this.render()};let O=o.toISOString().split("T")[0],b=null;for(let v of m){let C=y[v];if(!C||C.length===0)continue;let f=this.renderDaySection(e,v,C);v===O&&(b=f)}b&&setTimeout(()=>b.scrollIntoView({block:"start",behavior:"auto"}),100)}catch(a){n.remove(),this.renderError(e,a.message||"Failed to load calendar")}}async renderCurrentMeeting(t,e){try{let n=await e.getCurrentMeeting();if(n.meeting){let a=t.createDiv({cls:"eudia-now-card"});n.isNow?a.createDiv({cls:"eudia-now-badge",text:"\u25CF NOW"}):a.createDiv({cls:"eudia-now-badge soon",text:`In ${n.minutesUntilStart}m`});let r=a.createDiv({cls:"eudia-now-content"});r.createEl("div",{cls:"eudia-now-subject",text:n.meeting.subject}),n.meeting.accountName&&r.createEl("div",{cls:"eudia-now-account",text:n.meeting.accountName});let s=a.createEl("button",{cls:"eudia-now-action",text:"Create Note"});s.onclick=()=>this.createNoteForMeeting(n.meeting)}}catch{}}renderDaySection(t,e,n){let a=t.createDiv({cls:"eudia-calendar-day"}),r=new Date().toISOString().split("T")[0],s=e===r,o=e<r,c=s?"TODAY":F.getDayName(e),l=a.createEl("div",{cls:`eudia-calendar-day-header ${s?"today":""} ${o?"past":""}`,text:c});s?l.style.cssText="font-weight:700;color:var(--interactive-accent);":o&&(l.style.cssText="opacity:0.7;");for(let d of n){let u=a.createDiv({cls:`eudia-calendar-meeting ${d.isCustomerMeeting?"customer":"internal"} ${o?"past":""}`});o&&(u.style.cssText="opacity:0.85;"),u.createEl("div",{cls:"eudia-calendar-time",text:F.formatTime(d.start,this.plugin.settings.timezone)});let y=u.createDiv({cls:"eudia-calendar-details"});if(y.createEl("div",{cls:"eudia-calendar-subject",text:d.subject}),d.accountName)y.createEl("div",{cls:"eudia-calendar-account",text:d.accountName});else if(d.attendees&&d.attendees.length>0){let m=d.attendees.filter(g=>g.isExternal!==!1).slice(0,2).map(g=>g.name||g.email?.split("@")[0]||"Unknown").join(", ");m&&y.createEl("div",{cls:"eudia-calendar-attendees",text:m})}u.onclick=()=>this.createNoteForMeeting(d),u.title="Click to create meeting note"}return a}renderEmptyState(t){let e=t.createDiv({cls:"eudia-calendar-empty"});e.innerHTML=`
      <div class="eudia-empty-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <p class="eudia-empty-title">No meetings this week</p>
      <p class="eudia-empty-subtitle">Enjoy your focus time!</p>
    `}renderError(t,e){let n=t.createDiv({cls:"eudia-calendar-error"}),a="",r="Unable to load calendar",s="";e.includes("not authorized")||e.includes("403")?(a="\u{1F512}",r="Calendar Access Required",s="Contact your admin to be added to the authorized users list."):e.includes("network")||e.includes("fetch")?(a="\u{1F4E1}",r="Connection Issue",s="Check your internet connection and try again."):(e.includes("server")||e.includes("500"))&&(a="\u{1F527}",r="Server Unavailable",s="The server may be waking up. Try again in 30 seconds."),n.innerHTML=`
      <div class="eudia-error-icon">${a}</div>
      <p class="eudia-error-title">${r}</p>
      <p class="eudia-error-message">${e}</p>
      ${s?`<p class="eudia-error-action">${s}</p>`:""}
    `;let o=n.createEl("button",{cls:"eudia-btn-retry",text:"Try Again"});o.onclick=()=>this.render()}renderSetupPanel(t){let e=t.createDiv({cls:"eudia-calendar-setup-panel"});e.innerHTML=`
      <div class="eudia-setup-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <h3 class="eudia-setup-title">Connect Your Calendar</h3>
      <p class="eudia-setup-desc">Enter your Eudia email to see your meetings and create notes with one click.</p>
    `;let n=e.createDiv({cls:"eudia-setup-input-group"}),a=n.createEl("input",{type:"email",placeholder:"yourname@eudia.com"});a.addClass("eudia-setup-email");let r=n.createEl("button",{cls:"eudia-setup-connect",text:"Connect"}),s=e.createDiv({cls:"eudia-setup-status"});r.onclick=async()=>{let o=a.value.trim().toLowerCase();if(!o||!o.endsWith("@eudia.com")){s.textContent="Please use your @eudia.com email",s.className="eudia-setup-status error";return}r.disabled=!0,r.textContent="Connecting...",s.textContent="";try{if(!(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${o}`,method:"GET"})).json?.authorized){s.innerHTML=`<strong>${o}</strong> is not authorized. Contact your admin to be added.`,s.className="eudia-setup-status error",r.disabled=!1,r.textContent="Connect";return}this.plugin.settings.userEmail=o,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),s.textContent="Connected",s.className="eudia-setup-status success",this.plugin.scanLocalAccountFolders().catch(()=>{}),setTimeout(()=>this.render(),500)}catch(c){let l=c.message||"Connection failed";l.includes("403")?s.innerHTML=`<strong>${o}</strong> is not authorized for calendar access.`:s.textContent=l,s.className="eudia-setup-status error",r.disabled=!1,r.textContent="Connect"}},a.onkeydown=o=>{o.key==="Enter"&&r.click()},e.createEl("p",{cls:"eudia-setup-help",text:"Your calendar syncs automatically via Microsoft 365."})}extractCompanyFromDomain(t){let e=t.toLowerCase().split("."),n=["mail","email","app","portal","crm","www","smtp","sales","support","login","sso","auth","api","my"],a=["com","org","net","io","co","ai","gov","edu","uk","us","de","fr","jp","au","ca"],r=e.filter(o=>!a.includes(o)&&o.length>1);if(r.length===0)return e[0]||"";if(r.length>1&&n.includes(r[0]))return r[1].charAt(0).toUpperCase()+r[1].slice(1);let s=r[r.length-1];return s.charAt(0).toUpperCase()+s.slice(1)}getExternalDomainsFromAttendees(t){if(!t||t.length===0)return[];let e=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com","live.com","msn.com","aol.com","protonmail.com","googlemail.com","mail.com","zoho.com","ymail.com"],n=new Set,a=[];for(let r of t){if(!r.email)continue;let o=r.email.toLowerCase().match(/@([a-z0-9.-]+)/);if(o){let c=o[1];if(c.includes("eudia.com")||e.includes(c)||n.has(c))continue;n.add(c);let l=this.extractCompanyFromDomain(c);l.length>=2&&a.push({domain:c,company:l})}}return a}findBestAccountMatch(t,e,n){let a=this.plugin.settings.accountsFolder||"Accounts",r=this.app.vault.getAbstractFileByPath(a);if(!(r instanceof p.TFolder))return null;let s=[];for(let c of r.children)c instanceof p.TFolder&&s.push(c.name);if(s.length===0)return null;let o=[];for(let{domain:c,company:l}of t){let d=this.findAccountFolder(l),u=d?1:0;o.push({domain:c,company:l,folder:d,score:u})}if(o.sort((c,l)=>l.score-c.score),o.length>0&&o[0].folder){let c=o[0],l=c.folder.split("/").pop()||c.company;return console.log(`[Eudia Calendar] Best domain match: "${c.company}" from ${c.domain} -> ${c.folder}`),{folder:c.folder,accountName:l,source:"domain"}}if(e){let c=this.findAccountFolder(e);if(c){let l=c.split("/").pop()||e;return console.log(`[Eudia Calendar] Server account match: "${e}" -> ${c}`),{folder:c,accountName:l,source:"server"}}}if(n){let c=this.findAccountFolder(n);if(c){let l=c.split("/").pop()||n;return console.log(`[Eudia Calendar] Subject match: "${n}" -> ${c}`),{folder:c,accountName:l,source:"subject"}}}for(let{company:c}of t){let l=s.find(d=>{let u=d.toLowerCase(),y=c.toLowerCase();return u.includes(y)||y.includes(u)});if(l){let d=`${a}/${l}`;return console.log(`[Eudia Calendar] Partial domain match: "${c}" -> ${d}`),{folder:d,accountName:l,source:"domain-partial"}}}return null}extractAccountFromAttendees(t){let e=this.getExternalDomainsFromAttendees(t);if(e.length===0)return null;let n=e[0];return console.log(`[Eudia Calendar] Extracted company "${n.company}" from attendee domain ${n.domain}`),n.company}extractAccountFromSubject(t){if(!t)return null;let e=t.match(/^([^\/]+)\s*\/\s*Eudia|Eudia\s*\/\s*([^\/\-|]+)/i);if(e){let a=(e[1]||e[2]||"").trim();if(a.toLowerCase()!=="eudia")return a}let n=t.match(/^Eudia\s*[-–]\s*([^|]+)|^([^-–]+)\s*[-–]\s*Eudia/i);if(n){let r=(n[1]||n[2]||"").trim().replace(/\s+(Connect|Weekly|Call|Meeting|Intro|Demo|Check\s*in|Sync).*$/i,"").trim();if(r.toLowerCase()!=="eudia"&&r.length>0)return r}if(!t.toLowerCase().includes("eudia")){let a=t.match(/^([^-–|]+)/);if(a){let r=a[1].trim();if(r.length>2&&r.length<50)return r}}return null}findAccountFolder(t){if(!t)return null;let e=this.plugin.settings.accountsFolder||"Accounts",n=this.app.vault.getAbstractFileByPath(e);if(!(n instanceof p.TFolder))return console.log(`[Eudia Calendar] Accounts folder "${e}" not found`),null;let a=t.toLowerCase().trim(),r=[];for(let u of n.children)u instanceof p.TFolder&&r.push(u.name);console.log(`[Eudia Calendar] Searching for "${a}" in ${r.length} folders`);let s=r.find(u=>u.toLowerCase()===a);if(s)return console.log(`[Eudia Calendar] Exact match found: ${s}`),`${e}/${s}`;let o=r.find(u=>u.toLowerCase().startsWith(a));if(o)return console.log(`[Eudia Calendar] Folder starts with match: ${o}`),`${e}/${o}`;let c=r.find(u=>a.startsWith(u.toLowerCase()));if(c)return console.log(`[Eudia Calendar] Search starts with folder match: ${c}`),`${e}/${c}`;let l=r.find(u=>{let y=u.toLowerCase();return y.length<3||!a.includes(y)?!1:new RegExp(`\\b${y.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`).test(a)});if(l)return console.log(`[Eudia Calendar] Search contains folder match: ${l}`),`${e}/${l}`;let d=r.find(u=>{let y=u.toLowerCase();return a.length<3||!y.includes(a)?!1:new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`).test(y)});return d?(console.log(`[Eudia Calendar] Folder contains search match: ${d}`),`${e}/${d}`):(console.log(`[Eudia Calendar] No folder match found for "${a}"`),null)}async createNoteForMeeting(t){let e=t.start.split("T")[0],n=this.plugin.settings.eudiaEmail||"",a=M(n),r=(t.attendees||[]).map(f=>f.email).filter(Boolean),s=de(t.subject,r);if(a&&s.isPipelineMeeting&&s.confidence>=60){await this._createPipelineNote(t,e);return}let o=t.subject.replace(/[<>:"/\\|?*]/g,"_").substring(0,50),c=`${e} - ${o}.md`,l=null,d=t.accountName||null,u=null;console.log(`[Eudia Calendar] === Creating note for meeting: "${t.subject}" ===`),console.log(`[Eudia Calendar] Attendees: ${JSON.stringify(t.attendees?.map(f=>f.email)||[])}`);let y=this.getExternalDomainsFromAttendees(t.attendees||[]);console.log(`[Eudia Calendar] External domains found: ${JSON.stringify(y)}`);let m=this.extractAccountFromSubject(t.subject);console.log(`[Eudia Calendar] Subject-extracted name: "${m||"none"}"`);let g=this.findBestAccountMatch(y,t.accountName,m||void 0);if(g&&(l=g.folder,d=g.accountName,console.log(`[Eudia Calendar] Best match (${g.source}): "${d}" -> ${l}`)),!l){let f=this.plugin.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(f)instanceof p.TFolder&&(l=f,console.log(`[Eudia Calendar] No match found, using Accounts root: ${l}`))}if(d){let f=this.plugin.settings.cachedAccounts.find(h=>h.name.toLowerCase()===d?.toLowerCase());f&&(u=f.id,d=f.name,console.log(`[Eudia Calendar] Matched to cached account: ${f.name} (${f.id})`))}let O=l?`${l}/${c}`:c,b=this.app.vault.getAbstractFileByPath(O);if(b instanceof p.TFile){await this.app.workspace.getLeaf().openFile(b);try{let f=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;f?.revealInFolder&&f.revealInFolder(b)}catch{}new p.Notice(`Opened existing note: ${c}`);return}let v=(t.attendees||[]).map(f=>f.name||f.email?.split("@")[0]||"Unknown").slice(0,5).join(", "),C=`---
title: "${t.subject}"
date: ${e}
attendees: [${v}]
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
${(t.attendees||[]).map(f=>`- ${f.name||f.email}`).join(`
`)}

## Pre-Call Notes

*Add any prep notes, context, or questions before the meeting*



---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` \u2192 **"Transcribe Meeting"**

---

`;try{let f=await this.app.vault.create(O,C);await this.app.workspace.getLeaf().openFile(f);try{let h=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;h?.revealInFolder&&h.revealInFolder(f)}catch{}new p.Notice(`Created: ${O}`)}catch(f){console.error("[Eudia Calendar] Failed to create note:",f),new p.Notice(`Could not create note: ${f.message||"Unknown error"}`)}}async _createPipelineNote(t,e){let n=new Date(e+"T00:00:00"),a=String(n.getMonth()+1).padStart(2,"0"),r=String(n.getDate()).padStart(2,"0"),s=String(n.getFullYear()).slice(-2),o=`${a}.${r}.${s}`,c=`Team Pipeline Meeting - ${o}.md`,l="Pipeline Meetings";this.app.vault.getAbstractFileByPath(l)||await this.app.vault.createFolder(l);let u=`${l}/${c}`,y=this.app.vault.getAbstractFileByPath(u);if(y instanceof p.TFile){await this.app.workspace.getLeaf().openFile(y);try{let O=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;O?.revealInFolder&&O.revealInFolder(y)}catch{}new p.Notice(`Opened existing: ${c}`);return}let m=(t.attendees||[]).map(O=>O.name||O.email?.split("@")[0]||"Unknown"),g=`---
title: "Team Pipeline Meeting - ${o}"
date: ${e}
attendees: [${m.slice(0,10).join(", ")}]
meeting_type: pipeline_review
meeting_start: ${t.start}
transcribed: false
---

# Weekly Pipeline Review | ${n.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"})}

## Attendees
${m.map(O=>`- ${O}`).join(`
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

`;try{let O=await this.app.vault.create(u,g);await this.app.workspace.getLeaf().openFile(O);try{let b=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;b?.revealInFolder&&b.revealInFolder(O)}catch{}new p.Notice(`Created pipeline note: ${c}`),console.log(`[Eudia Pipeline] Created pipeline meeting note: ${u}`)}catch(O){console.error("[Eudia Pipeline] Failed to create pipeline note:",O),new p.Notice(`Could not create pipeline note: ${O.message||"Unknown error"}`)}}},Q=class S extends p.Plugin{constructor(){super(...arguments);this.audioRecorder=null;this.recordingStatusBar=null;this.micRibbonIcon=null;this._updateInProgress=!1;this._updateStatusEl=null;this.liveTranscript="";this.liveTranscriptChunkInterval=null;this.isTranscribingChunk=!1;this._updateRetryCount=0;this.sfSyncStatusBarEl=null;this.sfSyncIntervalId=null}async onload(){await this.loadSettings(),this.transcriptionService=new q(this.settings.serverUrl),this.calendarService=new F(this.settings.serverUrl,this.settings.userEmail,this.settings.timezone||"America/New_York"),this.smartTagService=new J,this.telemetry=new te(this.settings.serverUrl,this.settings.userEmail),T.setupDisplayMediaHandler().then(n=>{console.log(n?"[Eudia] System audio: loopback handler ready":"[Eudia] System audio: handler not available, will try other strategies on record")}).catch(()=>{}),this.checkForUpdateRollback().catch(n=>console.warn("[Eudia] Rollback check error:",n));let t=this.settings.lastUpdateTimestamp?Date.now()-new Date(this.settings.lastUpdateTimestamp).getTime():1/0,e=this.manifest?.version||"0.0.0";if(t<3e4&&this.settings.lastUpdateVersion===e&&(this._showUpdateStatus(`\u2713 Eudia v${e} active`),setTimeout(()=>this._hideUpdateStatus(),6e3),console.log(`[Eudia Update] Confirmed: now running v${e}`)),this.settings.pendingUpdateVersion){let n=this.settings.pendingUpdateVersion;this.settings.pendingUpdateVersion=null,this.saveSettings(),setTimeout(()=>{console.log(`[Eudia Update] Resuming deferred update to v${n}`),this.performAutoUpdate(this.settings.serverUrl||"https://gtm-wizard.onrender.com",n,this.manifest?.version||"0.0.0")},8e3)}setTimeout(()=>this.checkForPluginUpdate(),5e3),this.registerInterval(window.setInterval(()=>this.checkForPluginUpdate(),30*60*1e3)),setTimeout(()=>this.healFailedTranscriptions(),3e4),this.registerView(G,n=>new oe(n,this)),this.registerView(_,n=>new se(n,this)),this.registerView(L,n=>new re(n,this)),this.addRibbonIcon("calendar","Open Calendar",()=>this.activateCalendarView()),this.micRibbonIcon=this.addRibbonIcon("microphone","Transcribe Meeting",async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}),this.addRibbonIcon("message-circle","Ask GTM Brain",()=>{this.openIntelligenceQueryForCurrentNote()}),this.registerEvent(this.app.vault.on("create",async n=>{if(!(n instanceof p.TFile)||n.extension!=="md")return;let a=this.settings.accountsFolder||"Accounts";if(!n.path.startsWith(a+"/")||!n.basename.startsWith("Untitled"))return;let r=n.path.split("/");if(r.length<3)return;let s=r[1],o=r.slice(0,2).join("/"),c="",l=["Contacts.md","Note 1.md","Intelligence.md"];for(let C of l){let f=this.app.vault.getAbstractFileByPath(`${o}/${C}`);if(f instanceof p.TFile)try{let w=(await this.app.vault.read(f)).match(/account_id:\s*"?([^"\n]+)"?/);if(w){c=w[1].trim();break}}catch{}}let d=this.app.vault.getAbstractFileByPath(o),u=0;if(d&&d.children)for(let C of d.children){let f=C.name?.match(/^Note\s+(\d+)/i);f&&(u=Math.max(u,parseInt(f[1])))}let y=u+1,m=new Date,g=m.toLocaleDateString("en-US",{month:"short",day:"numeric"}),O=m.toISOString().split("T")[0],b=`Note ${y} - ${g}.md`,v=`---
account: "${s}"
account_id: "${c}"
type: meeting_note
sync_to_salesforce: false
created: ${O}
---

# ${s} - Meeting Note

**Date:** ${g}
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`;try{let C=`${o}/${b}`;await this.app.vault.modify(n,v),await this.app.fileManager.renameFile(n,C),console.log(`[Eudia] Auto-templated: ${C} (account_id: ${c})`)}catch(C){console.warn("[Eudia] Auto-template failed:",C)}})),this.addCommand({id:"transcribe-meeting",name:"Transcribe Meeting",callback:async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}}),this.addCommand({id:"open-calendar",name:"Open Calendar",callback:()=>this.activateCalendarView()}),this.addCommand({id:"sync-accounts",name:"Sync Salesforce Accounts",callback:()=>this.syncAccounts()}),this.addCommand({id:"sync-note",name:"Sync Note to Salesforce",callback:()=>this.syncNoteToSalesforce()}),this.addCommand({id:"new-meeting-note",name:"New Meeting Note",callback:()=>this.createMeetingNote()}),this.addCommand({id:"ask-gtm-brain",name:"Ask gtm-brain",callback:()=>this.openIntelligenceQueryForCurrentNote()}),this.addCommand({id:"copy-for-slack",name:"Copy Note for Slack",callback:()=>this.copyForSlack()}),this.addCommand({id:"open-setup-guide",name:"Open Getting Started Guide",callback:()=>this.activateSetupView()}),this.addCommand({id:"check-for-updates",name:"Check for Eudia Updates",callback:async()=>{this._showUpdateStatus("\u27F3 Checking for updates\u2026");let n=this.manifest?.version||"?";try{let a=this.settings.serverUrl||"https://gtm-wizard.onrender.com",r=await(0,p.requestUrl)({url:`${a}/api/plugin/version`}),s=r.json?.currentVersion||"?";if(r.json?.success&&s!==n){let o=s.split(".").map(Number),c=n.split(".").map(Number),l=!1;for(let d=0;d<3;d++){if((o[d]||0)>(c[d]||0)){l=!0;break}if((o[d]||0)<(c[d]||0))break}l?await this.performAutoUpdate(a,s,n):(this._showUpdateStatus(`\u2713 Up to date (v${n})`),setTimeout(()=>this._hideUpdateStatus(),5e3))}else this._showUpdateStatus(`\u2713 Up to date (v${n})`),setTimeout(()=>this._hideUpdateStatus(),5e3)}catch{this._showUpdateStatus(`\u2717 Update check failed \u2014 v${n}`),setTimeout(()=>this._hideUpdateStatus(),8e3)}}}),this.addCommand({id:"test-system-audio",name:"Test System Audio Capture",callback:async()=>{new p.Notice("Probing system audio capabilities...",3e3);try{let n=await T.probeSystemAudioCapabilities(),a=[`Platform: ${n.platform}`,`Electron: ${n.electronVersion||"N/A"} | Chromium: ${n.chromiumVersion||"N/A"}`,`desktopCapturer: ${n.desktopCapturerAvailable?`YES (${n.desktopCapturerSources} sources)`:"no"}`,`@electron/remote: ${n.remoteAvailable?"YES":"no"} | session: ${n.remoteSessionAvailable?"YES":"no"}`,`ipcRenderer: ${n.ipcRendererAvailable?"YES":"no"}`,`getDisplayMedia: ${n.getDisplayMediaAvailable?"YES":"no"}`,`Handler setup: ${n.handlerSetupResult}`,"",`Best path: ${n.bestPath}`];new p.Notice(a.join(`
`),2e4),console.log("[Eudia] System audio probe:",JSON.stringify(n,null,2))}catch(n){new p.Notice(`Probe failed: ${n.message}`,5e3)}}}),this.addCommand({id:"enrich-accounts",name:"Enrich Account Folders with Salesforce Data",callback:async()=>{if(!this.settings.userEmail){new p.Notice("Please set up your email first.");return}let n=new H(this.settings.serverUrl),a;B(this.settings.userEmail)?a=await n.getCSAccounts(this.settings.userEmail):a=await n.getAccountsWithProspects(this.settings.userEmail);let r=[...a.accounts,...a.prospects];if(r.length===0){new p.Notice("No accounts found to enrich.");return}await this.enrichAccountFolders(r)}}),this.addCommand({id:"refresh-analytics",name:"Refresh Analytics Dashboard",callback:async()=>{let n=this.app.workspace.getActiveFile();n?await this.refreshAnalyticsDashboard(n):new p.Notice("No active file")}}),this.addCommand({id:"live-query-transcript",name:"Query Current Transcript (Live)",callback:async()=>{if(!this.audioRecorder?.isRecording()){new p.Notice("No active recording. Start recording first to use live query.");return}if(!this.liveTranscript||this.liveTranscript.length<50){new p.Notice("Not enough transcript captured yet. Keep recording for a few more minutes.");return}this.openLiveQueryModal()}}),this.addCommand({id:"retry-transcription",name:"Retry Transcription",callback:async()=>{await this.retryTranscriptionForCurrentNote()}}),this.sfSyncStatusBarEl=this.addStatusBarItem(),this.sfSyncStatusBarEl.setText("SF Sync: Idle"),this.sfSyncStatusBarEl.addClass("eudia-sf-sync-status"),this.addSettingTab(new ce(this.app,this)),this.registerEditorSuggest(new ne(this.app,this)),this.app.workspace.onLayoutReady(async()=>{if(!this.settings.setupCompleted&&this.settings.userEmail&&this.settings.salesforceConnected&&this.settings.accountsImported&&(this.settings.setupCompleted=!0,await this.saveSettings(),console.log("[Eudia] Auto-detected completed setup \u2014 skipping onboarding")),this.settings.setupCompleted){if(this.settings.syncOnStartup){if(await this.scanLocalAccountFolders(),this.settings.userEmail&&this.settings.syncAccountsOnStartup){let n=new Date().toISOString().split("T")[0];this.settings.lastAccountRefreshDate!==n&&setTimeout(async()=>{try{console.log("[Eudia] Startup account sync - checking for changes...");let r=await this.syncAccountFolders();if(r.success){if(this.settings.lastAccountRefreshDate=n,await this.saveSettings(),r.added>0||r.archived>0){let s=[];r.added>0&&s.push(`${r.added} added`),r.archived>0&&s.push(`${r.archived} archived`),new p.Notice(`Account folders synced: ${s.join(", ")}`)}}else console.log("[Eudia] Sync failed:",r.error)}catch{console.log("[Eudia] Startup sync skipped (server unreachable), will retry tomorrow")}},2e3)}this.settings.showCalendarView&&this.settings.userEmail&&await this.activateCalendarView(),this.settings.userEmail&&this.settings.cachedAccounts.length>0&&setTimeout(async()=>{try{await this.checkAndAutoEnrich()}catch{console.log("[Eudia] Auto-enrich skipped (server unreachable)")}},5e3),this.settings.userEmail&&this.telemetry?setTimeout(async()=>{try{let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),a=0;n&&n instanceof p.TFolder&&(a=n.children.filter(c=>c instanceof p.TFolder&&!c.name.startsWith("_")).length);let r={salesforce:this.settings.salesforceConnected?"connected":"not_configured",calendar:this.settings.calendarConfigured?"connected":"not_configured"},s=await this.telemetry.sendHeartbeat(a,r);if(s?.latestVersion){let c=s.latestVersion.split(".").map(Number),l=(this.manifest?.version||"0.0.0").split(".").map(Number),d=!1;for(let u=0;u<3;u++){if((c[u]||0)>(l[u]||0)){d=!0;break}if((c[u]||0)<(l[u]||0))break}if(d){console.log(`[Eudia Update] Heartbeat detected update: v${this.manifest?.version} \u2192 v${s.latestVersion}`);let u=this.settings.serverUrl||"https://gtm-wizard.onrender.com";await this.performAutoUpdate(u,s.latestVersion,this.manifest?.version||"0.0.0")}}let o=await this.telemetry.checkForPushedConfig();if(o.length>0){let c=!1;for(let l of o)l.key&&this.settings.hasOwnProperty(l.key)&&(this.settings[l.key]=l.value,c=!0,console.log(`[Eudia] Applied pushed config: ${l.key} = ${l.value}`));c&&(await this.saveSettings(),new p.Notice("Settings updated by admin"))}await this.checkAndConsumeSyncFlags(),this.startSalesforceSyncScanner()}catch{console.log("[Eudia] Heartbeat/config check skipped"),this.startSalesforceSyncScanner()}},3e3):this.settings.sfAutoSyncEnabled&&this.settings.salesforceConnected&&setTimeout(()=>this.startSalesforceSyncScanner(),5e3)}}else{await new Promise(a=>setTimeout(a,100));let n=document.querySelector(".modal-container .modal");if(n){let a=n.querySelector(".modal-close-button");a&&a.click()}await this.activateSetupView()}this.app.workspace.on("file-open",async n=>{if(n&&(n.path.includes("_Analytics/")||n.path.includes("_Customer Health/")))try{let a=await this.app.vault.read(n);if(a.includes("type: analytics_dashboard")){let s=a.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/)?.[1],o=new Date().toISOString().split("T")[0];s!==o&&(console.log(`[Eudia] Auto-refreshing analytics: ${n.name}`),await this.refreshAnalyticsDashboard(n))}}catch{}})})}async onunload(){this.app.workspace.detachLeavesOfType(G),this.app.workspace.detachLeavesOfType(L)}static{this.MAX_UPDATE_RETRIES=3}static{this.UPDATE_RETRY_DELAYS=[15e3,45e3,9e4]}static{this.UPDATE_COOLDOWN_MS=3e5}_showUpdateStatus(t){this._updateStatusEl||(this._updateStatusEl=this.addStatusBarItem(),this._updateStatusEl.addClass("eudia-update-status")),this._updateStatusEl.setText(t),this._updateStatusEl.style.display=""}_hideUpdateStatus(){this._updateStatusEl&&(this._updateStatusEl.style.display="none")}async checkForPluginUpdate(){if(this._updateInProgress){console.log("[Eudia Update] Skipping \u2014 update already in progress");return}let t=this.settings.lastUpdateTimestamp?Date.now()-new Date(this.settings.lastUpdateTimestamp).getTime():1/0;if(t<S.UPDATE_COOLDOWN_MS){console.log(`[Eudia Update] Skipping \u2014 updated ${Math.round(t/1e3)}s ago (cooldown: ${S.UPDATE_COOLDOWN_MS/1e3}s)`);return}let e=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=this.manifest?.version||"0.0.0";for(let a=0;a<=S.MAX_UPDATE_RETRIES;a++)try{if(a>0){let d=S.UPDATE_RETRY_DELAYS[a-1]||9e4;console.log(`[Eudia Update] Retry ${a}/${S.MAX_UPDATE_RETRIES} in ${d/1e3}s...`),await new Promise(u=>setTimeout(u,d))}let r=await(0,p.requestUrl)({url:`${e}/api/plugin/version`,method:"GET",headers:{"Content-Type":"application/json"}});if(!r.json?.success||!r.json?.currentVersion){console.log("[Eudia Update] Version endpoint returned unexpected data:",r.json);continue}let s=r.json.currentVersion,o=s.split(".").map(Number),c=n.split(".").map(Number),l=!1;for(let d=0;d<3;d++){if((o[d]||0)>(c[d]||0)){l=!0;break}if((o[d]||0)<(c[d]||0))break}!l&&r.json.forceUpdate&&s!==n&&(l=!0,console.log(`[Eudia Update] Server flagged forceUpdate for v${s}`)),l?(console.log(`[Eudia Update] v${s} available (current: v${n})`),await this.performAutoUpdate(e,s,n)):console.log(`[Eudia Update] Up to date (v${n})`);return}catch(r){console.log(`[Eudia Update] Check failed (attempt ${a+1}):`,r.message||r)}console.log("[Eudia Update] All retry attempts exhausted \u2014 will try again on next cycle")}async sha256(t){let n=new TextEncoder().encode(t),a=await crypto.subtle.digest("SHA-256",n);return Array.from(new Uint8Array(a)).map(s=>s.toString(16).padStart(2,"0")).join("")}async checkForUpdateRollback(){if(!this.settings.lastUpdateTimestamp||!this.settings.lastUpdateVersion)return;let t=Date.now()-new Date(this.settings.lastUpdateTimestamp).getTime(),e=this.manifest?.version||"0.0.0";if(e===this.settings.lastUpdateVersion){this.settings.lastUpdateTimestamp=null,this.settings.pendingUpdateVersion=null,await this.saveSettings(),this.telemetry.reportUpdateCheck({localVersion:e,remoteVersion:this.settings.lastUpdateVersion,updateNeeded:!1,updateResult:"success"}),console.log(`[Eudia Update] Update to v${e} confirmed successful`);return}if(t<12e4){let n=this.manifest.dir;if(!n)return;let a=this.app.vault.adapter;try{if(await a.exists(`${n}/main.js.bak`)){let s=await a.read(`${n}/main.js.bak`);await a.write(`${n}/main.js`,s),console.log(`[Eudia Update] Rolled back to previous version (v${this.settings.lastUpdateVersion} may have failed)`),this.telemetry.reportUpdateCheck({localVersion:e,remoteVersion:this.settings.lastUpdateVersion||"unknown",updateNeeded:!1,updateResult:"failed"})}}catch(r){console.warn("[Eudia Update] Rollback check failed:",r.message)}this.settings.lastUpdateTimestamp=null,this.settings.lastUpdateVersion=null,this.settings.pendingUpdateVersion=null,await this.saveSettings()}}async performAutoUpdate(t,e,n){if(this._updateInProgress){console.log("[Eudia Update] Skipping \u2014 update already in progress");return}this._updateInProgress=!0;try{if(this.audioRecorder?.isRecording()){this.settings.pendingUpdateVersion=e,await this.saveSettings(),new p.Notice(`Eudia v${e} available \u2014 will update after your recording.`,8e3);try{this.telemetry?.reportUpdateCheck({localVersion:n,remoteVersion:e,updateNeeded:!0,updateResult:"deferred"})}catch{}return}let a=this.manifest.dir;if(!a){console.log("[Eudia Update] Cannot determine plugin directory");return}this._showUpdateStatus(`\u27F3 Updating to v${e}\u2026`);let r=this.app.vault.adapter;console.log(`[Eudia Update] Downloading v${e}...`);let[s,o,c]=await Promise.all([(0,p.requestUrl)({url:`${t}/api/plugin/main.js`}),(0,p.requestUrl)({url:`${t}/api/plugin/manifest.json`}),(0,p.requestUrl)({url:`${t}/api/plugin/styles.css`})]),l=s.text,d=o.text,u=c.text;this._showUpdateStatus(`\u27F3 Validating v${e}\u2026`);let y=[["main.js",l,1e4,5*1024*1024],["manifest.json",d,50,1e4],["styles.css",u,100,5e5]];for(let[m,g,O,b]of y)if(!g||g.length<O||g.length>b){console.log(`[Eudia Update] ${m} validation failed (${g?.length??0} bytes, need ${O}-${b})`),this._showUpdateStatus("Update failed \u2014 file validation error"),setTimeout(()=>this._hideUpdateStatus(),5e3);try{this.telemetry?.reportUpdateCheck({localVersion:n,remoteVersion:e,updateNeeded:!0,updateResult:"failed"})}catch{}return}try{let m=JSON.parse(d);if(m.version!==e){console.log(`[Eudia Update] Version mismatch: expected ${e}, got ${m.version}`),this._hideUpdateStatus();return}}catch{console.log("[Eudia Update] Downloaded manifest is not valid JSON"),this._hideUpdateStatus();return}this._showUpdateStatus(`\u27F3 Installing v${e}\u2026`);try{let m=await r.read(`${a}/main.js`);await r.write(`${a}/main.js.bak`,m)}catch{}try{let m=await r.read(`${a}/styles.css`);await r.write(`${a}/styles.css.bak`,m)}catch{}await r.write(`${a}/main.js`,l),await r.write(`${a}/manifest.json`,d),await r.write(`${a}/styles.css`,u),console.log(`[Eudia Update] Files written: v${n} \u2192 v${e}`),this.settings.lastUpdateVersion=e,this.settings.lastUpdateTimestamp=new Date().toISOString(),this.settings.pendingUpdateVersion=null,await this.saveSettings();try{this.telemetry?.reportUpdateCheck({localVersion:n,remoteVersion:e,updateNeeded:!0,updateResult:"success"})}catch{}if(this.audioRecorder?.isRecording())this._showUpdateStatus(`\u2713 v${e} downloaded \u2014 restart to apply`),setTimeout(()=>this._hideUpdateStatus(),1e4);else{this._showUpdateStatus(`\u2713 v${e} installed \u2014 restarting\u2026`),setTimeout(async()=>{try{let m=this.app.plugins;await m.disablePlugin(this.manifest.id),await m.enablePlugin(this.manifest.id),console.log(`[Eudia Update] Hot-reloaded: v${n} \u2192 v${e}`)}catch{this._updateInProgress=!1,this._showUpdateStatus(`\u2713 v${e} ready \u2014 restart Obsidian`),setTimeout(()=>this._hideUpdateStatus(),15e3)}},2e3);return}}catch(a){console.log("[Eudia Update] Update failed:",a.message||a),this._showUpdateStatus("Update failed"),setTimeout(()=>this._hideUpdateStatus(),5e3);try{this.telemetry?.reportUpdateCheck({localVersion:n,remoteVersion:e,updateNeeded:!0,updateResult:"failed"})}catch{}}finally{this._updateInProgress=!1}}resolveRecordingForNote(t,e,n){let a=e.match(/recording_path:\s*"?([^"\n]+)"?/);if(a){let l=this.app.vault.getAbstractFileByPath(a[1].trim());if(l&&l instanceof p.TFile)return l}let r=e.match(/saved to \*\*([^*]+)\*\*/);if(r){let l=this.app.vault.getAbstractFileByPath(r[1]);if(l&&l instanceof p.TFile)return l}let s=t.stat?.mtime||0,o=null,c=1/0;for(let l of n){if(!l.timestamp)continue;let d=Math.abs(s-l.timestamp.getTime());d<30*60*1e3&&d<c&&(c=d,o=l.file)}return o}async healSingleNote(t,e,n){let a=await this.app.vault.readBinary(n),r=n.extension==="mp4"||n.extension==="m4a"?"audio/mp4":"audio/webm",s=new Blob([a],{type:r}),o={},c=t.path.split("/"),l=this.settings.accountsFolder||"Accounts";c[0]===l&&c.length>=2&&(o.accountName=c[1]);let d=c[0]==="Pipeline Meetings"||/meeting_type:\s*pipeline_review/.test(e),u=await this.transcriptionService.transcribeAudio(s,{...o,captureMode:"full_call",meetingTemplate:this.settings.meetingTemplate||"meddic",meetingType:d?"pipeline_review":void 0}),y=v=>v?!!(v.summary?.trim()||v.nextSteps?.trim()):!1,m=u.sections;if(!y(m)&&u.text?.trim()&&(m=await this.transcriptionService.processTranscription(u.text,o)),!y(m)&&!u.text?.trim())return!1;let g=e.replace(/\n\n---\n\*\*Processing your recording\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,"").replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,"").replace(/\n\n\*\*Transcription failed:\*\*[^\n]*(\nYour recording was saved to[^\n]*)?\n/g,"").trim(),O;d?O=this.buildPipelineNoteContent(m,u,t.path):O=this.buildNoteContent(m,u);let b=g.indexOf("---",g.indexOf("---")+3);if(b>0){let v=g.substring(0,b+3);await this.app.vault.modify(t,v+`

`+O)}else await this.app.vault.modify(t,O);return!0}collectRecordingFiles(){let t=r=>r.children.filter(s=>s instanceof p.TFile&&/\.(webm|mp4|m4a|ogg)$/i.test(s.name)).map(s=>{let o=s.name.match(/recording-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/),c=o?new Date(`${o[1]}-${o[2]}-${o[3]}T${o[4]}:${o[5]}:${o[6]}Z`):null;return{file:s,timestamp:c}}).filter(s=>s.timestamp!==null),e=[],n=this.app.vault.getAbstractFileByPath(this.settings.recordingsFolder||"Recordings");n&&n instanceof p.TFolder&&e.push(...t(n));let a=this.app.vault.getAbstractFileByPath("_backups");return a&&a instanceof p.TFolder&&e.push(...t(a)),e.sort((r,s)=>s.timestamp.getTime()-r.timestamp.getTime()),e}async healFailedTranscriptions(){if(!this.audioRecorder?.isRecording())try{await this.processHealQueue();let t=this.app.vault.getMarkdownFiles(),e=[];for(let r of t)try{let s=await this.app.vault.read(r);s.includes("**Transcription failed:**")&&e.push({file:r,content:s})}catch{}if(e.length===0)return;console.log(`[Eudia AutoHeal] Found ${e.length} note(s) with failed transcriptions`);let n=this.collectRecordingFiles();if(n.length===0){console.log("[Eudia AutoHeal] No recordings found in Recordings or _backups");return}let a=0;for(let{file:r,content:s}of e)try{if(!s.includes("**Transcription failed:**")&&(s.includes("## Summary")||s.includes(`## Next Steps
-`)))continue;let c=this.resolveRecordingForNote(r,s,n);if(!c){console.log(`[Eudia AutoHeal] No matching recording for "${r.path}"`);continue}if(console.log(`[Eudia AutoHeal] Healing "${r.path}" with recording "${c.path}"`),!await this.healSingleNote(r,s,c)){console.log(`[Eudia AutoHeal] Re-transcription returned no content for "${r.path}" \u2014 adding to heal queue`),this.addToHealQueue(r.path,c.path,"Re-transcription returned no content");continue}this.removeFromHealQueue(r.path),a++,console.log(`[Eudia AutoHeal] Successfully healed "${r.path}"`)}catch(o){let c=o.message;console.error(`[Eudia AutoHeal] Failed to heal "${r.path}":`,c);let l=this.resolveRecordingForNote(r,s,n);l&&this.addToHealQueue(r.path,l.path,c)}this.telemetry.reportAutoHealScan({totalNotes:t.length,failedNotes:e.length,recordings:n.length,healed:a,failed:e.length-a,queueSize:this.settings.healQueue.length}),a>0&&(console.log(`[Eudia AutoHeal] Healed ${a}/${e.length} failed transcription(s)`),new p.Notice(`Recovered ${a} previously failed transcription${a>1?"s":""}.`,8e3))}catch(t){console.error("[Eudia AutoHeal] Error:",t.message)}}static{this.HEAL_BACKOFF_MS=[6e4,3e5,18e5,72e5,288e5]}addToHealQueue(t,e,n){let a=this.settings.healQueue.find(r=>r.notePath===t);a?(a.attemptCount++,a.lastAttempt=new Date().toISOString(),a.error=n):this.settings.healQueue.push({notePath:t,recordingPath:e,attemptCount:1,lastAttempt:new Date().toISOString(),error:n}),this.saveSettings()}removeFromHealQueue(t){this.settings.healQueue=this.settings.healQueue.filter(e=>e.notePath!==t),this.saveSettings()}async processHealQueue(){if(this.settings.healQueue.length===0)return;let t=Date.now(),e=0;for(let n of[...this.settings.healQueue]){let a=Math.min(n.attemptCount-1,S.HEAL_BACKOFF_MS.length-1),r=S.HEAL_BACKOFF_MS[a],s=new Date(n.lastAttempt).getTime();if(t-s<r)continue;let o=this.app.vault.getAbstractFileByPath(n.notePath),c=this.app.vault.getAbstractFileByPath(n.recordingPath);if(!o||!(o instanceof p.TFile)){this.removeFromHealQueue(n.notePath);continue}if(!c||!(c instanceof p.TFile)){console.log(`[Eudia AutoHeal Queue] Recording "${n.recordingPath}" no longer exists \u2014 removing from queue`),this.removeFromHealQueue(n.notePath);continue}console.log(`[Eudia AutoHeal Queue] Retry #${n.attemptCount+1} for "${n.notePath}"`);try{let l=await this.app.vault.read(o);await this.healSingleNote(o,l,c)?(this.removeFromHealQueue(n.notePath),e++,console.log(`[Eudia AutoHeal Queue] Successfully healed "${n.notePath}" on retry #${n.attemptCount+1}`)):this.addToHealQueue(n.notePath,n.recordingPath,"Re-transcription returned no content")}catch(l){this.addToHealQueue(n.notePath,n.recordingPath,l.message),console.error(`[Eudia AutoHeal Queue] Retry failed for "${n.notePath}":`,l.message)}}e>0&&new p.Notice(`Recovered ${e} previously failed transcription${e>1?"s":""} from retry queue.`,8e3)}async retryTranscriptionForCurrentNote(){let t=this.app.workspace.getActiveFile();if(!t){new p.Notice("No active note. Open the note you want to retry.");return}let e=await this.app.vault.read(t),n=this.collectRecordingFiles(),a=this.resolveRecordingForNote(t,e,n);if(!a){new p.Notice("No matching recording found for this note. Check Recordings or _backups folder.");return}new p.Notice(`Retrying transcription using ${a.name}...`,5e3);try{await this.healSingleNote(t,e,a)?(this.removeFromHealQueue(t.path),new p.Notice("Transcription recovered successfully.",8e3)):new p.Notice("Retry produced no content. The recording may be silent or corrupted.",1e4)}catch(r){let s=r.message;new p.Notice(`Retry failed: ${s}`,1e4),this.addToHealQueue(t.path,a.path,s)}}async loadSettings(){this.settings=Object.assign({},ze,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}async activateCalendarView(){let t=this.app.workspace,e=t.getLeavesOfType(G);if(e.length>0)t.revealLeaf(e[0]);else{let n=t.getRightLeaf(!1);n&&(await n.setViewState({type:G,active:!0}),t.revealLeaf(n))}}async openLiveQuerySidebar(){try{let t=this.app.workspace,e=t.getLeavesOfType(L);if(e.length>0){t.revealLeaf(e[0]);return}let n=t.getRightLeaf(!1);n&&(await n.setViewState({type:L,active:!0}),t.revealLeaf(n))}catch(t){console.log("[Eudia] Could not open live query sidebar:",t)}}closeLiveQuerySidebar(){try{this.app.workspace.detachLeavesOfType(L)}catch{}}async activateSetupView(){let t=this.app.workspace,e=t.getLeavesOfType(_);if(e.length>0)t.revealLeaf(e[0]);else{let n=t.getLeaf(!0);n&&(await n.setViewState({type:_,active:!0}),t.revealLeaf(n))}}async createTailoredAccountFolders(t,e){let n=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);let r=0,s=new Date().toISOString().split("T")[0],o=async l=>{let d=l.name.replace(/[<>:"/\\|?*]/g,"_").trim(),u=`${n}/${d}`;if(this.app.vault.getAbstractFileByPath(u)instanceof p.TFolder)return console.log(`[Eudia] Account folder already exists: ${d}`),!1;try{await this.app.vault.createFolder(u);let m=e?.[l.id],g=!!m,O=this.buildContactsContent(l,m,s),b=this.buildIntelligenceContent(l,m,s),v=this.buildMeetingNotesContent(l,m),C=this.buildNextStepsContent(l,m,s),f=[{name:"Note 1.md",content:`---
account: "${l.name}"
account_id: "${l.id}"
type: meeting_note
sync_to_salesforce: false
created: ${s}
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
created: ${s}
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
created: ${s}
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

`},{name:"Meeting Notes.md",content:v},{name:"Contacts.md",content:O},{name:"Intelligence.md",content:b},{name:"Next Steps.md",content:C}];for(let w of f){let x=`${u}/${w.name}`;await this.app.vault.create(x,w.content)}return console.log(`[Eudia] Created account folder with subnotes${g?" (enriched)":""}: ${d}`),!0}catch(m){return console.error(`[Eudia] Failed to create folder for ${d}:`,m),!1}},c=5;for(let l=0;l<t.length;l+=c){let d=t.slice(l,l+c),u=await Promise.allSettled(d.map(y=>o(y)));r+=u.filter(y=>y.status==="fulfilled"&&y.value===!0).length}r>0?(this.settings.cachedAccounts=t.map(l=>({id:l.id,name:l.name})),await this.saveSettings(),new p.Notice(`Created ${r} account folders`)):console.warn(`[Eudia] createTailoredAccountFolders: 0 folders created out of ${t.length} accounts \u2014 not updating cachedAccounts`),await this.ensureNextStepsFolderExists()}buildContactsContent(t,e,n){let a=e?`
enriched_at: "${new Date().toISOString()}"`:"",r=`---
account: "${t.name}"
account_id: "${t.id}"
type: contacts
sync_to_salesforce: false${a}
---`;return e?.contacts?`${r}

# ${t.name} - Key Contacts

${e.contacts}

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`:`${r}

# ${t.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
| *No contacts on record yet* | | | | |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`}buildIntelligenceContent(t,e,n){let a=e?`
enriched_at: "${new Date().toISOString()}"`:"",r=`---
account: "${t.name}"
account_id: "${t.id}"
type: intelligence
sync_to_salesforce: false${a}
---`;return e?.intelligence?`${r}

# ${t.name} - Account Intelligence

${e.intelligence}

## News & Signals

*Recent news, earnings mentions, leadership changes.*
`:`${r}

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
enriched_at: "${new Date().toISOString()}"`:"",a=`---
account: "${t.name}"
account_id: "${t.id}"
type: meetings_index
sync_to_salesforce: false${n}
---`,r=[];return e?.opportunities&&r.push(e.opportunities),e?.recentActivity&&r.push(e.recentActivity),r.length>0?`${a}

# ${t.name} - Meeting Notes

${r.join(`

`)}

## Quick Start

1. Open **Note 1** for your next meeting
2. Click the **microphone** to record and transcribe
3. **Next Steps** are auto-extracted after transcription
4. Set \`sync_to_salesforce: true\` to sync to Salesforce
`:`${a}

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
`}buildNextStepsContent(t,e,n){let a=n||new Date().toISOString().split("T")[0],r=e?`
enriched_at: "${new Date().toISOString()}"`:"",s=`---
account: "${t.name}"
account_id: "${t.id}"
type: next_steps
auto_updated: true
last_updated: ${a}
sync_to_salesforce: false${r}
---`;return e?.nextSteps?`${s}

# ${t.name} - Next Steps

${e.nextSteps}

---

## History

*Previous next steps will be archived here.*
`:`${s}

# ${t.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}async fetchEnrichmentData(t){let e=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=t.filter(s=>s.id&&s.id.startsWith("001"));if(n.length===0)return{};let a={},r=20;console.log(`[Eudia Enrich] Fetching enrichment data for ${n.length} accounts`);for(let s=0;s<n.length;s+=r){let c=n.slice(s,s+r).map(l=>l.id);try{let l=await(0,p.requestUrl)({url:`${e}/api/accounts/enrich-batch`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountIds:c,userEmail:this.settings.userEmail})});l.json?.success&&l.json?.enrichments&&Object.assign(a,l.json.enrichments)}catch(l){console.error(`[Eudia Enrich] Batch fetch failed (batch ${s/r+1}):`,l)}s+r<n.length&&await new Promise(l=>setTimeout(l,100))}return console.log(`[Eudia Enrich] Got enrichment data for ${Object.keys(a).length}/${n.length} accounts`),a}async createProspectAccountFiles(t){if(!t||t.length===0)return 0;let e=this.settings.accountsFolder||"Accounts",n=`${e}/_Prospects`;if(!this.app.vault.getAbstractFileByPath(n))try{await this.app.vault.createFolder(n)}catch{}let r=0;for(let s of t){let o=s.name.replace(/[<>:"/\\|?*]/g,"_").trim(),c=`${n}/${o}`;if(this.app.vault.getAbstractFileByPath(c)instanceof p.TFolder)continue;let d=`${e}/${o}`;if(this.app.vault.getAbstractFileByPath(d)instanceof p.TFolder)continue;let y=`${n}/${o}.md`,m=this.app.vault.getAbstractFileByPath(y);if(m instanceof p.TFile)try{await this.app.vault.delete(m)}catch{}try{await this.app.vault.createFolder(c);let g=new Date().toISOString().split("T")[0],O=[{name:"Note 1.md",content:`---
account: "${s.name}"
account_id: "${s.id}"
type: meeting_note
tier: prospect
sync_to_salesforce: false
created: ${g}
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
tier: prospect
sync_to_salesforce: false
created: ${g}
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
tier: prospect
sync_to_salesforce: false
created: ${g}
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
tier: prospect
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
tier: prospect
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
tier: prospect
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
tier: prospect
auto_updated: true
last_updated: ${g}
sync_to_salesforce: false
---

# ${s.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}];for(let b of O){let v=`${c}/${b.name}`;await this.app.vault.create(v,b.content)}r++}catch(g){console.log(`[Eudia] Failed to create prospect folder for ${s.name}:`,g)}}return r>0&&console.log(`[Eudia] Created ${r} prospect account folders in _Prospects/`),r}async createCSManagerDashboard(t,e){let n="CS Manager",a=new Date().toISOString().split("T")[0],r=ye(t);if(!this.app.vault.getAbstractFileByPath(n))try{await this.app.vault.createFolder(n)}catch{}let s={};for(let u of e){let y=u.ownerName||"Unassigned";s[y]||(s[y]=[]),s[y].push(u)}let o=`---
role: cs_manager
manager: "${t}"
direct_reports: ${r.length}
total_accounts: ${e.length}
created: ${a}
auto_refresh: true
---

# CS Manager Overview

**Manager:** ${t}
**Direct Reports:** ${r.join(", ")||"None configured"}
**Total CS Accounts:** ${e.length}
**Last Refreshed:** ${a}

---

## Account Distribution by Sales Rep

`,c=Object.keys(s).sort();for(let u of c){let y=s[u];o+=`### ${u} (${y.length} accounts)
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
`;let l=`${n}/CS Manager Overview.md`,d=this.app.vault.getAbstractFileByPath(l);d instanceof p.TFile?await this.app.vault.modify(d,o):await this.app.vault.create(l,o);for(let u of r){let y=u.split("@")[0].replace("."," ").replace(/\b\w/g,h=>h.toUpperCase()),m=u.split("@")[0].replace("."," ").toLowerCase(),g=m.split(" ")[0],O=m.split(" ").pop()||"",b=e.filter(h=>{let w=(h.csmName||"").toLowerCase();if(w&&(w.includes(g)||w.includes(O)))return!0;let x=(h.ownerName||"").toLowerCase();return x.includes(g)||x.includes(O)}),v=`---
rep: "${u}"
rep_name: "${y}"
role: cs_rep_summary
account_count: ${b.length}
created: ${a}
---

# ${y} \u2014 CS Account Summary

**Email:** ${u}
**CS Accounts:** ${b.length}

---

## Assigned Accounts

`;if(b.length>0){v+=`| Account | Type | Owner | Folder |
|---------|------|-------|--------|
`;for(let h of b){let w=h.name.replace(/[<>:"/\\|?*]/g,"_").trim();v+=`| ${h.name} | ${h.type||""} | ${h.ownerName||""} | [[Accounts/${w}/Contacts\\|View]] |
`}}else v+=`*No accounts currently matched to this rep. Accounts will populate after connecting to Salesforce (Step 2).*
`;v+=`
---

## Recent Activity

Meeting notes and activity for ${y}'s accounts sync through Salesforce:
- Notes appear in each account's **Meeting Notes** and **Intelligence** sub-notes
- Activity updates when the vault enriches (on open or Salesforce connect)
- Ensure ${y} is syncing their meeting notes to Salesforce for latest data

---

*Updates automatically as new CS-relevant accounts sync.*
`;let C=`${n}/${y}.md`,f=this.app.vault.getAbstractFileByPath(C);f instanceof p.TFile?await this.app.vault.modify(f,v):await this.app.vault.create(C,v)}console.log(`[Eudia] Created CS Manager dashboard for ${t} with ${e.length} accounts across ${c.length} reps`)}async createAdminAccountFolders(t){let e=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e),await this.ensurePipelineFolderExists();let a=0,r=0,s=new Date().toISOString().split("T")[0],o=async l=>{let d=l.name.replace(/[<>:"/\\|?*]/g,"_").trim(),u=`${e}/${d}`;if(this.app.vault.getAbstractFileByPath(u)instanceof p.TFolder)return!1;try{return await this.app.vault.createFolder(u),await this.createExecAccountSubnotes(u,l,s),l.isOwned?a++:r++,console.log(`[Eudia Admin] Created ${l.isOwned?"owned":"view-only"} folder: ${d}`),!0}catch(m){return console.error(`[Eudia Admin] Failed to create folder for ${d}:`,m),!1}},c=5;for(let l=0;l<t.length;l+=c){let d=t.slice(l,l+c);await Promise.allSettled(d.map(u=>o(u)))}this.settings.cachedAccounts=t.map(l=>({id:l.id,name:l.name})),await this.saveSettings(),a+r>0&&new p.Notice(`Created ${a} owned + ${r} view-only account folders`),await this.ensureNextStepsFolderExists()}async createExecAccountSubnotes(t,e,n){let a=e.ownerName||"Unknown",r=[{name:"Note 1.md",content:`---
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
owner: "${a}"
sync_to_salesforce: false
---

# ${e.name} - Meeting Notes

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
`}];for(let s of r){let o=`${t}/${s.name}`;await this.app.vault.create(o,s.content)}}async createFullAccountSubnotes(t,e,n){let a=[{name:"Note 1.md",content:`---
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
`}];for(let r of a){let s=`${t}/${r.name}`;await this.app.vault.create(s,r.content)}}async ensurePipelineFolderExists(){let t="Pipeline",e=`${t}/Pipeline Review Notes.md`;if(this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t),!this.app.vault.getAbstractFileByPath(e)){let s=`---
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
`;await this.app.vault.create(e,s)}}async ensureNextStepsFolderExists(){let t="Next Steps",e=`${t}/All Next Steps.md`;if(this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t),!this.app.vault.getAbstractFileByPath(e)){let r=new Date().toISOString().split("T")[0],s=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${r}
---

# All Next Steps Dashboard

*Last updated: ${r} ${s}*

---

## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;await this.app.vault.create(e,o)}}async updateAccountNextSteps(t,e,n){try{console.log(`[Eudia] updateAccountNextSteps called for: ${t}`),console.log(`[Eudia] Content length: ${e?.length||0} chars`);let a=t.replace(/[<>:"/\\|?*]/g,"_").trim(),r=`${this.settings.accountsFolder}/${a}/Next Steps.md`;console.log(`[Eudia] Looking for Next Steps file at: ${r}`);let s=this.app.vault.getAbstractFileByPath(r);if(!s||!(s instanceof p.TFile)){console.log(`[Eudia] \u274C Next Steps file NOT FOUND at: ${r}`);let v=this.app.vault.getAbstractFileByPath(`${this.settings.accountsFolder}/${a}`);v&&v instanceof p.TFolder?console.log(`[Eudia] Files in ${a} folder:`,v.children.map(C=>C.name)):console.log(`[Eudia] Account folder also not found: ${this.settings.accountsFolder}/${a}`);return}console.log("[Eudia] Found Next Steps file, updating...");let o=new Date().toISOString().split("T")[0],c=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),l=n.split("/").pop()?.replace(".md","")||"Meeting",d=e;!e.includes("- [ ]")&&!e.includes("- [x]")&&(d=e.split(`
`).filter(v=>v.trim()).map(v=>{let C=v.replace(/^[-•*]\s*/,"").trim();return C?`- [ ] ${C}`:""}).filter(Boolean).join(`
`));let u=await this.app.vault.read(s),y="",m=u.match(/## History\n\n\*Previous next steps are archived below\.\*\n\n([\s\S]*?)$/);m&&m[1]&&(y=m[1].trim());let g=`### ${o} - ${l}
${d||"*None*"}`,O=y?`${g}

---

${y}`:g,b=`---
account: "${t}"
account_id: "${this.settings.cachedAccounts.find(v=>v.name===t)?.id||""}"
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

${O}
`;await this.app.vault.modify(s,b),console.log(`[Eudia] Updated Next Steps for ${t} (history preserved)`),await this.regenerateNextStepsDashboard()}catch(a){console.error(`[Eudia] Failed to update Next Steps for ${t}:`,a)}}async regenerateNextStepsDashboard(){try{let e=this.app.vault.getAbstractFileByPath("Next Steps/All Next Steps.md");if(!e||!(e instanceof p.TFile)){await this.ensureNextStepsFolderExists();return}let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!n||!(n instanceof p.TFolder))return;let a=[];for(let c of n.children)if(c instanceof p.TFolder){let l=`${c.path}/Next Steps.md`,d=this.app.vault.getAbstractFileByPath(l);if(d instanceof p.TFile){let u=await this.app.vault.read(d),y=u.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/),m=y?y[1]:"Unknown",g=u.split(`
`).filter(O=>O.match(/^- \[[ x]\]/)).slice(0,5);(g.length>0||m!=="Unknown")&&a.push({account:c.name,lastUpdated:m,nextSteps:g})}}a.sort((c,l)=>l.lastUpdated.localeCompare(c.lastUpdated));let r=new Date().toISOString().split("T")[0],s=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${r}
---

# All Next Steps Dashboard

*Last updated: ${r} ${s}*

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
`;for(let c of a){let l=c.nextSteps.filter(d=>d.includes("- [ ]")).length;o+=`| ${c.account} | ${c.lastUpdated} | ${l} |
`}}await this.app.vault.modify(e,o),console.log("[Eudia] Regenerated All Next Steps dashboard")}catch(t){console.error("[Eudia] Failed to regenerate Next Steps dashboard:",t)}}async startRecording(){if(!T.isSupported()){new p.Notice("Audio transcription is not supported in this environment.");return}let t=await this.showTemplatePicker();if(!t)return;this.settings.meetingTemplate=t;try{(await navigator.mediaDevices.getUserMedia({audio:!0})).getTracks().forEach(r=>r.stop())}catch(a){this.showPermissionGuide(a);return}let e=this.settings.audioCaptureMode||"full_call";try{let r=(await T.getAvailableDevices()).find(s=>T.isHeadphoneDevice(s.label));r&&e==="full_call"&&(e="mic_only",console.log(`[Eudia] Headphones detected (${r.label}) \u2014 using mic_only for this recording`),new p.Notice(`${r.label} detected \u2014 recording your voice only.
For both sides of the call, switch to laptop speakers.`,8e3))}catch{}if(!this.settings.audioSystemDeviceId)try{let a=await T.detectVirtualAudioDevice();a&&(this.settings.audioSystemDeviceId=a.deviceId,await this.saveSettings(),console.log(`[Eudia] Virtual audio device found: ${a.label}`))}catch{}let n=this.app.workspace.getActiveFile();if(n||(await this.createMeetingNote(),n=this.app.workspace.getActiveFile()),!n){new p.Notice("Please open or create a note first");return}this.audioRecorder=new T,this.recordingStatusBar=new ae(()=>this.audioRecorder?.pause(),()=>this.audioRecorder?.resume(),()=>this.stopRecording(),()=>this.cancelRecording());try{this.audioRecorder.onEvent(c=>{switch(c.type){case"deviceChanged":c.activeDeviceLost?new p.Notice("Recording device disconnected. Recording continues on available mic.",8e3):new p.Notice("Audio device changed. Recording continues.",4e3),console.log("[Eudia Telemetry] device_change",c);break;case"headphoneDetected":(this.settings.audioCaptureMode||"full_call")==="full_call"&&new p.Notice(`Headphones detected (${c.deviceLabel}). Call audio cannot be captured through headphones \u2014 recording your voice only. For both sides, switch to laptop speakers.`,12e3),console.log("[Eudia Telemetry] headphone_detected",c.deviceLabel);break;case"silenceDetected":{let l=this.settings.audioCaptureMode||"full_call",d="Check that your microphone is working.";l==="full_call"&&(d="Ensure your call audio is playing through speakers, not headphones."),new p.Notice(`No audio detected for ${c.durationSeconds}s. ${d}`,1e4),console.log("[Eudia Telemetry] silence_detected",c.durationSeconds);break}case"audioRestored":new p.Notice("Audio signal restored.",3e3),console.log("[Eudia Telemetry] audio_restored");break}});let a=e,r={captureMode:a,micDeviceId:this.settings.audioMicDeviceId||void 0,systemAudioDeviceId:this.settings.audioSystemDeviceId||void 0};if(await this.audioRecorder.start(r),console.log("[Eudia Telemetry] recording_start",{captureMode:a,systemAudio:this.audioRecorder.getSystemAudioMethod()}),this.telemetry.reportRecordingStart({captureMode:a,systemAudioMethod:this.audioRecorder.getSystemAudioMethod(),hasMicPermission:!0}),a==="full_call"&&this.audioRecorder.getState().isRecording){let c=this.audioRecorder.getSystemAudioMethod();c==="electron"||c==="display_media"?new p.Notice("Recording \u2014 capturing both sides of the call.",5e3):c==="virtual_device"?new p.Notice("Recording (Full Call + Virtual Device) \u2014 both sides captured.",5e3):new p.Notice(`Recording (Mic only) \u2014 headphones block call audio capture.

Use laptop speakers, or try Settings > Audio Capture > Test System Audio.`,1e4)}else a==="mic_only"&&new p.Notice("Recording (Mic Only \u2014 your voice only)",3e3);this.recordingStatusBar.show(),this.micRibbonIcon?.addClass("eudia-ribbon-recording");try{let c=await this.calendarService.getCurrentMeeting();if(c.isNow&&c.meeting?.end){let l=new Date(c.meeting.end),d=new Date,u=l.getTime()-d.getTime();if(u>6e4&&u<54e5){let y=Math.round(u/6e4);new p.Notice(`Recording aligned to meeting \u2014 auto-stops in ${y} min`),setTimeout(async()=>{this.audioRecorder?.isRecording()&&(new p.Notice("Meeting ended \u2014 generating summary."),await this.stopRecording())},u)}}}catch(c){console.log("[Eudia] Could not detect meeting duration for auto-stop:",c)}let s=!1,o=setInterval(()=>{if(this.audioRecorder?.isRecording()){let c=this.audioRecorder.getState();if(this.recordingStatusBar?.updateState(c),c.duration>=2700&&!s){s=!0;let l=new class extends p.Modal{constructor(){super(...arguments);this.result=!0}onOpen(){let{contentEl:y}=this;y.createEl("h2",{text:"Still recording?"}),y.createEl("p",{text:"You have been recording for 45 minutes. Are you still in this meeting?"}),y.createEl("p",{text:"Recording will auto-stop at 90 minutes.",cls:"mod-warning"});let m=y.createDiv({cls:"modal-button-container"});m.createEl("button",{text:"Keep Recording",cls:"mod-cta"}).onclick=()=>{this.close()},m.createEl("button",{text:"Stop Recording"}).onclick=()=>{this.result=!1,this.close()}}onClose(){this.result||d.stopRecording()}}(this.app),d=this;l.open()}c.duration>=5400&&(new p.Notice("Recording stopped \u2014 maximum 90 minutes reached."),this.stopRecording(),clearInterval(o))}else clearInterval(o)},100);this.liveTranscript=""}catch(a){this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null;let r=a.message||"Failed to start recording";console.error("[Eudia Telemetry] recording_start_error",r),r.includes("Permission")||r.includes("NotAllowed")||r.includes("permission")?this.showPermissionGuide(a):new p.Notice(`Recording failed: ${r}`,1e4)}}showPermissionGuide(t){new class extends p.Modal{onOpen(){let{contentEl:n}=this;n.empty(),n.createEl("h2",{text:"Microphone Access Required"}),n.createEl("p",{text:"Obsidian needs microphone permission to transcribe meetings."});let a=n.createDiv();a.style.cssText="margin:16px 0;padding:12px;background:var(--background-secondary);border-radius:8px;",a.createEl("p",{text:"1. Open System Settings \u2192 Privacy & Security \u2192 Microphone"}),a.createEl("p",{text:"2. Find Obsidian in the list and toggle it ON"}),a.createEl("p",{text:"3. You may need to restart Obsidian after granting access"});let r=n.createDiv({cls:"modal-button-container"});r.style.cssText="display:flex;gap:8px;margin-top:16px;";let s=r.createEl("button",{text:"Open System Settings",cls:"mod-cta"});s.onclick=()=>{try{let o=window.require?.("electron");o?.shell?.openExternal?o.shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"):window.open("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")}catch{window.open("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")}},r.createEl("button",{text:"Close"}).onclick=()=>this.close()}}(this.app).open()}async stopRecording(){if(!this.audioRecorder?.isRecording())return;let t=this.app.workspace.getActiveFile();if(!t){new p.Notice("No active file to save transcription"),this.cancelRecording();return}this.recordingStatusBar?.showProcessing();try{let e=await this.audioRecorder.stop(),n={hasAudio:!0,averageLevel:0,silentPercent:0};try{let a=await T.analyzeAudioBlob(e.audioBlob);if(n=a,!a.hasAudio){let r;e.systemAudioMethod==="electron"||e.systemAudioMethod==="display_media"?r="System audio capture was active but no sound was detected. Check that the call app is playing audio.":e.captureMode==="full_call"?r="Make sure your call audio is playing through laptop speakers (not headphones).":r="Check that your microphone is working and has permission.",new p.Notice(`Recording appears silent. ${r} Open Settings > Audio Capture to test your setup.`,12e3)}}catch(a){console.warn("[Eudia] Pre-transcription audio check failed:",a)}this.telemetry.reportRecordingStop({durationSec:e.duration,blobSizeMB:Math.round(e.audioBlob.size/1024/1024*100)/100,avgAudioLevel:n.averageLevel,silentPercent:n.silentPercent,hasAudio:n.hasAudio,captureMode:e.captureMode,systemAudioMethod:e.systemAudioMethod}),await this.processRecording(e,t)}catch(e){new p.Notice(`Transcription failed: ${e.message}`)}finally{this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.closeLiveQuerySidebar(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null}}showTemplatePicker(){return new Promise(t=>{new class extends p.Modal{constructor(){super(...arguments);this.result=null}onOpen(){let{contentEl:a}=this;a.empty(),a.createEl("h3",{text:"Meeting Type"}),a.createEl("p",{text:"Select the template for this recording:",cls:"setting-item-description"});let r=a.createDiv();r.style.cssText="display:flex;flex-direction:column;gap:8px;margin-top:12px;";let s=[{key:"meddic",label:"Sales Discovery (MEDDIC)",desc:"Pain points, decision process, metrics, champions, budget signals"},{key:"demo",label:"Demo / Presentation",desc:"Feature reactions, questions, objections, interest signals"},{key:"cs",label:"Customer Success",desc:"Health signals, feature requests, adoption, renewal/expansion"},{key:"general",label:"General Check-In",desc:"Relationship updates, action items, sentiment"},{key:"internal",label:"Internal Call",desc:"Team sync, pipeline review, strategy discussion"}];for(let o of s){let c=r.createEl("button",{text:o.label});c.style.cssText="padding:10px 16px;text-align:left;cursor:pointer;border-radius:6px;border:1px solid var(--background-modifier-border);";let l=r.createEl("div",{text:o.desc});l.style.cssText="font-size:11px;color:var(--text-muted);margin-top:-4px;margin-bottom:4px;padding-left:4px;",c.onclick=()=>{this.result=o.key,this.close()}}}onClose(){t(this.result)}}(this.app).open()})}async cancelRecording(){this.audioRecorder?.isRecording()&&this.audioRecorder.cancel(),this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.closeLiveQuerySidebar(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null,new p.Notice("Transcription cancelled")}startLiveTranscription(){this.stopLiveTranscription();let t=12e4;this.liveTranscriptChunkInterval=setInterval(async()=>{await this.transcribeCurrentChunk()},t),setTimeout(async()=>{this.audioRecorder?.isRecording()&&await this.transcribeCurrentChunk()},3e4),console.log("[Eudia] Live transcription started")}stopLiveTranscription(){this.liveTranscriptChunkInterval&&(clearInterval(this.liveTranscriptChunkInterval),this.liveTranscriptChunkInterval=null),console.log("[Eudia] Live transcription stopped")}async transcribeCurrentChunk(){if(!this.audioRecorder?.isRecording()||this.isTranscribingChunk)return;let t=this.audioRecorder.extractNewChunks();if(!(!t||t.size<5e3)){this.isTranscribingChunk=!0,console.log(`[Eudia] Transcribing chunk: ${t.size} bytes`);try{let e=new FileReader,a=await new Promise((o,c)=>{e.onload=()=>{let d=e.result.split(",")[1];o(d)},e.onerror=c,e.readAsDataURL(t)}),r=this.audioRecorder.getMimeType(),s=await this.transcriptionService.transcribeChunk(a,r);s.success&&s.text&&(this.liveTranscript+=(this.liveTranscript?`

`:"")+s.text,console.log(`[Eudia] Chunk transcribed, total transcript length: ${this.liveTranscript.length}`))}catch(e){console.error("[Eudia] Chunk transcription error:",e)}finally{this.isTranscribingChunk=!1}}}openLiveQueryModal(){let t=new p.Modal(this.app);t.titleEl.setText("Query Live Transcript");let e=t.contentEl;e.addClass("eudia-live-query-modal"),e.createDiv({cls:"eudia-live-query-instructions"}).setText(`Ask a question about what has been discussed so far (${Math.round(this.liveTranscript.length/4)} words captured):`);let a=e.createEl("textarea",{cls:"eudia-live-query-input",attr:{placeholder:'e.g., "What did Tom say about pricing?" or "What were the main concerns raised?"',rows:"3"}}),r=e.createDiv({cls:"eudia-live-query-response"});r.style.display="none";let s=e.createEl("button",{text:"Ask",cls:"eudia-btn-primary"});s.addEventListener("click",async()=>{let o=a.value.trim();if(!o){new p.Notice("Please enter a question");return}s.disabled=!0,s.setText("Searching..."),r.style.display="block",r.setText("Searching transcript..."),r.addClass("eudia-loading");try{let c=await this.transcriptionService.liveQueryTranscript(o,this.liveTranscript,this.getAccountNameFromActiveFile());r.removeClass("eudia-loading"),c.success?r.setText(c.answer):(r.setText(c.error||"Failed to query transcript"),r.addClass("eudia-error"))}catch(c){r.removeClass("eudia-loading"),r.setText(`Error: ${c.message}`),r.addClass("eudia-error")}finally{s.disabled=!1,s.setText("Ask")}}),a.addEventListener("keydown",o=>{o.key==="Enter"&&!o.shiftKey&&(o.preventDefault(),s.click())}),t.open(),a.focus()}getAccountNameFromActiveFile(){let t=this.app.workspace.getActiveFile();if(!t)return;let e=t.path.match(/Accounts\/([^\/]+)\//i);if(e)return e[1]}async processRecording(t,e){let n=t.audioBlob?.size||0;if(console.log(`[Eudia] Audio blob size: ${n} bytes, duration: ${t.duration}s`),n<1e3){new p.Notice("Recording too short or no audio captured. Please try again.");return}try{let h=await T.analyzeAudioBlob(t.audioBlob);console.log(`[Eudia] Audio diagnostic: hasAudio=${h.hasAudio}, peak=${h.peakLevel}, silent=${h.silentPercent}%`),h.warning&&(console.warn(`[Eudia] Audio warning: ${h.warning}`),h.hasAudio?new p.Notice(`Warning: ${h.warning.split(":")[0]}`,5e3):new p.Notice("Warning: Audio appears to be silent. Transcription may not work correctly. Check your microphone settings.",8e3))}catch(h){console.warn("[Eudia] Audio diagnostic failed, continuing anyway:",h)}let a=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19),r=t.audioBlob.type?.includes("mp4")?"mp4":"webm",s=await t.audioBlob.arrayBuffer(),o=n/1024/1024,c=this.settings.recordingsFolder||"Recordings",l="_backups",d=`${c}/recording-${a}.${r}`,u=`${l}/recording-${a}.${r}`,y=!1,m=!1;for(let h of[c,l])if(!this.app.vault.getAbstractFileByPath(h))try{await this.app.vault.createFolder(h)}catch{}for(let h=0;h<3;h++)try{await this.app.vault.createBinary(d,s),y=!0,console.log(`[Eudia] Audio saved: ${d} (${o.toFixed(1)}MB)`);break}catch(w){console.warn(`[Eudia] Primary save attempt ${h+1}/3 failed: ${w.message}`),h<2&&await new Promise(x=>setTimeout(x,5e3))}try{await this.app.vault.createBinary(u,s),m=!0,console.log(`[Eudia] Backup audio saved: ${u}`)}catch(h){console.warn(`[Eudia] Backup save failed: ${h.message}`)}if(y||m){let h=y?d:u;t._savedAudioPath=h,new p.Notice(`Audio saved to ${h}`);try{let w=await this.app.vault.read(e),x=w.indexOf("---",w.indexOf("---")+3);if(x>0){let E=w.substring(0,x);if(!E.includes("recording_path:")){let k=E+`recording_path: "${h}"
`;await this.app.vault.modify(e,k+w.substring(x))}}}catch(w){console.warn("[Eudia] Failed to write recording_path to frontmatter:",w.message)}}else console.error("[Eudia] CRITICAL: All audio save attempts failed \u2014 recording may be lost"),new p.Notice("WARNING: Could not save recording to disk. Audio exists only in memory for this transcription attempt.",15e3),this.telemetry.reportSafetyNetFailure({blobSizeMB:Math.round(o*100)/100,error:"Both primary and backup save failed",retryAttempt:3});let g=t.duration||0,b=Math.max(1,Math.ceil(g/600))*30+30,v=b<60?`~${b} seconds`:`~${Math.ceil(b/60)} minute${Math.ceil(b/60)>1?"s":""}`;new p.Notice(`Processing ${Math.ceil(g/60)} min recording. Should take ${v}.`);let C=await this.app.vault.read(e),f=`

---
**Processing your recording...**
Started: ${new Date().toLocaleTimeString()}
Estimated: ${v}

*You can navigate away \u2014 the summary will appear here when ready.*
---
`;await this.app.vault.modify(e,C+f),this.processTranscriptionAsync(t,e).catch(h=>{console.error("Background transcription failed:",h),new p.Notice(`Transcription failed: ${h.message}`)})}async processTranscriptionAsync(t,e){try{let n={},a=e.path.split("/");console.log(`[Eudia] Processing transcription for: ${e.path}`),console.log(`[Eudia] Path parts: ${JSON.stringify(a)}, accountsFolder: ${this.settings.accountsFolder}`);let r=a[0]==="Pipeline Meetings",s=!1;try{let h=(await this.app.vault.read(e)).match(/^---\n([\s\S]*?)\n---/);h&&(s=/meeting_type:\s*pipeline_review/.test(h[1]))}catch{}if(!s&&r&&(s=!0),s){console.log("[Eudia Pipeline] Detected pipeline review meeting, using pipeline prompt");let f="";try{let h=await(0,p.requestUrl)({url:`${this.settings.serverUrl||"https://gtm-brain.onrender.com"}/api/pipeline-context`,method:"GET",headers:{"Content-Type":"application/json"}});h.json?.success&&h.json?.context&&(f=h.json.context,console.log(`[Eudia Pipeline] Loaded Salesforce pipeline context (${f.length} chars)`))}catch(h){console.warn("[Eudia Pipeline] Could not fetch pipeline context:",h)}n={meetingType:"pipeline_review",pipelineContext:f}}else if(a.length>=2&&a[0]===this.settings.accountsFolder){let f=a[1];console.log(`[Eudia] Detected account folder: ${f}`);let h=this.settings.cachedAccounts.find(w=>w.name.toLowerCase()===f.toLowerCase());h?(n={accountName:h.name,accountId:h.id,userEmail:this.settings.userEmail},console.log(`[Eudia] Found cached account: ${h.name} (${h.id})`)):(n={accountName:f,accountId:"",userEmail:this.settings.userEmail},console.log(`[Eudia] Account not in cache, using folder name: ${f}`))}else console.log("[Eudia] File not in Accounts folder, skipping account context");let o=[];try{let f=await this.calendarService.getCurrentMeeting();f.meeting?.attendees&&(o=f.meeting.attendees.map(h=>h.name||h.email.split("@")[0]).filter(Boolean).slice(0,10))}catch{}let c=Date.now(),l=await this.transcriptionService.transcribeAudio(t.audioBlob,{...n,speakerHints:o,captureMode:t.captureMode,hasVirtualDevice:t.hasVirtualDevice,meetingTemplate:this.settings.meetingTemplate||"meddic"}),d=Math.round(t.audioBlob.size/1024/1024*100)/100,u=d>15;this.telemetry.reportTranscriptionResult({success:!!l.text?.trim(),isChunked:u,totalSizeMB:d,transcriptLength:l.text?.length||0,processingTimeSec:Math.round((Date.now()-c)/1e3),error:l.error});let y=f=>f?!!(f.summary?.trim()||f.nextSteps?.trim()):!1,m=l.sections;if(y(m)||l.text?.trim()&&(m=await this.transcriptionService.processTranscription(l.text,n)),!y(m)&&!l.text?.trim()){let h=(await this.app.vault.read(e)).replace(/\n\n---\n\*\*Processing your recording\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,"").replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,""),w=l.error,E=!w||w.includes("audio")||w.includes("microphone")?"No audio detected. Check your microphone settings.":w,k=t._savedAudioPath,j=k?`
Your recording was saved to **${k}** \u2014 you can retry transcription from there.`:"";await this.app.vault.modify(e,h+`

**Transcription failed:** ${E}${j}
`),new p.Notice(`Transcription failed: ${E}`,1e4);return}let g=await this.app.vault.read(e),O="",b=Math.max(g.indexOf(`---
**Processing your recording`),g.indexOf(`---
**Transcription in progress`));if(b>0){let f=g.indexOf("---"),h=f>=0?g.indexOf("---",f+3):-1;h>0&&h+3<b&&(O=g.substring(h+3,b).trim())}else{let f=g.indexOf("---"),h=f>=0?g.indexOf("---",f+3):-1;if(h>0){let w=g.substring(h+3).trim();w.replace(/^#.*$/gm,"").replace(/Date:\s*\nAttendees:\s*/g,"").replace(/Add meeting notes here\.\.\./g,"").replace(/---/g,"").trim().length>10&&(O=w)}}try{let f="_backups";this.app.vault.getAbstractFileByPath(f)||await this.app.vault.createFolder(f);let h=new Date().toISOString().replace(/[:.]/g,"-").substring(0,19),w=`${f}/${e.name}_${h}.md`;await this.app.vault.create(w,g),console.log(`[Eudia] Backed up note to ${w}`)}catch(f){console.warn("[Eudia] Backup failed (non-critical):",f.message)}let v;if(s?v=this.buildPipelineNoteContent(m,l,e.path):v=this.buildNoteContent(m,l),O&&O.length>5){let f=v.indexOf("---",v.indexOf("---")+3);if(f>0){let h=v.substring(0,f+3),w=v.substring(f+3);v=h+`

## My Notes (captured during call)

`+O+`

---
`+w}}await this.app.vault.modify(e,v);let C=Math.floor(t.duration/60);if(new p.Notice(`Transcription complete (${C} min recording)`),!s){let f=m.nextSteps||m.actionItems;console.log(`[Eudia] Next Steps extraction - accountContext: ${n?.accountName||"undefined"}`),console.log(`[Eudia] Next Steps content found: ${f?"YES ("+f.length+" chars)":"NO"}`),console.log(`[Eudia] sections.nextSteps: ${m.nextSteps?"YES":"NO"}, sections.actionItems: ${m.actionItems?"YES":"NO"}`),f&&n?.accountName?(console.log(`[Eudia] Calling updateAccountNextSteps for ${n.accountName}`),await this.updateAccountNextSteps(n.accountName,f,e.path)):console.log("[Eudia] Skipping Next Steps update - missing content or account context")}this.settings.autoSyncAfterTranscription&&await this.syncNoteToSalesforce()}catch(n){try{let r=(await this.app.vault.read(e)).replace(/\n\n---\n\*\*Processing your recording\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,"").replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,""),s=t?._savedAudioPath,o=s?`
Your recording was saved to **${s}** \u2014 you can retry transcription from there.`:"";await this.app.vault.modify(e,r+`

**Transcription failed:** ${n.message}${o}
`)}catch{}throw n}}buildPipelineNoteContent(t,e,n){let a=new Date,r=String(a.getMonth()+1).padStart(2,"0"),s=String(a.getDate()).padStart(2,"0"),o=String(a.getFullYear()).slice(-2),c=a.toISOString().split("T")[0],l=`${r}.${s}.${o}`,d=g=>g==null?"":Array.isArray(g)?g.map(String).join(`
`):typeof g=="object"?JSON.stringify(g,null,2):String(g),u=d(t.summary),y=e.transcript||e.text||"",m=`---
title: "Team Pipeline Meeting - ${l}"
date: ${c}
meeting_type: pipeline_review
transcribed: true
---

# Weekly Pipeline Review | ${a.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"})}

`;if(u)m+=u;else{let g=[t.painPoints,t.productInterest,t.nextSteps,t.actionItems].filter(Boolean).map(d).join(`

`);g?m+=g:m+="*Pipeline summary could not be generated. See transcript below.*"}return y&&(m+=`

---

<details>
<summary><strong>Full Transcript</strong> (${Math.ceil(y.length/1e3)}k chars)</summary>

${y}

</details>
`),m}buildNoteContent(t,e){let n=w=>w==null?"":Array.isArray(w)?w.map(x=>typeof x=="object"?x.category?`**${x.category}**: ${x.signal||x.insight||""}`:JSON.stringify(x):String(x)).join(`
`):typeof w=="object"?JSON.stringify(w):String(w),a=n(t.title)||"Meeting Notes",r=n(t.summary),s=n(t.discussionContext),o=n(t.keyQuotes),c=n(t.painPoints),l=n(t.productInterest),d=n(t.meddiccSignals),u=n(t.nextSteps),y=n(t.actionItems),m=n(t.keyDates),g=n(t.dealSignals),O=n(t.risksObjections),b=n(t.attendees||t.keyStakeholders),v=n(t.emailDraft),C=`---
title: "${a}"
date: ${new Date().toISOString().split("T")[0]}
transcribed: true
sync_to_salesforce: false
clo_meeting: false
source: ""
confidence: ${e.confidence}
---

# ${a}

## Summary

${r||"*AI summary will appear here*"}

`;s&&!s.includes("Not discussed")&&(C+=`## Discussion Context

${s}

`),o&&!o.includes("No significant quotes")&&!o.includes("Not discussed")&&(C+=`## Key Quotes

${o}

`),c&&!c.includes("None explicitly")&&!c.includes("Not discussed")&&(C+=`## Pain Points

${c}

`),l&&!l.includes("None identified")&&!l.includes("No specific products")&&(C+=`## Product Interest

${l}

`),d&&(C+=`## MEDDICC Signals

${d}

`),u&&(C+=`## Next Steps

${u}

`),y&&(C+=`## Action Items

${y}

`),m&&!m.includes("No specific dates")&&!m.includes("Not discussed")&&(C+=`## Key Dates

${m}

`),g&&!g.includes("No significant deal signals")&&!g.includes("Not discussed")&&(C+=`## Deal Signals

${g}

`),O&&!O.includes("None raised")&&!O.includes("No objections")&&!O.includes("Not discussed")&&(C+=`## Risks and Objections

${O}

`),b&&(C+=`## Attendees

${b}

`),v&&(C+=`---

## Draft Follow-Up Email

${v}

> *Edit this draft to match your voice, then send.*

`);let f=e.text||e.transcript||"",h=e.diarizedTranscript||"";return this.settings.appendTranscript&&(h||f)&&(C+=`---

## ${h?"Full Transcript (Speaker-Labeled)":"Full Transcript"}

${h||f}
`),C}openIntelligenceQuery(){new K(this.app,this).open()}openIntelligenceQueryForCurrentNote(){let t=this.app.workspace.getActiveFile(),e;if(t){let n=this.app.metadataCache.getFileCache(t)?.frontmatter;if(n?.account_id&&n?.account)e={id:n.account_id,name:n.account};else if(n?.account){let a=this.settings.cachedAccounts.find(r=>r.name.toLowerCase()===n.account.toLowerCase());a?e={id:a.id,name:a.name}:e={id:"",name:n.account}}else{let a=t.path.split("/");if(a.length>=2&&a[0]===this.settings.accountsFolder){let r=a[1],s=this.settings.cachedAccounts.find(o=>o.name.replace(/[<>:"/\\|?*]/g,"_").trim()===r);s?e={id:s.id,name:s.name}:e={id:"",name:r}}}}new K(this.app,this,e).open()}async syncAccounts(t=!1){t||new p.Notice("Syncing Salesforce accounts...");try{let n=(await(0,p.requestUrl)({url:`${this.settings.serverUrl}/api/accounts/obsidian`,method:"GET",headers:{Accept:"application/json"}})).json;if(!n.success||!n.accounts){t||new p.Notice("Failed to fetch accounts from server");return}this.settings.cachedAccounts=n.accounts.map(a=>({id:a.id,name:a.name})),this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings(),t||new p.Notice(`Synced ${n.accounts.length} accounts for matching`)}catch(e){t||new p.Notice(`Failed to sync accounts: ${e.message}`)}}async scanLocalAccountFolders(){try{let t=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!t||!(t instanceof p.TFolder))return;let e=[];for(let n of t.children)n instanceof p.TFolder&&e.push({id:`local-${n.name.replace(/\s+/g,"-").toLowerCase()}`,name:n.name});this.settings.cachedAccounts=e,this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings()}catch(t){console.error("Failed to scan local account folders:",t)}}async refreshAccountFolders(){if(!this.settings.userEmail)throw new Error("Please configure your email first");let t=new H(this.settings.serverUrl);if((await t.getAccountsForUser(this.settings.userEmail)).length===0)return console.log("[Eudia] No accounts found for user"),0;let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),a=[];if(n&&n instanceof p.TFolder)for(let o of n.children)o instanceof p.TFolder&&a.push(o.name);let r=await t.getNewAccounts(this.settings.userEmail,a);if(r.length===0)return console.log("[Eudia] All account folders exist"),0;console.log(`[Eudia] Creating ${r.length} new account folders`);let s=await this.fetchEnrichmentData(r);return await this.createTailoredAccountFolders(r,s),r.length}async checkAndConsumeSyncFlags(){if(!this.settings.userEmail)return;let t=encodeURIComponent(this.settings.userEmail.toLowerCase().trim()),e=this.settings.serverUrl||"https://gtm-wizard.onrender.com";try{let r=((await(0,p.requestUrl)({url:`${e}/api/admin/users/${t}/sync-flags`,method:"GET"})).json?.flags||[]).filter(o=>!o.consumed_at);if(r.length===0)return;console.log(`[Eudia] Found ${r.length} pending sync flag(s)`);let s=!1;for(let o of r)if(o.flag==="resync_accounts"){s=!0;let c=o.payload||{},l=c.added?.length||0,d=c.removed?.length||0;console.log(`[Eudia] Sync flag: resync_accounts (+${l} / -${d})`)}else o.flag==="update_plugin"?new p.Notice("A plugin update is available. Please download the latest vault."):o.flag==="reset_setup"&&(console.log("[Eudia] Sync flag: reset_setup received"),this.settings.setupCompleted=!1,await this.saveSettings(),new p.Notice("Setup has been reset by admin. Please re-run the setup wizard."));if(s){console.log("[Eudia] Triggering account folder resync from sync flag..."),new p.Notice("Syncing account updates...");let o=await this.syncAccountFolders();o.success?new p.Notice(`Account sync complete: ${o.added} new, ${o.archived} archived`):console.log(`[Eudia] Account resync error: ${o.error}`)}try{await(0,p.requestUrl)({url:`${e}/api/admin/users/${t}/sync-flags/consume`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagIds:r.map(o=>o.id)})}),console.log(`[Eudia] Consumed ${r.length} sync flag(s)`)}catch{console.log("[Eudia] Failed to consume sync flags (will retry next startup)")}}catch{console.log("[Eudia] Sync flag check skipped (endpoint not available)")}}async syncAccountFolders(){if(!this.settings.userEmail)return{success:!1,added:0,archived:0,error:"No email configured"};let t=this.settings.userEmail.toLowerCase().trim();console.log(`[Eudia] Syncing account folders for: ${t}`);try{let e=await fetch(`${this.settings.serverUrl}/api/bl-accounts/${encodeURIComponent(t)}`);if(!e.ok){let A=await e.json().catch(()=>({}));throw new Error(A.error||`Server returned ${e.status}`)}let n=await e.json();if(!n.success||!n.accounts)throw new Error(n.error||"Invalid response from server");let a=n.meta?.userGroup||"bl",r=n.meta?.queryDescription||"accounts",s=n.meta?.region||null;console.log(`[Eudia] User group: ${a}, accounts: ${n.accounts.length} (${r})`),s&&console.log(`[Eudia] Sales Leader region: ${s}`);let o=n.accounts||[],c=n.prospectAccounts||[],l=o.length+c.length;console.log(`[Eudia] Server returned: ${o.length} active + ${c.length} prospects = ${l} total`);let d=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),u=new Map,y=`${this.settings.accountsFolder}/_Prospects`,m=this.app.vault.getAbstractFileByPath(y),g=new Map,O=new Map;if(d&&d instanceof p.TFolder)for(let A of d.children)A instanceof p.TFolder&&!A.name.startsWith("_")&&u.set(A.name.toLowerCase().trim(),A);if(m&&m instanceof p.TFolder)for(let A of m.children)A instanceof p.TFolder?g.set(A.name.toLowerCase().trim(),A):A instanceof p.TFile&&A.extension==="md"&&O.set(A.basename.toLowerCase().trim(),A);let b=new Set(o.map(A=>A.name.toLowerCase().trim())),v=o.filter(A=>{let W=A.name.toLowerCase().trim();return!u.has(W)}),C=c.filter(A=>{let W=A.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();return!g.has(W)&&!O.has(W)&&!u.has(A.name.toLowerCase().trim())}),f=[];for(let A of o){let W=A.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();(g.has(W)||O.has(W))&&!u.has(A.name.toLowerCase().trim())&&f.push(A)}let h=new Set([...o.map(A=>A.name.toLowerCase().trim()),...c.map(A=>A.name.toLowerCase().trim())]),w=[];if(a==="bl")for(let[A,W]of u.entries())h.has(A)||w.push(W);let x=0,E=0,k=0,j=0;if(f.length>0){console.log(`[Eudia] Promoting ${f.length} accounts from prospect to active`);for(let A of f){let W=A.name.replace(/[<>:"/\\|?*]/g,"_").trim(),I=g.get(W.toLowerCase()),$=O.get(W.toLowerCase());try{if(I){let R=`${this.settings.accountsFolder}/${W}`;await this.app.vault.rename(I,R),k++,new p.Notice(`${A.name} promoted to active`)}else if($){await this.app.vault.delete($);let R=[{id:A.id,name:A.name,type:A.customerType,isOwned:!0,hadOpportunity:!0}],ve=await this.fetchEnrichmentData(R);await this.createTailoredAccountFolders(R,ve),k++,new p.Notice(`${A.name} promoted to active -- full account folder created`)}}catch(R){console.error(`[Eudia] Failed to promote ${A.name}:`,R)}}}if(v.length>0){console.log(`[Eudia] Creating ${v.length} new active account folders for ${a}`);let A=new Set(f.map(I=>I.name.toLowerCase().trim())),W=v.filter(I=>!A.has(I.name.toLowerCase().trim()));if(W.length>0){let I=W.map($=>({id:$.id,name:$.name,type:$.customerType,isOwned:a==="bl",ownerName:$.ownerName,hadOpportunity:!0}));if(a==="admin"||a==="exec")await this.createAdminAccountFolders(I);else{let $=await this.fetchEnrichmentData(I);await this.createTailoredAccountFolders(I,$)}x=W.length}this.telemetry&&this.telemetry.reportInfo("Accounts synced - added",{count:x,userGroup:a,region:s||void 0})}return C.length>0&&a==="bl"&&(console.log(`[Eudia] Creating ${C.length} new prospect files`),j=await this.createProspectAccountFiles(C.map(A=>({id:A.id,name:A.name,type:"Prospect",hadOpportunity:!1,website:A.website,industry:A.industry})))),this.settings.archiveRemovedAccounts&&w.length>0&&(console.log(`[Eudia] Archiving ${w.length} removed account folders`),E=await this.archiveAccountFolders(w),this.telemetry&&this.telemetry.reportInfo("Accounts synced - archived",{count:E})),console.log(`[Eudia] Sync complete: ${x} active added, ${j} prospects added, ${k} promoted, ${E} archived (group: ${a})`),{success:!0,added:x+j+k,archived:E,userGroup:a}}catch(e){return console.error("[Eudia] Account sync error:",e),this.telemetry&&this.telemetry.reportError("Account sync failed",{error:e.message}),{success:!1,added:0,archived:0,error:e.message}}}async archiveAccountFolders(t){let e=0,n=`${this.settings.accountsFolder}/_Archived`;this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);for(let r of t)try{let s=`${n}/${r.name}`;if(this.app.vault.getAbstractFileByPath(s)){let d=new Date().toISOString().split("T")[0];await this.app.fileManager.renameFile(r,`${n}/${r.name}_${d}`)}else await this.app.fileManager.renameFile(r,s);let c=`${n}/${r.name}/_archived.md`,l=`---
archived_date: ${new Date().toISOString()}
reason: Account no longer in book of business
---

This account folder was archived because it no longer appears in your Salesforce book of business.

To restore, move this folder back to the Accounts directory.
`;try{await this.app.vault.create(c,l)}catch{}e++,console.log(`[Eudia] Archived: ${r.name}`)}catch(s){console.error(`[Eudia] Failed to archive ${r.name}:`,s)}return e}async syncSpecificNoteToSalesforce(t){let e=await this.app.vault.read(t),n=this.app.metadataCache.getFileCache(t)?.frontmatter;if(!n?.sync_to_salesforce)return{success:!1,error:"sync_to_salesforce not enabled"};let a=n.account_id,r=n.account;if(!a&&r){let s=this.settings.cachedAccounts.find(o=>o.name.toLowerCase()===r.toLowerCase());s&&(a=s.id)}if(!a){let s=t.path.split("/");if(s.length>=2&&s[0]===this.settings.accountsFolder){let o=s[1]==="_Prospects"&&s.length>=3?s[2]:s[1],c=this.settings.cachedAccounts.find(l=>l.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);c&&(a=c.id,r=c.name)}}if(!a)return{success:!1,error:`Could not determine account for ${t.path}`};try{let s=await(0,p.requestUrl)({url:`${this.settings.serverUrl}/api/notes/sync`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:a,accountName:r,noteTitle:t.basename,notePath:t.path,content:e,frontmatter:n,syncedAt:new Date().toISOString(),userEmail:this.settings.userEmail})});return s.json?.success?{success:!0}:{success:!1,error:s.json?.error||"Unknown error",authRequired:s.json?.authRequired}}catch(s){return{success:!1,error:s.message}}}async copyForSlack(){let t=this.app.workspace.getActiveFile();if(!t){new p.Notice("No note open to copy");return}try{let e=await this.app.vault.read(t),a=e.match(/^account:\s*"?([^"\n]+)"?/m)?.[1]||t.parent?.name||"Meeting",s=e.match(/^last_updated:\s*(\S+)/m)?.[1]||new Date().toISOString().split("T")[0],o="",c=e.match(/## Summary\n([\s\S]*?)(?=\n## |\n---|\Z)/);c&&(o=c[1].trim().split(`
`).filter(O=>O.startsWith("-")||O.startsWith("\u2022")).slice(0,3).map(O=>O.replace(/^[-•]\s*/,"").trim()).join(`
`));let l="",d=e.match(/## Next Steps\n([\s\S]*?)(?=\n## |\n---|\Z)/);d&&(l=d[1].trim().split(`
`).filter(O=>O.startsWith("-")||O.startsWith("\u2022")).slice(0,3).map(O=>O.replace(/^[-•\s[\]x]*/,"").trim()).join(`
\u2022 `));let u="",y=e.match(/"([^"]{20,120})"/);y&&(u=y[1]);let m=`*${a} \u2014 ${s}*
`;o&&(m+=`${o}
`),l&&(m+=`
*Next Steps:*
\u2022 ${l}
`),u&&(m+=`
> _"${u}"_
`),await navigator.clipboard.writeText(m),new p.Notice("Copied for Slack \u2713",3e3)}catch(e){new p.Notice("Failed to copy: "+(e.message||""))}}async syncNoteToSalesforce(){let t=this.app.workspace.getActiveFile();if(!t){new p.Notice("No active file to sync");return}if(!this.app.metadataCache.getFileCache(t)?.frontmatter?.sync_to_salesforce){new p.Notice("Set sync_to_salesforce: true in frontmatter to enable sync");return}new p.Notice("Syncing to Salesforce...");let n=await this.syncSpecificNoteToSalesforce(t);n.success?new p.Notice("Synced to Salesforce"):n.authRequired?new p.Notice("Salesforce authentication required. Please reconnect."):new p.Notice("Failed to sync: "+(n.error||"Unknown error"))}async checkAndAutoEnrich(){let t=this.settings.accountsFolder||"Accounts",e=this.app.vault.getAbstractFileByPath(t);if(!e||!(e instanceof p.TFolder))return;let n=[];for(let a of e.children){if(!(a instanceof p.TFolder)||a.name.startsWith("_"))continue;let r=`${a.path}/Contacts.md`,s=this.app.vault.getAbstractFileByPath(r);if(!(!s||!(s instanceof p.TFile))){if(this.app.metadataCache.getFileCache(s)?.frontmatter?.enriched_at)continue}let o=a.name,c=this.settings.cachedAccounts.find(l=>l.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);c&&c.id&&n.push({id:c.id,name:c.name,owner:"",ownerEmail:""})}if(n.length===0){console.log("[Eudia] Auto-enrich: all account folders already enriched");return}console.log(`[Eudia] Auto-enrich: ${n.length} accounts need enrichment`);try{await this.enrichAccountFolders(n)}catch(a){console.error("[Eudia] Auto-enrich failed:",a)}}async enrichAccountFolders(t){if(!t||t.length===0)return;let e=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=this.settings.accountsFolder||"Accounts",a=t.filter(d=>d.id&&d.id.startsWith("001"));if(a.length===0)return;let r=a.length,s=0,o=0;console.log(`[Eudia Enrich] Starting enrichment for ${r} accounts`),new p.Notice(`Enriching account data: 0/${r}...`);let c=20;for(let d=0;d<a.length;d+=c){let u=a.slice(d,d+c),y=u.map(g=>g.id);try{let g=await(0,p.requestUrl)({url:`${e}/api/accounts/enrich-batch`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountIds:y,userEmail:this.settings.userEmail})});if(g.json?.success&&g.json?.enrichments){let O=g.json.enrichments;for(let b of u){let v=O[b.id];if(v)try{await this.writeEnrichmentToAccount(b,v,n),s++}catch(C){o++,console.error(`[Eudia Enrich] Write failed for ${b.name}:`,C)}}}}catch(g){o+=u.length,console.error("[Eudia Enrich] Batch fetch failed:",g)}let m=Math.min(d+c,r);new p.Notice(`Enriching account data: ${m}/${r}...`),d+c<a.length&&await new Promise(g=>setTimeout(g,100))}let l=o>0?`Enrichment complete: ${s} enriched, ${o} skipped`:`Enrichment complete: ${s} accounts enriched with Salesforce data`;console.log(`[Eudia Enrich] ${l}`),new p.Notice(l)}async writeEnrichmentToAccount(t,e,n){let a=t.name.replace(/[<>:"/\\|?*]/g,"_").trim(),r=`${n}/${a}`,s=this.app.vault.getAbstractFileByPath(r);if(s instanceof p.TFolder||(r=`${n}/_Prospects/${a}`,s=this.app.vault.getAbstractFileByPath(r)),!(s instanceof p.TFolder))return;let o=new Date().toISOString(),c=async(l,d)=>{let u=`${r}/${l}`,y=this.app.vault.getAbstractFileByPath(u);if(!(y instanceof p.TFile))return;let m=await this.app.vault.read(y),g="",O=m;if(m.startsWith("---")){let f=m.indexOf("---",3);f!==-1&&(g=m.substring(0,f+3),O=m.substring(f+3),g.includes("enriched_at:")?g=g.replace(/enriched_at:.*/,`enriched_at: "${o}"`):g=g.substring(0,f)+`enriched_at: "${o}"
---`)}let b=O.match(/^(\s*#[^\n]+)/),C=`${b?b[1]:""}

${d}
`;await this.app.vault.modify(y,`${g}
${C}`)};if(e.contacts&&await c("Contacts.md",`${e.contacts}

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*`),e.intelligence&&await c("Intelligence.md",e.intelligence),e.nextSteps&&await c("Next Steps.md",e.nextSteps),e.opportunities||e.recentActivity){let l=`${r}/Meeting Notes.md`,d=this.app.vault.getAbstractFileByPath(l);if(d instanceof p.TFile){let u=await this.app.vault.read(d),y="",m=u;if(u.startsWith("---")){let v=u.indexOf("---",3);v!==-1&&(y=u.substring(0,v+3),m=u.substring(v+3),y.includes("enriched_at:")?y=y.replace(/enriched_at:.*/,`enriched_at: "${o}"`):y=y.substring(0,v)+`enriched_at: "${o}"
---`)}let g=m.match(/^(\s*#[^\n]+)/),b=[g?g[1]:`
# ${t.name} - Meeting Notes`,""];e.opportunities&&b.push(e.opportunities,""),e.recentActivity&&b.push(e.recentActivity,""),b.push("## Quick Start","","1. Open **Note 1** for your next meeting","2. Click the **microphone** to record and transcribe","3. **Next Steps** are auto-extracted after transcription","4. Set `sync_to_salesforce: true` to sync to Salesforce"),await this.app.vault.modify(d,`${y}
${b.join(`
`)}
`)}}}startSalesforceSyncScanner(){if(!this.settings.sfAutoSyncEnabled){console.log("[Eudia SF Sync] Auto-sync is disabled in settings"),this.updateSfSyncStatusBar("SF Sync: Off");return}let t=(this.settings.sfAutoSyncIntervalMinutes||15)*60*1e3;console.log(`[Eudia SF Sync] Starting scanner \u2014 interval: ${this.settings.sfAutoSyncIntervalMinutes}min`),this.updateSfSyncStatusBar("SF Sync: Idle");let e=window.setTimeout(()=>{this.runSalesforceSyncScan()},3e4);this.registerInterval(e),this.sfSyncIntervalId=window.setInterval(()=>{this.runSalesforceSyncScan()},t),this.registerInterval(this.sfSyncIntervalId)}async runSalesforceSyncScan(){if(!(!this.settings.sfAutoSyncEnabled||!this.settings.userEmail)){console.log("[Eudia SF Sync] Running scan...");try{let t=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!(t instanceof p.TFolder)){console.log("[Eudia SF Sync] Accounts folder not found");return}let e=[],n=d=>{for(let u of d.children)u instanceof p.TFile&&u.extension==="md"?e.push(u):u instanceof p.TFolder&&n(u)};n(t);let a=[];for(let d of e){let y=this.app.metadataCache.getFileCache(d)?.frontmatter;if(!y?.sync_to_salesforce)continue;let m=y.last_sf_sync?new Date(y.last_sf_sync).getTime():0;d.stat.mtime>m&&a.push(d)}if(a.length===0){console.log("[Eudia SF Sync] No flagged notes need syncing"),this.updateSfSyncStatusBar("SF Sync: Idle");return}console.log(`[Eudia SF Sync] ${a.length} note(s) queued for sync`),this.updateSfSyncStatusBar(`SF Sync: Syncing ${a.length}...`);let r=0,s=0;for(let d of a){let u=await this.syncSpecificNoteToSalesforce(d);if(u.success)r++,await this.updateNoteSyncTimestamp(d);else if(s++,console.log(`[Eudia SF Sync] Failed to sync ${d.path}: ${u.error}`),u.authRequired){new p.Notice("Salesforce authentication expired. Please reconnect to resume auto-sync."),this.updateSfSyncStatusBar("SF Sync: Auth required");return}}let c=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}),l=s>0?`SF Sync: ${r} synced, ${s} failed at ${c}`:`SF Sync: ${r} note${r!==1?"s":""} synced at ${c}`;console.log(`[Eudia SF Sync] ${l}`),this.updateSfSyncStatusBar(l),r>0&&new p.Notice(l)}catch(t){console.error("[Eudia SF Sync] Scan error:",t),this.updateSfSyncStatusBar("SF Sync: Error")}}}async updateNoteSyncTimestamp(t){try{let e=await this.app.vault.read(t),n=new Date().toISOString();if(e.startsWith("---")){let a=e.indexOf("---",3);if(a!==-1){let r=e.substring(0,a),s=e.substring(a);if(r.includes("last_sf_sync:")){let o=r.replace(/last_sf_sync:.*/,`last_sf_sync: "${n}"`)+s;await this.app.vault.modify(t,o)}else{let o=r+`last_sf_sync: "${n}"
`+s;await this.app.vault.modify(t,o)}}}}catch(e){console.error(`[Eudia SF Sync] Failed to update sync timestamp for ${t.path}:`,e)}}updateSfSyncStatusBar(t){this.sfSyncStatusBarEl&&this.sfSyncStatusBarEl.setText(t)}async createMeetingNote(){return new Promise(t=>{new ie(this.app,this,async n=>{if(!n){t();return}let a=new Date().toISOString().split("T")[0],r=n.name.replace(/[<>:"/\\|?*]/g,"_").trim(),s=`${this.settings.accountsFolder}/${r}`,o=`${a} Meeting.md`,c=`${s}/${o}`;this.app.vault.getAbstractFileByPath(s)||await this.app.vault.createFolder(s);let l=`---
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

`,d=await this.app.vault.create(c,l);await this.app.workspace.getLeaf().openFile(d),new p.Notice(`Created meeting note for ${n.name}`),t()}).open()})}async fetchAndInsertContext(){new p.Notice("Fetching pre-call context...")}async refreshAnalyticsDashboard(t){if(!this.settings.userEmail){console.log("[Eudia] Cannot refresh analytics - no email configured");return}let n=(await this.app.vault.read(t)).match(/^---\n([\s\S]*?)\n---/);if(!n)return;let a=n[1];if(!a.includes("type: analytics_dashboard"))return;let r=a.match(/category:\s*(\w+)/)?.[1]||"team";console.log(`[Eudia] Refreshing analytics dashboard: ${t.name} (${r})`);try{let s=null,o=this.settings.serverUrl,c=encodeURIComponent(this.settings.userEmail);switch(r){case"pain_points":s=(await(0,p.requestUrl)({url:`${o}/api/analytics/pain-points?days=30`,method:"GET"})).json,s.success&&await this.updatePainPointNote(t,s.painPoints);break;case"objections":s=(await(0,p.requestUrl)({url:`${o}/api/analytics/objection-playbook?days=90`,method:"GET"})).json,s.success&&await this.updateObjectionNote(t,s);break;case"coaching":case"team":default:s=(await(0,p.requestUrl)({url:`${o}/api/analytics/team-trends?managerId=${c}`,method:"GET"})).json,s.success&&await this.updateTeamPerformanceNote(t,s.trends);break}s?.success&&new p.Notice(`Analytics refreshed: ${t.name}`)}catch(s){console.error("[Eudia] Analytics refresh error:",s)}}async updatePainPointNote(t,e){if(!e||e.length===0)return;let n=new Date().toISOString().split("T")[0],a=e.slice(0,10).map(l=>`| ${l.painPoint||"--"} | ${l.count||0} | ${l.category||"--"} | ${l.averageSeverity||"medium"} |`).join(`
`),r={};for(let l of e){let d=l.category||"other";r[d]||(r[d]=[]),r[d].push(l)}let s="";for(let[l,d]of Object.entries(r)){s+=`
### ${l.charAt(0).toUpperCase()+l.slice(1)}
`;for(let u of d.slice(0,3))s+=`- ${u.painPoint}
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
${a}

---

## By Category
${s}

---

## Example Quotes

${o||"*No quotes available*"}

---

> **Tip:** Use these pain points to prepare for customer calls.
`;await this.app.vault.modify(t,c)}async updateObjectionNote(t,e){if(!e.objections||e.objections.length===0)return;let n=new Date().toISOString().split("T")[0],a=e.objections.slice(0,10).map(o=>{let c=o.handleRatePercent>=75?"\u2705 Strong":o.handleRatePercent>=50?"\u26A0\uFE0F Moderate":"\u274C Needs Work";return`| ${o.objection?.substring(0,40)||"--"}... | ${o.count||0} | ${o.handleRatePercent||0}% | ${c} |`}).join(`
`),r="";for(let o of e.objections.slice(0,5))if(o.bestResponses&&o.bestResponses.length>0){r+=`
### Objection: "${o.objection?.substring(0,50)}..."

`,r+=`**Frequency:** ${o.count} times  
`,r+=`**Handle Rate:** ${o.handleRatePercent}%

`,r+=`**Best Responses:**
`;for(let c of o.bestResponses.slice(0,2))r+=`1. *"${c.response}"* - ${c.rep||"Team member"}
`;r+=`
`}let s=`---
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
${r||"*No best practices available yet*"}

---

## Coaching Notes

*Objections with <50% handle rate need training focus*

Average handle rate: ${e.avgHandleRate||0}%

---

> **Tip:** Review this playbook before important calls.
`;await this.app.vault.modify(t,s)}async updateTeamPerformanceNote(t,e){if(!e)return;let n=new Date().toISOString().split("T")[0],a=s=>s>0?`\u2191 ${Math.abs(s).toFixed(1)}%`:s<0?`\u2193 ${Math.abs(s).toFixed(1)}%`:"--",r=`---
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
| Avg Score | ${e.avgScore?.toFixed(1)||"--"} | ${a(e.scoreTrend)} |
| Talk Ratio | ${e.avgTalkRatio?Math.round(e.avgTalkRatio*100):"--"}% | ${a(e.talkRatioTrend)} |
| Value Score | ${e.avgValueScore?.toFixed(1)||"--"} | ${a(e.valueScoreTrend)} |
| Next Step Rate | ${e.nextStepRate?Math.round(e.nextStepRate*100):"--"}% | -- |

---

## Top Pain Points

${e.topPainPoints?.slice(0,5).map(s=>`- **${s.painPoint}** (${s.count} mentions)`).join(`
`)||"*No pain points captured yet*"}

---

## Trending Topics

${e.trendingTopics?.slice(0,8).map(s=>`- ${s.topic} (${s.count})`).join(`
`)||"*No topics captured yet*"}

---

## Top Objections

${e.topObjections?.slice(0,5).map(s=>`- ${s.objection} - ${s.handleRatePercent}% handled`).join(`
`)||"*No objections captured yet*"}

---

> **Note:** This dashboard refreshes automatically when you open it.
> Data is aggregated from all analyzed calls in your region.
`;await this.app.vault.modify(t,r)}};var ce=class extends p.PluginSettingTab{constructor(i,t){super(i,t),this.plugin=t}display(){let{containerEl:i}=this;i.empty(),i.createEl("h2",{text:"Eudia Sync & Scribe"}),i.createEl("h3",{text:"Your Profile"});let t=i.createDiv();t.style.cssText="padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px; margin-top: 16px;";let e=t.createDiv();e.style.cssText="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";let n=e.createSpan(),a=e.createSpan(),r=t.createDiv();r.style.cssText="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;",r.setText("Connect with Salesforce to sync notes with your user attribution.");let s=t.createEl("button");s.style.cssText="padding: 10px 20px; cursor: pointer; border-radius: 6px;";let o=null,c=async()=>{if(!this.plugin.settings.userEmail)return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);",a.setText("Enter email above first"),s.setText("Setup Required"),s.disabled=!0,s.style.opacity="0.5",s.style.cursor="not-allowed",!1;s.disabled=!1,s.style.opacity="1",s.style.cursor="pointer";try{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); animation: pulse 1s infinite;",a.setText("Checking..."),(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;",a.setText("Connected to Salesforce"),s.setText("Reconnect"),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),!0):(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;",a.setText("Not connected"),s.setText("Connect to Salesforce"),!1)}catch{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;",a.setText("Status unavailable"),s.setText("Connect to Salesforce"),!1}};new p.Setting(i).setName("Eudia Email").setDesc("Your @eudia.com email address for calendar and Salesforce sync").addText(h=>h.setPlaceholder("yourname@eudia.com").setValue(this.plugin.settings.userEmail).onChange(async w=>{let x=w.trim().toLowerCase();this.plugin.settings.userEmail=x,await this.plugin.saveSettings(),await c()})),new p.Setting(i).setName("Timezone").setDesc("Your local timezone for calendar event display").addDropdown(h=>{fe.forEach(w=>{h.addOption(w.value,w.label)}),h.setValue(this.plugin.settings.timezone),h.onChange(async w=>{this.plugin.settings.timezone=w,await this.plugin.saveSettings(),this.plugin.calendarService?.setTimezone(w),new p.Notice(`Timezone set to ${fe.find(x=>x.value===w)?.label||w}`)})}),i.createEl("h3",{text:"Salesforce Connection"}),i.appendChild(t);let l=()=>{o&&window.clearInterval(o);let h=0,w=30;o=window.setInterval(async()=>{h++,await c()?(o&&(window.clearInterval(o),o=null),new p.Notice("Salesforce connected successfully!")):h>=w&&o&&(window.clearInterval(o),o=null)},5e3)};s.onclick=async()=>{if(!this.plugin.settings.userEmail){new p.Notice("Please enter your email first");return}let h=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(h,"_blank"),new p.Notice("Complete the Salesforce login in the popup window",5e3),l()},c(),i.createEl("h3",{text:"Server"}),new p.Setting(i).setName("GTM Brain Server").setDesc("Server URL for calendar, accounts, and sync").addText(h=>h.setValue(this.plugin.settings.serverUrl).onChange(async w=>{this.plugin.settings.serverUrl=w,await this.plugin.saveSettings()}));let d=i.createDiv({cls:"settings-advanced-collapsed"}),u=d.createDiv({cls:"eudia-transcription-status"});u.style.cssText="padding: 12px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;",u.innerHTML='<span style="color: var(--text-muted);">Checking server transcription status...</span>',(async()=>{try{(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/plugin/config`,method:"GET"})).json?.capabilities?.serverTranscription?u.innerHTML='<span class="eudia-check-icon"></span> Server transcription is available. No local API key needed.':u.innerHTML='<span class="eudia-warn-icon"></span> Server transcription unavailable. Add a local API key below.'}catch{u.innerHTML='<span style="color: #f59e0b;">\u26A0</span> Could not check server status. Local API key recommended as backup.'}})();let y=new p.Setting(i).setName("Advanced Options").setDesc("Show fallback API key (usually not needed)").addToggle(h=>h.setValue(!1).onChange(w=>{d.style.display=w?"block":"none"}));d.style.display="none",i.createEl("h3",{text:"Audio Capture"});let m=i.createDiv();m.style.cssText="font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5;",m.setText(`Full Call mode automatically captures both sides of the call (your mic + the other person's audio). No extra software needed \u2014 the plugin uses native system audio capture. Run "Test System Audio Capture" from the command palette (Cmd+P) to verify your setup.`),new p.Setting(i).setName("Capture Mode").setDesc("Full Call captures both sides; Mic Only captures your voice only.").addDropdown(h=>{h.addOption("full_call","Full Call (Both Sides)"),h.addOption("mic_only","Mic Only"),h.setValue(this.plugin.settings.audioCaptureMode||"full_call"),h.onChange(async w=>{this.plugin.settings.audioCaptureMode=w,await this.plugin.saveSettings()})});let g=i.createDiv();g.style.cssText="padding: 10px 14px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;",g.setText("Checking system audio capabilities...");let O=new p.Setting(i).setName("Microphone").setDesc("Select your physical microphone"),b=new p.Setting(i).setName("System Audio Device").setDesc("Override for system audio source (auto-detected \u2014 most users should leave this on Auto)"),v=i.createDiv();v.style.cssText="margin-bottom: 16px;";let C=v.createEl("button",{text:"Test Audio (3 seconds)"});C.style.cssText="padding: 8px 16px; cursor: pointer; border-radius: 6px;";let f=v.createDiv();f.style.cssText="font-size: 12px; margin-top: 6px; color: var(--text-muted);",(async()=>{try{try{(await navigator.mediaDevices.getUserMedia({audio:!0})).getTracks().forEach(k=>k.stop())}catch{}let h=await T.getAvailableDevices(),w=h.find(E=>E.isVirtual);if(w)g.innerHTML=`<span style="color:#22c55e;">&#10003;</span> System audio device detected: <strong>${w.label}</strong>`,this.plugin.settings.audioSystemDeviceId||(this.plugin.settings.audioSystemDeviceId=w.deviceId,await this.plugin.saveSettings());else{let E=await T.probeSystemAudioCapabilities();E.desktopCapturerAvailable||T.isHandlerReady()?g.innerHTML='<span style="color:#22c55e;">&#10003;</span> Native system audio capture available. Both sides of calls will be recorded automatically.':E.getDisplayMediaAvailable?g.innerHTML=`<span style="color:#3b82f6;">&#8505;</span> System audio capture ready. On first recording, macOS may ask for Screen Recording permission \u2014 this is how the plugin captures the other person's audio.`:g.innerHTML=`<span style="color:#f59e0b;">&#9888;</span> System audio not available (Electron ${E.electronVersion||"?"}). Run "Test System Audio Capture" from Cmd+P for details.`}let x=h.filter(E=>!E.isVirtual);O.addDropdown(E=>{E.addOption("","Default Microphone"),x.forEach(k=>E.addOption(k.deviceId,k.label)),E.setValue(this.plugin.settings.audioMicDeviceId||""),E.onChange(async k=>{this.plugin.settings.audioMicDeviceId=k,await this.plugin.saveSettings()})}),b.addDropdown(E=>{E.addOption("","Auto-detect / None"),h.filter(k=>k.isVirtual).forEach(k=>E.addOption(k.deviceId,k.label)),h.filter(k=>!k.isVirtual).forEach(k=>E.addOption(k.deviceId,`(mic) ${k.label}`)),E.setValue(this.plugin.settings.audioSystemDeviceId||""),E.onChange(async k=>{this.plugin.settings.audioSystemDeviceId=k,await this.plugin.saveSettings()})})}catch(h){g.setText("Could not enumerate audio devices."),console.warn("[Eudia Settings] Device enumeration failed:",h)}})(),C.onclick=async()=>{C.disabled=!0,C.setText("Recording..."),f.setText("");try{let h=new T;await h.start({captureMode:this.plugin.settings.audioCaptureMode||"full_call",micDeviceId:this.plugin.settings.audioMicDeviceId||void 0,systemAudioDeviceId:this.plugin.settings.audioSystemDeviceId||void 0}),await new Promise(j=>setTimeout(j,3e3));let w=await h.stop(),x=await T.analyzeAudioBlob(w.audioBlob),E={electron:"System Audio (Electron)",display_media:"System Audio (Screen Share)",virtual_device:"Virtual Device + Mic"},k=w.systemAudioMethod?E[w.systemAudioMethod]||"System Audio":w.captureMode==="full_call"?"Speaker Mode":"Mic Only";f.innerHTML=`<strong>${k}</strong> | Peak: ${x.peakLevel}% | Avg: ${x.averageLevel}% | Silent: ${x.silentPercent}%`+(x.warning?`<br><span style="color:#ef4444;">${x.warning}</span>`:'<br><span style="color:#22c55e;">Audio detected \u2014 recording should work.</span>')}catch(h){f.innerHTML=`<span style="color:#ef4444;">Test failed: ${h.message}</span>`}finally{C.disabled=!1,C.setText("Test Audio (3 seconds)")}},i.createEl("h3",{text:"Transcription"}),new p.Setting(i).setName("Save Audio Files").setDesc("Keep original audio recordings").addToggle(h=>h.setValue(this.plugin.settings.saveAudioFiles).onChange(async w=>{this.plugin.settings.saveAudioFiles=w,await this.plugin.saveSettings()})),new p.Setting(i).setName("Append Full Transcript").setDesc("Include complete transcript in notes").addToggle(h=>h.setValue(this.plugin.settings.appendTranscript).onChange(async w=>{this.plugin.settings.appendTranscript=w,await this.plugin.saveSettings()})),i.createEl("h3",{text:"Sync"}),new p.Setting(i).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle(h=>h.setValue(this.plugin.settings.syncOnStartup).onChange(async w=>{this.plugin.settings.syncOnStartup=w,await this.plugin.saveSettings()})),new p.Setting(i).setName("Auto-Sync After Transcription").setDesc("Push notes to Salesforce after transcription").addToggle(h=>h.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async w=>{this.plugin.settings.autoSyncAfterTranscription=w,await this.plugin.saveSettings()})),new p.Setting(i).setName("Auto-Sync Flagged Notes").setDesc("Periodically push notes with sync_to_salesforce: true to Salesforce").addToggle(h=>h.setValue(this.plugin.settings.sfAutoSyncEnabled).onChange(async w=>{this.plugin.settings.sfAutoSyncEnabled=w,await this.plugin.saveSettings(),w?this.plugin.startSalesforceSyncScanner():this.plugin.updateSfSyncStatusBar("SF Sync: Off")})),new p.Setting(i).setName("Auto-Sync Interval").setDesc("How often to scan for flagged notes (in minutes)").addDropdown(h=>{h.addOption("5","Every 5 minutes"),h.addOption("15","Every 15 minutes"),h.addOption("30","Every 30 minutes"),h.setValue(String(this.plugin.settings.sfAutoSyncIntervalMinutes)),h.onChange(async w=>{this.plugin.settings.sfAutoSyncIntervalMinutes=parseInt(w),await this.plugin.saveSettings(),new p.Notice(`SF auto-sync interval set to ${w} minutes. Restart Obsidian for changes to take effect.`)})}),i.createEl("h3",{text:"Folders"}),new p.Setting(i).setName("Accounts Folder").setDesc("Where account folders are stored").addText(h=>h.setValue(this.plugin.settings.accountsFolder).onChange(async w=>{this.plugin.settings.accountsFolder=w||"Accounts",await this.plugin.saveSettings()})),new p.Setting(i).setName("Recordings Folder").setDesc("Where audio files are saved").addText(h=>h.setValue(this.plugin.settings.recordingsFolder).onChange(async w=>{this.plugin.settings.recordingsFolder=w||"Recordings",await this.plugin.saveSettings()})),i.createEl("h3",{text:"Actions"}),new p.Setting(i).setName("Sync Accounts Now").setDesc(`${this.plugin.settings.cachedAccounts.length} accounts available for matching`).addButton(h=>h.setButtonText("Sync").setCta().onClick(async()=>{await this.plugin.syncAccounts(),this.display()})),new p.Setting(i).setName("Refresh Account Folders").setDesc("Check for new account assignments and create folders for them").addButton(h=>h.setButtonText("Refresh Folders").onClick(async()=>{h.setButtonText("Checking..."),h.setDisabled(!0);try{let w=await this.plugin.refreshAccountFolders();w>0?new p.Notice(`Created ${w} new account folder${w>1?"s":""}`):new p.Notice("All account folders are up to date")}catch(w){new p.Notice("Failed to refresh folders: "+w.message)}h.setButtonText("Refresh Folders"),h.setDisabled(!1),this.display()})),this.plugin.settings.lastSyncTime&&i.createEl("p",{text:`Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()}`,cls:"setting-item-description"}),i.createEl("p",{text:`Audio transcription: ${T.isSupported()?"Supported":"Not supported"}`,cls:"setting-item-description"})}};
