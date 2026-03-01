var Se=Object.create;var V=Object.defineProperty;var be=Object.getOwnPropertyDescriptor;var Oe=Object.getOwnPropertyNames;var Ce=Object.getPrototypeOf,Ae=Object.prototype.hasOwnProperty;var xe=(O,r)=>{for(var t in r)V(O,t,{get:r[t],enumerable:!0})},le=(O,r,t,e)=>{if(r&&typeof r=="object"||typeof r=="function")for(let n of Oe(r))!Ae.call(O,n)&&n!==t&&V(O,n,{get:()=>r[n],enumerable:!(e=be(r,n))||e.enumerable});return O};var U=(O,r,t)=>(t=O!=null?Se(Ce(O)):{},le(r||!O||!O.__esModule?V(t,"default",{value:O,enumerable:!0}):t,O)),Ee=O=>le(V({},"__esModule",{value:!0}),O);var Ve={};xe(Ve,{default:()=>Q});module.exports=Ee(Ve);var p=require("obsidian");var X=[/blackhole/i,/vb-cable/i,/vb cable/i,/loopback/i,/soundflower/i,/virtual audio/i,/screen ?capture/i],I=class O{constructor(){this.mediaRecorder=null;this.audioChunks=[];this.stream=null;this.secondaryStream=null;this.startTime=0;this.pausedDuration=0;this.pauseStartTime=0;this.durationInterval=null;this.audioContext=null;this.analyser=null;this.levelInterval=null;this.lastExtractedChunkIndex=0;this.mimeTypeCache="audio/webm";this.activeCaptureMode="full_call";this.activeHasVirtualDevice=!1;this.activeSystemAudioMethod=null;this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0};this.stateCallback=null;this.eventCallback=null;this.deviceChangeHandler=null;this.activeDeviceLabel="";this.silenceCheckInterval=null;this.consecutiveSilentChecks=0;this.silenceAlerted=!1;this.levelHistory=[];this.trackingLevels=!1}static{this.SILENCE_THRESHOLD=5}static{this.SILENCE_ALERT_AFTER=6}static{this.HEADPHONE_PATTERNS=[/airpods/i,/beats/i,/headphone/i,/headset/i,/earbuds/i,/bluetooth/i,/bose/i,/sony wh/i,/jabra/i,/galaxy buds/i]}onStateChange(r){this.stateCallback=r}onEvent(r){this.eventCallback=r}emitEvent(r){if(this.eventCallback)try{this.eventCallback(r)}catch(t){console.error("[AudioRecorder] Event handler error:",t)}}static isHeadphoneDevice(r){return r?O.HEADPHONE_PATTERNS.some(t=>t.test(r)):!1}static isIOSOrSafari(){let r=navigator.userAgent,t=/iPad|iPhone|iPod/.test(r)&&!window.MSStream,e=/^((?!chrome|android).)*safari/i.test(r);return t||e}getSupportedMimeType(){let r=O.isIOSOrSafari(),t=r?["audio/mp4","audio/mp4;codecs=aac","audio/aac","audio/webm;codecs=opus","audio/webm"]:["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];for(let e of t)if(MediaRecorder.isTypeSupported(e))return console.log(`[AudioRecorder] Using MIME type: ${e} (iOS/Safari: ${r})`),e;return r?"audio/mp4":"audio/webm"}async startRecording(r){if(this.state.isRecording)throw new Error("Already recording");let t=r?.captureMode??"full_call";this.activeCaptureMode=t,this.activeHasVirtualDevice=!1,this.activeSystemAudioMethod=null;try{let e=O.isIOSOrSafari(),n;e?n={echoCancellation:!0,noiseSuppression:!0}:t==="full_call"?n={echoCancellation:!1,noiseSuppression:!1,autoGainControl:!0,sampleRate:48e3,channelCount:1}:n={echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0,sampleRate:48e3,channelCount:1},r?.micDeviceId&&(n.deviceId={exact:r.micDeviceId});let a=await navigator.mediaDevices.getUserMedia({audio:n});console.log(`[AudioRecorder] Mic granted | mode=${t} | echoCancellation=${t!=="full_call"}`);let i=a,s=r?.systemAudioDeviceId||(await O.detectVirtualAudioDevice())?.deviceId;if(s&&!e)try{let l=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:s},echoCancellation:!1,noiseSuppression:!1,autoGainControl:!1}});this.audioContext=new AudioContext;let c=this.audioContext.createMediaStreamSource(a),d=this.audioContext.createMediaStreamSource(l),u=this.audioContext.createMediaStreamDestination();c.connect(u),d.connect(u),i=u.stream,this.secondaryStream=l,this.activeHasVirtualDevice=!0,this.activeSystemAudioMethod="virtual_device",console.log("[AudioRecorder] Virtual device detected \u2014 dual-stream capture active")}catch(l){console.log(`[AudioRecorder] Virtual device open failed (${l.message}), continuing with mic only`)}if(!this.activeHasVirtualDevice&&t==="full_call"&&!e)try{console.log("[AudioRecorder] No virtual device \u2014 attempting native system audio capture");let l=await O.captureSystemAudio();if(l){this.audioContext=this.audioContext||new AudioContext;let c=this.audioContext.createMediaStreamSource(a),d=this.audioContext.createMediaStreamSource(l.stream),u=this.audioContext.createMediaStreamDestination();c.connect(u),d.connect(u),i=u.stream,this.secondaryStream=l.stream,this.activeHasVirtualDevice=!0,this.activeSystemAudioMethod=l.method,console.log(`[AudioRecorder] Native system audio via ${l.method} \u2014 dual-stream active`)}}catch(l){console.log(`[AudioRecorder] Native system audio failed (${l.message}), continuing with mic only`)}this.stream=i,this.setupAudioAnalysis();let o=this.getSupportedMimeType();this.mimeTypeCache=o,this.mediaRecorder=new MediaRecorder(this.stream,{mimeType:o,audioBitsPerSecond:128e3}),this.audioChunks=[],this.lastExtractedChunkIndex=0,this.mediaRecorder.ondataavailable=l=>{l.data.size>0&&this.audioChunks.push(l.data)},this.mediaRecorder.start(1e3),this.startTime=Date.now(),this.pausedDuration=0,this.state={isRecording:!0,isPaused:!1,duration:0,audioLevel:0},this.startDurationTracking(),this.startLevelTracking(),this.startLevelHistoryTracking(),this.captureActiveDeviceLabel(i),this.startDeviceMonitoring(),this.startSilenceWatchdog(),this.notifyStateChange()}catch(e){throw this.cleanup(),new Error(`Failed to start recording: ${e.message}`)}}static async detectVirtualAudioDevice(){try{let r=await navigator.mediaDevices.enumerateDevices();for(let t of r)if(t.kind==="audioinput"){for(let e of X)if(e.test(t.label))return{deviceId:t.deviceId,label:t.label,isVirtual:!0}}}catch(r){console.warn("[AudioRecorder] enumerateDevices failed:",r)}return null}static async getAvailableDevices(){try{return(await navigator.mediaDevices.enumerateDevices()).filter(t=>t.kind==="audioinput").map(t=>{let e=X.some(n=>n.test(t.label));return{deviceId:t.deviceId,label:t.label||"Unknown Microphone",isVirtual:e}})}catch(r){return console.warn("[AudioRecorder] enumerateDevices failed:",r),[]}}static{this._displayMediaHandlerReady=!1}static async setupDisplayMediaHandler(){if(O._displayMediaHandlerReady)return!0;let r=window.require;if(!r)return!1;try{let t=r("@electron/remote");if(t?.session?.defaultSession?.setDisplayMediaRequestHandler&&t?.desktopCapturer?.getSources)return t.session.defaultSession.setDisplayMediaRequestHandler(async(e,n)=>{try{let a=await t.desktopCapturer.getSources({types:["screen"],thumbnailSize:{width:0,height:0}});n(a?.length?{video:a[0],audio:"loopback"}:null)}catch{n(null)}}),O._displayMediaHandlerReady=!0,console.log("[AudioRecorder] Display media handler installed via @electron/remote \u2014 loopback audio enabled"),!0}catch(t){console.log(`[AudioRecorder] @electron/remote handler setup failed: ${t.message}`)}try{let e=r("electron")?.remote;if(e?.session?.defaultSession?.setDisplayMediaRequestHandler&&e?.desktopCapturer?.getSources)return e.session.defaultSession.setDisplayMediaRequestHandler(async(n,a)=>{try{let i=await e.desktopCapturer.getSources({types:["screen"],thumbnailSize:{width:0,height:0}});a(i?.length?{video:i[0],audio:"loopback"}:null)}catch{a(null)}}),O._displayMediaHandlerReady=!0,console.log("[AudioRecorder] Display media handler installed via electron.remote \u2014 loopback audio enabled"),!0}catch(t){console.log(`[AudioRecorder] electron.remote handler setup failed: ${t.message}`)}return console.log("[AudioRecorder] Could not set up display media handler \u2014 remote module not accessible"),!1}static async tryDesktopCapturerWithSource(){let r=window.require;if(!r)return null;let t=null;try{let e=r("electron")?.desktopCapturer;e?.getSources&&(t=await e.getSources({types:["screen"],thumbnailSize:{width:0,height:0}}),t?.length&&console.log(`[AudioRecorder] desktopCapturer.getSources: ${t.length} screen(s)`))}catch(e){console.log(`[AudioRecorder] direct desktopCapturer failed: ${e.message}`)}if(!t?.length)try{let e=r("@electron/remote")?.desktopCapturer;e?.getSources&&(t=await e.getSources({types:["screen"],thumbnailSize:{width:0,height:0}}),t?.length&&console.log(`[AudioRecorder] @electron/remote desktopCapturer: ${t.length} screen(s)`))}catch{}if(!t?.length)try{let e=r("electron")?.remote?.desktopCapturer;e?.getSources&&(t=await e.getSources({types:["screen"],thumbnailSize:{width:0,height:0}}),t?.length&&console.log(`[AudioRecorder] electron.remote desktopCapturer: ${t.length} screen(s)`))}catch{}if(!t?.length)try{let e=r("electron")?.ipcRenderer;e?.invoke&&(t=await e.invoke("DESKTOP_CAPTURER_GET_SOURCES",{types:["screen"]}),t?.length&&console.log(`[AudioRecorder] IPC desktopCapturer: ${t.length} screen(s)`))}catch{}if(!t?.length)return console.log("[AudioRecorder] No desktopCapturer path yielded sources"),null;try{let e=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:"desktop",chromeMediaSourceId:t[0].id}},video:{mandatory:{chromeMediaSource:"desktop",chromeMediaSourceId:t[0].id,maxWidth:1,maxHeight:1,maxFrameRate:1}}});e.getVideoTracks().forEach(a=>a.stop());let n=e.getAudioTracks();if(n.length>0)return console.log("[AudioRecorder] desktopCapturer + getUserMedia audio capture active"),new MediaStream(n)}catch(e){console.log(`[AudioRecorder] getUserMedia with chromeMediaSource failed: ${e.message}`)}return null}static async tryDesktopCapturerNoSourceId(){try{let r=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:"desktop"}},video:{mandatory:{chromeMediaSource:"desktop",maxWidth:1,maxHeight:1,maxFrameRate:1}}});r.getVideoTracks().forEach(e=>e.stop());let t=r.getAudioTracks();if(t.length>0)return console.log("[AudioRecorder] getUserMedia chromeMediaSource:desktop (no source ID) audio active"),new MediaStream(t)}catch(r){console.log(`[AudioRecorder] chromeMediaSource:desktop (no source) failed: ${r.message}`)}return null}static async tryGetDisplayMedia(){if(!navigator.mediaDevices?.getDisplayMedia)return null;try{let r=await navigator.mediaDevices.getDisplayMedia({audio:{suppressLocalAudioPlayback:!1},video:{width:{ideal:1},height:{ideal:1},frameRate:{ideal:1}},systemAudio:"include"});r.getVideoTracks().forEach(e=>e.stop());let t=r.getAudioTracks();if(t.length>0)return console.log(`[AudioRecorder] getDisplayMedia audio capture active (handler=${O._displayMediaHandlerReady})`),new MediaStream(t);console.log("[AudioRecorder] getDisplayMedia returned no audio tracks")}catch(r){r.name==="NotAllowedError"?console.log("[AudioRecorder] getDisplayMedia: not allowed (no handler set or user denied)"):console.log(`[AudioRecorder] getDisplayMedia failed: ${r.name}: ${r.message}`)}return null}static async captureSystemAudio(){let r=await O.tryDesktopCapturerWithSource();if(r)return{stream:r,method:"electron"};let t=await O.tryDesktopCapturerNoSourceId();if(t)return{stream:t,method:"electron"};let e=await O.tryGetDisplayMedia();return e?{stream:e,method:"display_media"}:(console.log("[AudioRecorder] All system audio strategies exhausted \u2014 mic only"),null)}static async probeSystemAudioCapabilities(){let r={electronAvailable:!1,desktopCapturerAvailable:!1,desktopCapturerSources:0,remoteAvailable:!1,remoteSessionAvailable:!1,ipcRendererAvailable:!1,getDisplayMediaAvailable:!1,electronVersion:null,chromiumVersion:null,platform:window.process?.platform||navigator.platform||"unknown",handlerSetupResult:"not attempted",bestPath:"mic_only"},t=window.require;if(!t)return r.bestPath="mic_only (require not available)",r;try{let e=t("electron");if(r.electronAvailable=!!e,r.ipcRendererAvailable=!!e?.ipcRenderer?.invoke,e?.desktopCapturer?.getSources){r.desktopCapturerAvailable=!0;try{let n=await e.desktopCapturer.getSources({types:["screen"],thumbnailSize:{width:0,height:0}});r.desktopCapturerSources=n?.length||0}catch{}}}catch{}try{let e=t("@electron/remote");r.remoteAvailable=!!e,r.remoteSessionAvailable=!!e?.session?.defaultSession?.setDisplayMediaRequestHandler}catch{}if(!r.remoteAvailable)try{let e=t("electron")?.remote;r.remoteAvailable=!!e,r.remoteSessionAvailable=!!e?.session?.defaultSession?.setDisplayMediaRequestHandler}catch{}try{let e=window.process?.versions;r.electronVersion=e?.electron||null,r.chromiumVersion=e?.chrome||null}catch{}if(r.getDisplayMediaAvailable=!!navigator.mediaDevices?.getDisplayMedia,r.remoteSessionAvailable){let e=await O.setupDisplayMediaHandler();r.handlerSetupResult=e?"SUCCESS":"failed"}else r.handlerSetupResult="remote not available";return r.desktopCapturerAvailable&&r.desktopCapturerSources>0?r.bestPath="electron_desktopCapturer (zero-click)":O._displayMediaHandlerReady?r.bestPath="getDisplayMedia + loopback handler (zero-click)":r.getDisplayMediaAvailable?r.bestPath="getDisplayMedia (may show system picker)":r.bestPath="mic_only",r}getSystemAudioMethod(){return this.activeSystemAudioMethod}static isHandlerReady(){return O._displayMediaHandlerReady}setupAudioAnalysis(){if(this.stream)try{this.audioContext=new AudioContext;let r=this.audioContext.createMediaStreamSource(this.stream);this.analyser=this.audioContext.createAnalyser(),this.analyser.fftSize=256,r.connect(this.analyser)}catch(r){console.warn("Failed to set up audio analysis:",r)}}startDurationTracking(){this.durationInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused){let r=Date.now()-this.startTime-this.pausedDuration;this.state.duration=Math.floor(r/1e3),this.notifyStateChange(),this.state.duration>=5400&&(console.log("[Eudia] Maximum recording duration reached (90 minutes) \u2014 auto-stopping"),this.stop())}},100)}startLevelTracking(){if(!this.analyser)return;let r=new Uint8Array(this.analyser.frequencyBinCount);this.levelInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused&&this.analyser){this.analyser.getByteFrequencyData(r);let t=0;for(let n=0;n<r.length;n++)t+=r[n];let e=t/r.length;this.state.audioLevel=Math.min(100,Math.round(e/255*100*2)),this.notifyStateChange()}},50)}startDeviceMonitoring(){this.deviceChangeHandler=async()=>{if(this.state.isRecording)try{let t=(await navigator.mediaDevices.enumerateDevices()).filter(i=>i.kind==="audioinput"),e=t.map(i=>i.label),n=this.activeDeviceLabel&&!e.some(i=>i===this.activeDeviceLabel);this.emitEvent({type:"deviceChanged",newDevices:t.map(i=>({deviceId:i.deviceId,label:i.label,isVirtual:X.some(s=>s.test(i.label))})),activeDeviceLost:!!n});let a=t.find(i=>O.isHeadphoneDevice(i.label)&&i.label!==this.activeDeviceLabel);a&&this.emitEvent({type:"headphoneDetected",deviceLabel:a.label})}catch(r){console.warn("[AudioRecorder] Device change detection failed:",r)}},navigator.mediaDevices.addEventListener("devicechange",this.deviceChangeHandler)}stopDeviceMonitoring(){this.deviceChangeHandler&&(navigator.mediaDevices.removeEventListener("devicechange",this.deviceChangeHandler),this.deviceChangeHandler=null)}startSilenceWatchdog(){this.consecutiveSilentChecks=0,this.silenceAlerted=!1,this.silenceCheckInterval=setInterval(()=>{!this.state.isRecording||this.state.isPaused||(this.state.audioLevel<O.SILENCE_THRESHOLD?(this.consecutiveSilentChecks++,this.consecutiveSilentChecks>=O.SILENCE_ALERT_AFTER&&!this.silenceAlerted&&(this.silenceAlerted=!0,this.emitEvent({type:"silenceDetected",durationSeconds:this.consecutiveSilentChecks*5}))):(this.silenceAlerted&&this.emitEvent({type:"audioRestored"}),this.consecutiveSilentChecks=0,this.silenceAlerted=!1))},5e3)}stopSilenceWatchdog(){this.silenceCheckInterval&&(clearInterval(this.silenceCheckInterval),this.silenceCheckInterval=null)}captureActiveDeviceLabel(r){let t=r.getAudioTracks()[0];this.activeDeviceLabel=t?.label||"",O.isHeadphoneDevice(this.activeDeviceLabel)&&this.emitEvent({type:"headphoneDetected",deviceLabel:this.activeDeviceLabel})}pauseRecording(){!this.state.isRecording||this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="recording"&&(this.mediaRecorder.pause(),this.pauseStartTime=Date.now(),this.state.isPaused=!0,this.notifyStateChange())}resumeRecording(){!this.state.isRecording||!this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="paused"&&(this.mediaRecorder.resume(),this.pausedDuration+=Date.now()-this.pauseStartTime,this.state.isPaused=!1,this.notifyStateChange())}async stopRecording(){return new Promise((r,t)=>{if(!this.mediaRecorder||!this.state.isRecording){t(new Error("Not currently recording"));return}let e=this.mediaRecorder.mimeType,n=this.state.duration,a=this.activeCaptureMode,i=this.activeHasVirtualDevice,s=this.activeSystemAudioMethod,o=!1,l=d=>{let u=new Date,h=u.toISOString().split("T")[0],m=u.toTimeString().split(" ")[0].replace(/:/g,"-"),g=e.includes("webm")?"webm":e.includes("mp4")?"m4a":e.includes("ogg")?"ogg":"webm";return{audioBlob:d,duration:n,mimeType:e,filename:`recording-${h}-${m}.${g}`,captureMode:a,hasVirtualDevice:i,systemAudioMethod:s}},c=setTimeout(()=>{if(!o){o=!0,console.warn("AudioRecorder: onstop timeout, forcing completion");try{let d=new Blob(this.audioChunks,{type:e});this.cleanup(),r(l(d))}catch{this.cleanup(),t(new Error("Failed to process recording after timeout"))}}},1e4);this.mediaRecorder.onstop=()=>{if(!o){o=!0,clearTimeout(c);try{console.log(`[AudioRecorder] Chunks collected: ${this.audioChunks.length}`);let d=new Blob(this.audioChunks,{type:e});console.log(`[AudioRecorder] Blob size: ${d.size} bytes`),this.cleanup(),r(l(d))}catch(d){this.cleanup(),t(d)}}},this.mediaRecorder.onerror=d=>{o||(o=!0,clearTimeout(c),this.cleanup(),t(new Error("Recording error occurred")))},this.mediaRecorder.state==="recording"&&this.mediaRecorder.requestData(),setTimeout(()=>{this.mediaRecorder&&this.mediaRecorder.state!=="inactive"&&this.mediaRecorder.stop()},100)})}cancelRecording(){this.cleanup()}cleanup(){this.durationInterval&&(clearInterval(this.durationInterval),this.durationInterval=null),this.levelInterval&&(clearInterval(this.levelInterval),this.levelInterval=null),this.stopDeviceMonitoring(),this.stopSilenceWatchdog(),this.audioContext&&(this.audioContext.close().catch(()=>{}),this.audioContext=null,this.analyser=null),this.stream&&(this.stream.getTracks().forEach(r=>r.stop()),this.stream=null),this.secondaryStream&&(this.secondaryStream.getTracks().forEach(r=>r.stop()),this.secondaryStream=null),this.mediaRecorder=null,this.audioChunks=[],this.activeDeviceLabel="",this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0},this.notifyStateChange()}getState(){return{...this.state}}static isSupported(){if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder)return!1;let t=["audio/webm","audio/mp4","audio/ogg","audio/webm;codecs=opus"].some(e=>MediaRecorder.isTypeSupported(e));return t||console.warn("[AudioRecorder] No supported audio formats found"),t}static getMobileInstructions(){return this.isIOSOrSafari()?"For best results on iOS, ensure you have granted microphone permissions in Settings > Privacy > Microphone.":null}notifyStateChange(){this.stateCallback&&this.stateCallback({...this.state})}static formatDuration(r){let t=Math.floor(r/60),e=r%60;return`${t.toString().padStart(2,"0")}:${e.toString().padStart(2,"0")}`}static async blobToBase64(r){return new Promise((t,e)=>{let n=new FileReader;n.onload=()=>{let i=n.result.split(",")[1];t(i)},n.onerror=e,n.readAsDataURL(r)})}static async blobToArrayBuffer(r){return r.arrayBuffer()}async start(r){return this.startRecording(r)}async stop(){return this.stopRecording()}pause(){return this.pauseRecording()}resume(){return this.resumeRecording()}cancel(){return this.cancelRecording()}isRecording(){return this.state.isRecording}extractNewChunks(){if(!this.state.isRecording||this.audioChunks.length===0)return null;let r=this.audioChunks.slice(this.lastExtractedChunkIndex);return r.length===0?null:(this.lastExtractedChunkIndex=this.audioChunks.length,new Blob(r,{type:this.mimeTypeCache}))}getAllChunksAsBlob(){return this.audioChunks.length===0?null:new Blob(this.audioChunks,{type:this.mimeTypeCache})}getDuration(){return this.state.duration}getMimeType(){return this.mimeTypeCache}startLevelHistoryTracking(){this.levelHistory=[],this.trackingLevels=!0}recordLevelSample(){this.trackingLevels&&this.levelHistory.push(this.state.audioLevel)}getAudioDiagnostic(){if(this.levelHistory.length===0)return{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:100,warning:"Unable to analyze audio levels - recording may be too short"};let r=this.levelHistory.reduce((i,s)=>i+s,0)/this.levelHistory.length,t=Math.max(...this.levelHistory),e=this.levelHistory.filter(i=>i<5).length,n=Math.round(e/this.levelHistory.length*100),a=null;return t<5?a="SILENT AUDIO: No audio was detected during recording. Check your microphone settings and ensure Obsidian has microphone permission.":r<10&&n>80?a="VERY LOW AUDIO: Audio levels were extremely low. The transcription may not be accurate. Check your microphone or move closer to it.":n>90&&(a="MOSTLY SILENT: Over 90% of the recording had no audio. Make sure you're capturing the meeting audio, not just silence."),{hasAudio:t>=5,averageLevel:Math.round(r),peakLevel:t,silentPercent:n,warning:a}}static async analyzeAudioBlob(r){try{let t=new AudioContext,e=await r.arrayBuffer(),n;try{n=await t.decodeAudioData(e)}catch{return await t.close(),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:"Could not analyze audio format. Proceeding with transcription."}}let a=n.getChannelData(0),i=0,s=0,o=0,l=.01,c=100,d=0;for(let C=0;C<a.length;C+=c){let S=Math.abs(a[C]);i+=S,S>s&&(s=S),S<l&&o++,d++}await t.close();let u=i/d,h=Math.round(o/d*100),m=Math.round(u*100*10),g=Math.round(s*100),v=null;return s<.01?v='SILENT AUDIO DETECTED: The recording appears to contain only silence. This typically causes Whisper to hallucinate random text like "Yes. Yes. Yes." Check your audio input source.':u<.005&&h>95?v="NEAR-SILENT AUDIO: The recording is almost entirely silent. The transcription will likely be inaccurate.":h>90&&(v="MOSTLY SILENT: Over 90% of the recording is silent. Consider checking your audio setup."),{hasAudio:s>=.01,averageLevel:m,peakLevel:g,silentPercent:h,warning:v}}catch(t){return console.error("Audio analysis failed:",t),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:null}}}};var N=require("obsidian");var Z=class{constructor(){this.salesforceAccounts=[]}setAccounts(r){this.salesforceAccounts=r}detectAccount(r,t,e){if(r){let n=this.detectFromTitle(r);if(n.confidence>=70)return n}if(e){let n=this.detectFromFilePath(e);if(n.confidence>=70)return n}if(t&&t.length>0){let n=this.detectFromAttendees(t);if(n.confidence>=50)return n}return{account:null,accountId:null,confidence:0,source:"none",evidence:"No account detected from available context"}}detectFromTitle(r){if(!r)return{account:null,accountId:null,confidence:0,source:"title",evidence:"No title"};let t=[{regex:/^([A-Za-z0-9][^-–—]+?)\s*[-–—]\s*(?:[A-Z][a-z]+|[A-Za-z]{2,})/,confidence:85},{regex:/(?:call|meeting|sync|check-in|demo|discovery)\s+(?:with|re:?|@)\s+([^-–—]+?)(?:\s*[-–—]|$)/i,confidence:80},{regex:/^([A-Za-z][^-–—]+?)\s+(?:discovery|demo|review|kickoff|intro|onboarding|sync)\s*(?:call)?$/i,confidence:75},{regex:/^([^:]+?):\s+/i,confidence:70},{regex:/^\[([^\]]+)\]/,confidence:75}],e=["weekly","daily","monthly","internal","team","1:1","one on one","standup","sync","meeting","call","notes","monday","tuesday","wednesday","thursday","friday","untitled","new","test"];for(let n of t){let a=r.match(n.regex);if(a&&a[1]){let i=a[1].trim();if(e.some(o=>i.toLowerCase()===o)||i.length<2)continue;let s=this.fuzzyMatchSalesforce(i);return s?{account:s.name,accountId:s.id,confidence:Math.min(n.confidence+10,100),source:"salesforce_match",evidence:`Matched "${i}" from title to Salesforce account "${s.name}"`}:{account:i,accountId:null,confidence:n.confidence,source:"title",evidence:"Extracted from meeting title pattern"}}}return{account:null,accountId:null,confidence:0,source:"title",evidence:"No pattern matched"}}detectFromFilePath(r){let t=r.match(/Accounts\/([^\/]+)\//i);if(t&&t[1]){let e=t[1].trim(),n=this.fuzzyMatchSalesforce(e);return n?{account:n.name,accountId:n.id,confidence:95,source:"salesforce_match",evidence:`File in account folder "${e}" matched to "${n.name}"`}:{account:e,accountId:null,confidence:85,source:"title",evidence:`File located in Accounts/${e} folder`}}return{account:null,accountId:null,confidence:0,source:"none",evidence:"Not in Accounts folder"}}detectFromAttendees(r){let t=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com"],e=new Set;for(let s of r){let l=s.toLowerCase().match(/@([a-z0-9.-]+)/);if(l){let c=l[1];!c.includes("eudia.com")&&!t.includes(c)&&e.add(c)}}if(e.size===0)return{account:null,accountId:null,confidence:0,source:"attendee_domain",evidence:"No external domains"};for(let s of e){let o=s.split(".")[0],l=o.charAt(0).toUpperCase()+o.slice(1),c=this.fuzzyMatchSalesforce(l);if(c)return{account:c.name,accountId:c.id,confidence:75,source:"salesforce_match",evidence:`Matched attendee domain ${s} to "${c.name}"`}}let n=Array.from(e)[0],a=n.split(".")[0];return{account:a.charAt(0).toUpperCase()+a.slice(1),accountId:null,confidence:50,source:"attendee_domain",evidence:`Guessed from external attendee domain: ${n}`}}fuzzyMatchSalesforce(r){if(!r||this.salesforceAccounts.length===0)return null;let t=r.toLowerCase().trim();for(let e of this.salesforceAccounts)if(e.name?.toLowerCase()===t)return e;for(let e of this.salesforceAccounts)if(e.name?.toLowerCase().startsWith(t))return e;for(let e of this.salesforceAccounts)if(e.name?.toLowerCase().includes(t))return e;for(let e of this.salesforceAccounts)if(t.includes(e.name?.toLowerCase()))return e;return null}suggestAccounts(r,t=10){if(!r||r.length<2)return this.salesforceAccounts.slice(0,t).map(a=>({...a,score:0}));let e=r.toLowerCase(),n=[];for(let a of this.salesforceAccounts){let i=a.name?.toLowerCase()||"",s=0;i===e?s=100:i.startsWith(e)?s=90:i.includes(e)?s=70:e.includes(i)&&(s=50),s>0&&n.push({...a,score:s})}return n.sort((a,i)=>i.score-a.score).slice(0,t)}},Je=new Z,ke=["pipeline review","pipeline call","weekly pipeline","forecast call","forecast review","deal review","opportunity review","sales review","pipeline sync","forecast sync","deal sync","pipeline update","forecast meeting"];function de(O,r){if(O){let t=O.toLowerCase();for(let e of ke)if(t.includes(e))return{isPipelineMeeting:!0,confidence:95,evidence:`Title contains "${e}"`}}if(r&&r.length>=2){let t=["eudia.com","johnsonhana.com"];if(r.every(n=>{let a=n.toLowerCase().split("@")[1]||"";return t.some(i=>a.includes(i))})&&r.length>=3){if(O){let n=O.toLowerCase();if(["sync","review","update","weekly","team","forecast"].some(s=>n.includes(s)))return{isPipelineMeeting:!0,confidence:70,evidence:`All internal attendees (${r.length}) with team meeting signal`}}return{isPipelineMeeting:!1,confidence:40,evidence:"All internal attendees but no clear pipeline signal"}}}return{isPipelineMeeting:!1,confidence:0,evidence:"No pipeline meeting indicators found"}}function Te(O,r){let t="";return(r?.account||r?.opportunities?.length)&&(t=`
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
- Action items have clear owners`}function Ie(O,r){let t="";return r?.account&&(t=`
ACCOUNT CONTEXT:
- Account: ${r.account.name}
${r.account.owner?`- Owner: ${r.account.owner}`:""}
`),`You are a sales intelligence analyst for Eudia, an AI-powered legal technology company. You are analyzing a DEMO or PRESENTATION call.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies \u2014 contracting, compliance, and M&A due diligence.

${O?`CURRENT ACCOUNT: ${O}`:""}
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
`}function We(O,r){let t="";return r?.account&&(t=`
ACCOUNT CONTEXT:
- Account: ${r.account.name}
${r.account.owner?`- Owner: ${r.account.owner}`:""}
`),`You are a business meeting analyst. You are analyzing a GENERAL CHECK-IN or relationship meeting \u2014 not a sales discovery or demo.

${O?`ACCOUNT: ${O}`:""}
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
`}function je(O,r){let t="";return r?.account&&(t=`
ACCOUNT CONTEXT:
- Account: ${r.account.name}
${r.account.owner?`- Owner: ${r.account.owner}`:""}
`),`You are a Customer Success analyst for Eudia, an AI-powered legal technology company. You are analyzing a CUSTOMER SUCCESS call \u2014 not a sales discovery or demo.

Focus on the customer's experience, adoption, satisfaction, feature needs, and relationship health. This is NOT a sales qualification call.

${O?`ACCOUNT: ${O}`:""}
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
`}function $e(){return`You are a business meeting analyst. You are analyzing an INTERNAL team call \u2014 not a customer-facing meeting.

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
6. For strategic takeaways, only include implications that were actually discussed or clearly implied \u2014 do not speculate.`}function Pe(O){return`You are a sales operations analyst producing the weekly pipeline review summary for Eudia, an AI-powered legal technology company. You are processing the transcript of an internal team pipeline review meeting.
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
10. If the meeting discussed general topics like demo stability, growth motion, enablement, or hiring \u2014 capture these in the Growth & Cross-Team section, not mixed into account tables.`}var q=class O{constructor(r){this.userEmail="";this.serverUrl=r}setUserEmail(r){this.userEmail=r}setServerUrl(r){this.serverUrl=r}async reportErrorToTelemetry(r,t){try{await(0,N.requestUrl)({url:`${this.serverUrl}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"error",email:this.userEmail||"unknown",message:r,context:t,timestamp:new Date().toISOString()})})}catch{}}async transcribeAndSummarize(r,t,e,n,a,i,s){try{let o=a?.meetingType==="pipeline_review",l;o?l=Pe(a?.pipelineContext):s==="demo"?l=Ie(e,a):s==="general"?l=We(e,a):s==="internal"?l=$e():s==="cs"?l=je(e,a):l=Te(e,a);let c=12e4,d=(0,N.requestUrl)({url:`${this.serverUrl}/api/transcribe-and-summarize`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:r,mimeType:t,accountName:o?"Pipeline Review":e,accountId:n,meetingType:a?.meetingType||"discovery",userEmail:a?.userEmail||"",captureMode:i?.captureMode||"mic_only",hasVirtualDevice:i?.hasVirtualDevice||!1,context:a?{customerBrain:a.account?.customerBrain,opportunities:a.opportunities,contacts:a.contacts,userEmail:a.userEmail}:void 0,systemPrompt:l})}),u=new Promise((m,g)=>setTimeout(()=>g(new Error("Transcription timed out. Recording saved \u2014 retry via Cmd+P > Retry Transcription")),c)),h=await Promise.race([d,u]);return h.json.success?{success:!0,transcript:h.json.transcript||"",sections:this.normalizeSections(h.json.sections),duration:h.json.duration||0,diarizedTranscript:h.json.diarization?.formattedTranscript||void 0}:{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:h.json.error||"Transcription failed"}}catch(o){console.error("Server transcription error:",o),o.response&&console.error("Server response:",o.response);let l="";try{o.response?.json?.error?l=o.response.json.error:typeof o.response=="string"&&(l=JSON.parse(o.response).error||"")}catch{}let c=l||`Transcription failed: ${o.message}`;return o.message?.includes("413")?c="Audio file too large for server. Try a shorter recording.":o.message?.includes("500")?c=l||"Server error during transcription. Please try again.":(o.message?.includes("Failed to fetch")||o.message?.includes("NetworkError"))&&(c="Could not reach transcription server. Check your internet connection."),console.error("Final error message:",c),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:c}}}parseSections(r){let t=this.getEmptySections(),e={summary:"summary",attendees:"attendees","key stakeholders":"attendees","discussion context":"discussionContext","key quotes":"keyQuotes","quotable moments":"keyQuotes","meddicc signals":"meddiccSignals","product interest":"productInterest","pain points":"painPoints","customer feedback":"painPoints","buying triggers":"buyingTriggers","key dates":"keyDates","next steps":"nextSteps","action items":"actionItems","action items (internal)":"actionItems","deal signals":"dealSignals","risks & objections":"risksObjections","risks and objections":"risksObjections","competitive intelligence":"competitiveIntel","draft follow-up email":"emailDraft","follow-up email":"emailDraft"},n=/## ([^\n]+)\n([\s\S]*?)(?=## |$)/g,a;for(;(a=n.exec(r))!==null;){let i=a[1].trim().toLowerCase(),s=a[2].trim(),o=e[i];o&&(t[o]=s)}return t}normalizeSections(r){let t=this.getEmptySections();return r?{...t,...r}:t}async getMeetingContext(r){try{let t=await(0,N.requestUrl)({url:`${this.serverUrl}/api/meeting-context/${r}`,method:"GET",headers:{Accept:"application/json"}});return t.json.success?{success:!0,account:t.json.account,opportunities:t.json.opportunities,contacts:t.json.contacts,lastMeeting:t.json.lastMeeting}:{success:!1,error:t.json.error||"Failed to fetch context"}}catch(t){return console.error("Meeting context error:",t),{success:!1,error:t.message||"Network error"}}}async syncToSalesforce(r,t,e,n,a,i){try{let s=await(0,N.requestUrl)({url:`${this.serverUrl}/api/transcription/sync-to-salesforce`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:r,accountName:t,noteTitle:e,sections:n,transcript:a,meetingDate:i||new Date().toISOString(),syncedAt:new Date().toISOString()})});return s.json.success?{success:!0,customerBrainUpdated:s.json.customerBrainUpdated,eventCreated:s.json.eventCreated,eventId:s.json.eventId,contactsCreated:s.json.contactsCreated,tasksCreated:s.json.tasksCreated}:{success:!1,error:s.json.error||"Sync failed"}}catch(s){return console.error("Salesforce sync error:",s),{success:!1,error:s.message||"Network error"}}}getEmptySections(){return{summary:"",attendees:"",discussionContext:"",keyQuotes:"",meddiccSignals:"",productInterest:"",painPoints:"",buyingTriggers:"",keyDates:"",nextSteps:"",actionItems:"",dealSignals:"",risksObjections:"",competitiveIntel:"",emailDraft:""}}async liveQueryTranscript(r,t,e){if(!t||t.trim().length<50)return{success:!1,answer:"",error:"Not enough transcript captured yet. Keep recording for a few more minutes."};try{let n=await(0,N.requestUrl)({url:`${this.serverUrl}/api/live-query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:r,transcript:t,accountName:e,systemPrompt:this.buildLiveQueryPrompt()})});return n.json.success?{success:!0,answer:n.json.answer||"No relevant information found in the transcript."}:{success:!1,answer:"",error:n.json.error||"Query failed"}}catch(n){return console.error("Live query error:",n),{success:!1,answer:"",error:n.message||"Failed to query transcript"}}}async transcribeChunk(r,t){try{let e=await(0,N.requestUrl)({url:`${this.serverUrl}/api/transcribe-chunk`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:r,mimeType:t})});return e.json.success?{success:!0,text:e.json.text||""}:{success:!1,text:"",error:e.json.error||"Chunk transcription failed"}}catch(e){return console.error("Chunk transcription error:",e),{success:!1,text:"",error:e.message||"Failed to transcribe chunk"}}}buildLiveQueryPrompt(){return`You are an AI assistant helping a salesperson during an active customer call. 
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

`;let i=e.talkTime.repPercent,s=e.talkTime.customerPercent,o=e.talkTime.isHealthyRatio?"\u2705":"\u26A0\uFE0F";n+=`**Talk Time:** Rep ${i}% / Customer ${s}% ${o}
`;let l=Math.round(i/5),c=Math.round(s/5);if(n+=`\`${"\u2588".repeat(l)}${"\u2591".repeat(20-l)}\` Rep
`,n+=`\`${"\u2588".repeat(c)}${"\u2591".repeat(20-c)}\` Customer

`,e.coaching){let d=e.coaching;if(d.totalQuestions>0){let u=Math.round(d.openQuestions/d.totalQuestions*100);n+=`**Questions:** ${d.totalQuestions} total (${d.openQuestions} open, ${d.closedQuestions} closed - ${u}% open)
`}if(d.objections&&d.objections.length>0){let u=d.objections.filter(h=>h.handled).length;n+=`**Objections:** ${d.objections.length} raised, ${u} handled
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

`);let a=e?.enabled&&e?.formattedTranscript?e.formattedTranscript:t;if(a){let i=e?.enabled?"Full Transcript (Speaker-Attributed)":"Full Transcript";n+=`---

<details>
<summary><strong>${i}</strong></summary>

${a}

</details>
`}return n}static formatSectionsWithAudio(r,t,e,n){let a=this.formatSectionsForNote(r,t,n);return e&&(a+=`
---

## Recording

![[${e}]]
`),a}static formatContextForNote(r){if(!r.success)return"";let t=`## Pre-Call Context

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

`,t}async blobToBase64(r){return new Promise((t,e)=>{let n=new FileReader;n.onload=()=>{let i=n.result.split(",")[1];t(i)},n.onerror=e,n.readAsDataURL(r)})}async transcribeAudio(r,t){let e=r.size/1024/1024,n=r.type||"audio/webm";if(e>8)return console.log(`[Eudia] Large recording (${e.toFixed(1)}MB) \u2014 using chunked transcription`),this.transcribeAudioChunked(r,n,t);try{let a=await this.blobToBase64(r),i=t?.meetingType==="pipeline_review"?{success:!0,meetingType:"pipeline_review",pipelineContext:t.pipelineContext}:void 0,s=await this.transcribeAndSummarize(a,n,t?.accountName,t?.accountId,i,{captureMode:t?.captureMode,hasVirtualDevice:t?.hasVirtualDevice},t?.meetingTemplate);return{text:s.transcript,confidence:s.success?.95:0,duration:s.duration,sections:s.sections,diarizedTranscript:s.diarizedTranscript,error:s.error}}catch(a){return console.error("transcribeAudio error:",a),{text:"",confidence:0,duration:0,sections:this.getEmptySections(),error:a.message||"Transcription request failed"}}}static{this.CHUNK_MAX_RETRIES=3}static{this.CHUNK_RETRY_DELAYS=[1e4,3e4,6e4]}async transcribeChunkWithRetry(r,t,e,n){for(let a=0;a<=O.CHUNK_MAX_RETRIES;a++){if(a>0){let i=O.CHUNK_RETRY_DELAYS[a-1]||3e4;console.log(`[Eudia] Chunk ${e+1}/${n} retry ${a}/${O.CHUNK_MAX_RETRIES} in ${i/1e3}s...`),await new Promise(s=>setTimeout(s,i))}try{let s=(0,N.requestUrl)({url:`${this.serverUrl}/api/transcribe-chunk`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:r,mimeType:t})}),o=new Promise((d,u)=>setTimeout(()=>u(new Error(`Chunk request timed out after ${24e4/1e3}s`)),24e4)),l=await Promise.race([s,o]),c=l.json?.text||l.json?.transcript||"";if(l.json?.success)return a>0&&console.log(`[Eudia] Chunk ${e+1}/${n} succeeded on retry ${a}`),{text:c||"(silent segment)",duration:l.json.duration||0};console.warn(`[Eudia] Chunk ${e+1}/${n} attempt ${a+1} returned no text: ${l.json?.error||"unknown"}`)}catch(i){console.warn(`[Eudia] Chunk ${e+1}/${n} attempt ${a+1} failed: ${i.message}`)}}return null}async transcribeAudioChunked(r,t,e){let s=await r.arrayBuffer(),o=s.byteLength,l=Math.ceil(o/4145152),c=3;console.log(`[Eudia] Chunked transcription: ${(o/1024/1024).toFixed(1)}MB \u2192 ${l} chunks (${(49152/1024).toFixed(0)}KB overlap, batches of ${c})`);let d=16*1024,u=o/d,h=new Array(l),m=0,g=0;for(let b=0;b<l;b+=c){let f=Math.min(b+c,l);console.log(`[Eudia] Processing batch ${Math.floor(b/c)+1}/${Math.ceil(l/c)} (chunks ${b+1}-${f})`);let y=[];for(let A=b;A<f;A++){let x=A*4145152,k=Math.min(x+4194304,o),j=s.slice(x,k),E=new Blob([j],{type:t});console.log(`[Eudia] Queuing chunk ${A+1}/${l} (${((k-x)/1024/1024).toFixed(1)}MB, offset ${(x/1024/1024).toFixed(1)}MB)`),y.push((async()=>{try{let T=await this.blobToBase64(E),W=await this.transcribeChunkWithRetry(T,t,A,l);return{index:A,result:W}}catch(T){return console.error(`[Eudia] Chunk ${A+1}/${l} unexpected error: ${T.message}`),{index:A,result:null}}})())}let w=await Promise.allSettled(y);for(let A of w)if(A.status==="fulfilled"){let{index:x,result:k}=A.value;if(k)h[x]=k.text,m+=k.duration,console.log(`[Eudia] Chunk ${x+1}/${l} OK: ${k.text.length} chars`);else{g++;let j=x*4145152,E=Math.min(j+4194304,o),T=Math.round(j/o*u),W=Math.round(E/o*u),$=`${Math.floor(T/60)}:${(T%60).toString().padStart(2,"0")}`,P=`${Math.floor(W/60)}:${(W%60).toString().padStart(2,"0")}`;h[x]=`

[~${$} \u2013 ${P} \u2014 audio not transcribed (chunk ${x+1}/${l} failed after ${O.CHUNK_MAX_RETRIES+1} attempts)]

`,console.error(`[Eudia] Chunk ${x+1}/${l} permanently failed \u2014 gap marker inserted`),this.reportErrorToTelemetry(`Chunk ${x+1}/${l} failed after ${O.CHUNK_MAX_RETRIES+1} attempts`,{chunkIndex:x,chunkCount:l,gapStart:$,gapEnd:P})}}else g++,console.error(`[Eudia] Chunk in batch rejected: ${A.reason}`)}let v=h.filter(b=>b!=null);if(v.filter(b=>!b.includes("\u2014 audio not transcribed")).length===0)return{text:"",confidence:0,duration:0,sections:this.getEmptySections(),error:`All ${l} chunks failed to transcribe after retries. Server may be unavailable.`};g>0&&console.warn(`[Eudia] ${g}/${l} chunks failed after retries \u2014 partial transcript with gap markers`);let S=v.join(`

`);console.log(`[Eudia] Combined transcript: ${S.length} chars from ${l} chunks (${g} gaps)`);try{let b=await this.processTranscription(S,{accountName:e?.accountName,accountId:e?.accountId});return{text:S,confidence:g===0?.9:Math.max(.3,.9-g/l*.6),duration:m,sections:b,...g>0?{error:`${g} of ${l} audio chunks could not be transcribed. Look for [audio not transcribed] markers in the transcript.`}:{}}}catch(b){return console.error("[Eudia] Summarization failed after chunked transcription:",b.message),{text:S,confidence:.5,duration:m,sections:this.getEmptySections(),error:`Transcription succeeded but summarization failed: ${b.message}`}}}async processTranscription(r,t){if(!r||r.trim().length===0)return this.getEmptySections();try{let e=await(0,N.requestUrl)({url:`${this.serverUrl}/api/process-sections`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript:r,accountName:t?.accountName,context:t})});if(e.json?.success&&e.json?.sections){let n=e.json.sections;return{summary:n.summary||"",painPoints:n.painPoints||n.keyPoints||"",productInterest:n.productInterest||"",meddiccSignals:n.meddiccSignals||"",nextSteps:n.nextSteps||"",actionItems:n.actionItems||"",keyDates:n.keyDates||"",buyingTriggers:n.buyingTriggers||"",dealSignals:n.dealSignals||"",risksObjections:n.risksObjections||n.concerns||"",competitiveIntel:n.competitiveIntel||"",attendees:n.attendees||"",transcript:r}}return console.warn("Server process-sections returned no sections, using fallback"),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:r}}catch(e){return console.error("processTranscription server error:",e),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:r}}}};var Y=require("obsidian"),R=class O{constructor(r,t,e="America/New_York"){this.serverUrl=r,this.userEmail=t.toLowerCase(),this.timezone=e}setUserEmail(r){this.userEmail=r.toLowerCase()}setServerUrl(r){this.serverUrl=r}setTimezone(r){this.timezone=r}async getTodaysMeetings(r=!1){if(!this.userEmail)return{success:!1,date:new Date().toISOString().split("T")[0],email:"",meetingCount:0,meetings:[],error:"User email not configured"};try{let t=encodeURIComponent(this.timezone),e=r?"&forceRefresh=true":"";return(await(0,Y.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/today?timezone=${t}${e}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(t){return console.error("Failed to fetch today's meetings:",t),{success:!1,date:new Date().toISOString().split("T")[0],email:this.userEmail,meetingCount:0,meetings:[],error:t.message||"Failed to fetch calendar"}}}async getWeekMeetings(r=!1){if(!this.userEmail)return{success:!1,startDate:"",endDate:"",email:"",totalMeetings:0,byDay:{},error:"User email not configured"};try{let t=encodeURIComponent(this.timezone),e=r?"&forceRefresh=true":"";return(await(0,Y.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/week?timezone=${t}${e}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(t){return console.error("Failed to fetch week's meetings:",t),{success:!1,startDate:"",endDate:"",email:this.userEmail,totalMeetings:0,byDay:{},error:t.message||"Failed to fetch calendar"}}}async getMeetingsInRange(r,t){if(!this.userEmail)return[];try{let e=r.toISOString().split("T")[0],n=t.toISOString().split("T")[0],a=await(0,Y.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${e}&end=${n}`,method:"GET",headers:{Accept:"application/json"}});return a.json.success?a.json.meetings||[]:[]}catch(e){return console.error("Failed to fetch calendar range:",e),[]}}async getCurrentMeeting(){let r=await this.getTodaysMeetings();if(!r.success||r.meetings.length===0)return{meeting:null,isNow:!1};let t=new Date;for(let e of r.meetings){let n=O.safeParseDate(e.start),a=O.safeParseDate(e.end);if(t>=n&&t<=a)return{meeting:e,isNow:!0};let i=(n.getTime()-t.getTime())/(1e3*60);if(i>0&&i<=15)return{meeting:e,isNow:!1,minutesUntilStart:Math.ceil(i)}}return{meeting:null,isNow:!1}}async getMeetingsForAccount(r){let t=await this.getWeekMeetings();if(!t.success)return[];let e=[];Object.values(t.byDay).forEach(a=>{e.push(...a)});let n=r.toLowerCase();return e.filter(a=>a.accountName?.toLowerCase().includes(n)||a.subject.toLowerCase().includes(n)||a.attendees.some(i=>i.email.toLowerCase().includes(n.split(" ")[0])))}static formatMeetingForNote(r){let t=r.attendees.filter(e=>e.isExternal!==!1).map(e=>e.name||e.email.split("@")[0]).slice(0,5).join(", ");return{title:r.subject,attendees:t,meetingStart:r.start,accountName:r.accountName}}static getDayName(r){let t;r.length===10&&r.includes("-")?t=new Date(r+"T00:00:00"):t=new Date(r);let e=new Date;e.setHours(0,0,0,0);let n=new Date(t);n.setHours(0,0,0,0);let a=Math.round((n.getTime()-e.getTime())/(1e3*60*60*24));return a===0?"Today":a===1?"Tomorrow":t.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}static formatTime(r,t){let e=r;e&&!e.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(e)&&(e=e+"Z");let n=new Date(e);if(isNaN(n.getTime()))return r;let a={hour:"numeric",minute:"2-digit",hour12:!0};return t&&(a.timeZone=t),n.toLocaleTimeString("en-US",a)}static safeParseDate(r){if(!r)return new Date(NaN);let t=r;return!t.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(t)&&(t=t+"Z"),new Date(t)}static getMeetingDuration(r,t){let e=O.safeParseDate(r),n=O.safeParseDate(t);return Math.round((n.getTime()-e.getTime())/(1e3*60))}};var Ne=["ai-contracting-tech","ai-contracting-services","ai-compliance-tech","ai-compliance-services","ai-ma-tech","ai-ma-services","sigma"],De=["metrics-identified","economic-buyer-identified","decision-criteria-discussed","decision-process-discussed","pain-confirmed","champion-identified","competition-mentioned"],Fe=["progressing","stalled","at-risk","champion-engaged","early-stage"],Me=["discovery","demo","negotiation","qbr","implementation","follow-up"],Re=`You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

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

`)}async extractTagsViaServer(r){let t=await fetch(`${this.serverUrl}/api/extract-tags`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:r,openaiApiKey:this.openaiApiKey})});if(!t.ok)throw new Error(`Server returned ${t.status}`);let e=await t.json();if(!e.success)throw new Error(e.error||"Tag extraction failed");return{success:!0,tags:this.validateAndNormalizeTags(e.tags)}}async extractTagsLocal(r){if(!this.openaiApiKey)return{success:!1,tags:this.getEmptyTags(),error:"No OpenAI API key configured"};try{let t=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:Re},{role:"user",content:`Extract tags from this meeting content:

${r}`}],temperature:.1,response_format:{type:"json_object"}})});if(!t.ok)throw new Error(`OpenAI returned ${t.status}`);let n=(await t.json()).choices?.[0]?.message?.content;if(!n)throw new Error("No content in response");let a=JSON.parse(n);return{success:!0,tags:this.validateAndNormalizeTags(a)}}catch(t){return console.error("Local tag extraction error:",t),{success:!1,tags:this.getEmptyTags(),error:t.message||"Tag extraction failed"}}}extractTagsRuleBased(r){let t=Object.values(r).join(" ").toLowerCase(),e={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:.4};return(t.includes("contract")||t.includes("contracting"))&&(t.includes("service")?e.product_interest.push("ai-contracting-services"):e.product_interest.push("ai-contracting-tech")),t.includes("compliance")&&e.product_interest.push("ai-compliance-tech"),(t.includes("m&a")||t.includes("due diligence")||t.includes("acquisition"))&&e.product_interest.push("ai-ma-tech"),t.includes("sigma")&&e.product_interest.push("sigma"),(t.includes("metric")||t.includes("%")||t.includes("roi")||t.includes("save"))&&e.meddicc_signals.push("metrics-identified"),(t.includes("budget")||t.includes("cfo")||t.includes("economic buyer"))&&e.meddicc_signals.push("economic-buyer-identified"),(t.includes("pain")||t.includes("challenge")||t.includes("problem")||t.includes("struggle"))&&e.meddicc_signals.push("pain-confirmed"),(t.includes("champion")||t.includes("advocate")||t.includes("sponsor"))&&e.meddicc_signals.push("champion-identified"),(t.includes("competitor")||t.includes("alternative")||t.includes("vs")||t.includes("compared to"))&&e.meddicc_signals.push("competition-mentioned"),(t.includes("next step")||t.includes("follow up")||t.includes("schedule"))&&(e.deal_health="progressing"),(t.includes("concern")||t.includes("objection")||t.includes("hesitant")||t.includes("risk"))&&(e.deal_health="at-risk"),t.includes("demo")||t.includes("show you")||t.includes("demonstration")?e.meeting_type="demo":t.includes("pricing")||t.includes("negotiat")||t.includes("contract terms")?e.meeting_type="negotiation":t.includes("quarterly")||t.includes("qbr")||t.includes("review")?e.meeting_type="qbr":(t.includes("implementation")||t.includes("onboard")||t.includes("rollout"))&&(e.meeting_type="implementation"),{success:!0,tags:e}}validateAndNormalizeTags(r){let t={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:r.confidence||.8};return Array.isArray(r.product_interest)&&(t.product_interest=r.product_interest.filter(e=>Ne.includes(e))),Array.isArray(r.meddicc_signals)&&(t.meddicc_signals=r.meddicc_signals.filter(e=>De.includes(e))),Fe.includes(r.deal_health)&&(t.deal_health=r.deal_health),Me.includes(r.meeting_type)&&(t.meeting_type=r.meeting_type),Array.isArray(r.key_stakeholders)&&(t.key_stakeholders=r.key_stakeholders.slice(0,10)),t}getEmptyTags(){return{product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:0}}static formatTagsForFrontmatter(r){return{product_interest:r.product_interest.length>0?r.product_interest:null,meddicc_signals:r.meddicc_signals.length>0?r.meddicc_signals:null,deal_health:r.deal_health,meeting_type:r.meeting_type,key_stakeholders:r.key_stakeholders.length>0?r.key_stakeholders:null,tag_confidence:Math.round(r.confidence*100)}}static generateTagSummary(r){let t=[];return r.product_interest.length>0&&t.push(`**Products:** ${r.product_interest.join(", ")}`),r.meddicc_signals.length>0&&t.push(`**MEDDICC:** ${r.meddicc_signals.join(", ")}`),t.push(`**Deal Health:** ${r.deal_health}`),t.push(`**Meeting Type:** ${r.meeting_type}`),t.join(" | ")}};var ue=["keigan.pesenti@eudia.com","michael.ayres@eudia.com","michael.ayers@eudia.com","mike.flynn@eudia.com","michael.flynn@eudia.com","zack@eudia.com","zach@eudia.com","ben.brosnahan@eudia.com"],pe=["omar@eudia.com","david@eudia.com","ashish@eudia.com","siddharth.saxena@eudia.com"],he={"mitchell.loquaci@eudia.com":{name:"Mitchell Loquaci",region:"US",role:"RVP Sales"},"stephen.mulholland@eudia.com":{name:"Stephen Mulholland",region:"EMEA",role:"VP Sales"},"riona.mchale@eudia.com":{name:"Riona McHale",region:"IRE_UK",role:"Head of Sales"}},me=["nikhita.godiwala@eudia.com","jon.dedych@eudia.com","farah.haddad@eudia.com"],Le=["nikhita.godiwala@eudia.com"],He={"nikhita.godiwala@eudia.com":["jon.dedych@eudia.com","farah.haddad@eudia.com"]},F=[{id:"001Hp00003kIrQDIA0",name:"Accenture",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"accenture.com",industry:"Information Technology Services",csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrEOIA0",name:"AES",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"alesaei-aes.com",industry:"Utilities: Gas and Electric",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrCyIAK",name:"Airbnb",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"airbnb.com",industry:"Internet Services and Retailing",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFrdIAG",name:"Airship Group Inc",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"airship.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrEeIAK",name:"Amazon",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"amazon.com",industry:"Internet Services and Retailing",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000TUdXwIAL",name:"Anthropic",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"anthropic.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000wvc5aIAA",name:"AppliedAI",type:"New",isOwned:!1,hadOpportunity:!0,website:"https://www.applied-ai.com/",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000mCFsTIAW",name:"Arabic Computer Systems",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"acs.com.sa",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Hp00003kIrEyIAK",name:"Aramark Ireland",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"aramark.ie",industry:"Diversified Outsourcing Services",csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000p1hYbIAI",name:"Army Corps of Engineers",type:"New",isOwned:!1,hadOpportunity:!0,website:"https://www.usace.army.mil/",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Wj00000mCFrgIAG",name:"Aryza",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"aryza.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000Y0g8ZIAR",name:"Asana",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"asana.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mI7NaIAK",name:"Aviva Insurance",type:"New",isOwned:!1,hadOpportunity:!0,website:"aviva.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000fFuFMIA0",name:"Bank of Ireland",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"bankofireland.com",industry:"Banking",csmName:null,ownerName:"Tom Clancy"},{id:"001Hp00003kJ9pXIAS",name:"Bayer",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"bayer.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrFVIA0",name:"Best Buy",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"bestbuy.com",industry:"Specialty Retailers: Other",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000WTMCRIA5",name:"BNY Mellon",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"bny.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kIrE3IAK",name:"Cargill",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"cargill.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrE4IAK",name:"Chevron",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"chevron.com",industry:"Petroleum Refining",csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrGKIA0",name:"CHS",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"chsinc.com",industry:"Food Production",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrE5IAK",name:"Coherent",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"coherent.com",industry:"Semiconductors and Lasers",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFrkIAG",name:"Coillte",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"coillte.ie",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000mHDBoIAO",name:"Coimisiun na Mean",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"cnam.ie",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFtTIAW",name:"Coleman Legal",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"colemanlegalpllc.com",industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"001Wj00000mCFqtIAG",name:"CommScope Technologies",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"commscope.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFsHIAW",name:"Consensys",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrGeIAK",name:"Corebridge Financial",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"corebridgefinancial.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000c9oCvIAI",name:"Cox Media Group",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"cmg.com",industry:null,csmName:null,ownerName:"Justin Hills"},{id:"001Wj00000pLPAyIAO",name:"Creed McStay",type:"New",isOwned:!1,hadOpportunity:!0,website:"creedmcstay.ie",industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"001Wj00000mCFsBIAW",name:"Datalex",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"datalex.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000mCFrlIAG",name:"Davy",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"davy.ie",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000Y0jPmIAJ",name:"Delinea",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"delinea.com",industry:null,csmName:null,ownerName:"Justin Hills"},{id:"001Wj00000mCFscIAG",name:"Department of Children, Disability and Equality",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"https://www.gov.ie/en/department-of-children-disability-and-equality/",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Wj00000mCFsNIAW",name:"Department of Climate, Energy and the Environment",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"https://www.gov.ie/en/department-of-climate-energy-and-the-environment/",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Hp00003kIrE6IAK",name:"DHL",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"dhl.com",industry:"Logistics and Shipping",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000aZvt9IAC",name:"Dolby",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"dolbyblaissegee.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrDMIA0",name:"Dropbox",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"dropbox.com",industry:"Cloud Storage and Software",csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrDaIAK",name:"Duracell",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"duracell.com",industry:"Consumer goods",csmName:null,ownerName:"Justin Hills"},{id:"001Hp00003kIrE7IAK",name:"ECMS",type:"Customer - No Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"ecmsglobal-jp.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrHNIA0",name:"Ecolab",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"ecolab.com",industry:"Chemicals",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFszIAG",name:"Electricity Supply Board",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"esb.ie",industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"001Wj00000mCFsUIAW",name:"ESB NI/Electric Ireland",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"esb.ie",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Wj00000hkk0jIAA",name:"Etsy",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"etsy.com",industry:"information technology & services",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrIAIA0",name:"Fox",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"foxcorporation.com",industry:"Entertainment",csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kJ9oeIAC",name:"Fresh Del Monte",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"freshdelmonte.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kIrIJIA0",name:"GE Vernova",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"gevernova.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Hp00003kIrISIA0",name:"Gilead Sciences",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"gilead.com",industry:"Pharmaceuticals",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000mCFrcIAG",name:"Glanbia",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"glanbia.com",industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"001Wj00000mCFt1IAG",name:"Goodbody Stockbrokers",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"goodbody.ie",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Hp00003kIrE8IAK",name:"Graybar Electric",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"graybar.com",industry:"Wholesalers: Diversified",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000mCFseIAG",name:"Hayes Solicitors LLP",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"hayes-solicitors.ie",industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"001Hp00003kIrCnIAK",name:"Home Depot",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"thdroadcompanion.com",industry:"Specialty Retailers: Other",csmName:null,ownerName:"Mitch Loquaci"},{id:"001Wj00000mCFs5IAG",name:"Indeed",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"indeed.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrJ9IAK",name:"Intuit",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"intuit.com",industry:"Computer Software",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrE9IAK",name:"IQVIA",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"onekeydata.com",industry:"Health Care: Pharmacy and Other Services",csmName:null,ownerName:"Sean Boyd"},{id:"001Wj00000mCFtMIAW",name:"Kellanova",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"www.kellanova.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrJOIA0",name:"Keurig Dr Pepper",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"keurigdrpepper.com",industry:"Beverages",csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000hkk0zIAA",name:"Kingspan",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"kingspan.com",industry:"building materials",csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFsoIAG",name:"Mediolanum",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"mediolanum.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrD8IAK",name:"Medtronic",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"medtronic.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kJ9lGIAS",name:"Meta",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"meta.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrDeIAK",name:"National Grid",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"nationalgrid.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000VVJ31IAH",name:"NATO",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"https://www.nato.int/",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Hp00003kIrKmIAK",name:"Northern Trust Management Services",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"northerntrust.com",industry:"Commercial Banks",csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000cpxt0IAA",name:"Novelis",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"novelis.com",industry:null,csmName:null,ownerName:"Mitch Loquaci"},{id:"001Wj00000mCFr6IAG",name:"NTMA",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"ntma.ie",industry:null,csmName:null,ownerName:"Emer Flynn"},{id:"001Wj00000TV1WzIAL",name:"OpenAi",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"openai.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000mCFrIIAW",name:"Orsted",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"orsted.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000bzz9MIAQ",name:"Peregrine Hospitality",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"peregrinehg.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000ZDPUIIA5",name:"Perrigo Pharma",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"perrigo.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrLNIA0",name:"Petsmart",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"petsmart.com",industry:"Retailing",csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000kNp2XIAS",name:"Plusgrade",type:"New",isOwned:!1,hadOpportunity:!0,website:"plusgrade.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kKXSIIA4",name:"Pure Storage",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"purestorage.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000u0eJpIAI",name:"Re-Turn",type:"New",isOwned:!1,hadOpportunity:!0,website:"https://re-turn.ie/",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Hp00003kIrD9IAK",name:"Salesforce",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"salesforce.com",industry:"Computer Software",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mI9NmIAK",name:"Sequoia Climate Fund",type:"New",isOwned:!1,hadOpportunity:!0,website:"sequoiaclimate.org",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrMKIA0",name:"ServiceNow",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"servicenow.com",industry:"Computer Software",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFrMIAW",name:"Sisk Group",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"sisk.com",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Hp00003kIrECIA0",name:"Southwest Airlines",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"southwest.com",industry:"Airlines",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000lxbYRIAY",name:"Spark Brighter Thinking",type:"New",isOwned:!1,hadOpportunity:!0,website:"hellospark.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000c9oD6IAI",name:"Stripe",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"stripe.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000bzz9TIAQ",name:"Tailored Brands",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"tailoredbrands.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000mCFs0IAG",name:"Taoglas Limited",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"taoglas.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000iS9AJIA0",name:"TE Connectivity",type:"New",isOwned:!1,hadOpportunity:!0,website:"te.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000mCFtPIAW",name:"Teamwork.com",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"teamwork.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000PjGDaIAN",name:"The Weir Group PLC",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"global.weir",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrNBIA0",name:"The Wonderful Company",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"wonderful.com",industry:"Multicompany",csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000SFiOvIAL",name:"TikTok",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"tiktok.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000ZDXTRIA5",name:"Tinder LLC",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"tinder.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrCwIAK",name:"Toshiba US",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"toshiba.com",industry:"Electronics and IT Solutions",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000bWBkeIAG",name:"U.S. Air Force",type:"New",isOwned:!1,hadOpportunity:!0,website:"eprc.or.ug",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Wj00000bWBlEIAW",name:"Udemy",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"udemy.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFtOIAW",name:"Uisce Eireann (Irish Water)",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"water.ie",industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"001Wj00000bn8VSIAY",name:"Vista Equity Partners",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"vistaequitypartners.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000p1SuZIAU",name:"Vulcan Special Ops",type:"New",isOwned:!1,hadOpportunity:!0,website:"vulcan-v.com",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Hp00003kIrNwIAK",name:"W.W. Grainger",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"grainger.com",industry:"Wholesalers: Diversified",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000bzz9NIAQ",name:"Wealth Partners Capital Group",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"wealthpcg.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000ZLVpTIAX",name:"Wellspring Philanthropic Fund",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"wpfund.org",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrOAIA0",name:"Western Digital",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"westerndigital.com",industry:"Computers, Office Equipment",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrOLIA0",name:"World Wide Technology",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"wwt.com",industry:"Technology Hardware & Equipment",csmName:null,ownerName:"Julie Stefanich"}],_e={US:["asad.hussain@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com","rajeev.patel@eudia.com"],EMEA:["greg.machale@eudia.com","tom.clancy@eudia.com","nicola.fratini@eudia.com","nathan.shine@eudia.com","stephen.mulholland@eudia.com"],IRE_UK:["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com","riona.mchale@eudia.com"]},ee={"mitchell.loquaci@eudia.com":["asad.hussain@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com","rajeev.patel@eudia.com"],"stephen.mulholland@eudia.com":["greg.machale@eudia.com","tom.clancy@eudia.com","conor.molloy@eudia.com","nathan.shine@eudia.com","nicola.fratini@eudia.com"],"riona.mchale@eudia.com":["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com"]},Be={"sean.boyd@eudia.com":"US","riley.stack@eudia.com":"US","rajeev.patel@eudia.com":"US"};function ge(O){let r=O.toLowerCase().trim();return ue.includes(r)?"admin":pe.includes(r)?"exec":r in he?"sales_leader":me.includes(r)?"cs":"bl"}function Ue(O){let r=O.toLowerCase().trim();return he[r]?.region||null}function ye(O){return _e[O]||[]}function Ge(O){let r=O.toLowerCase().trim();if(ee[r])return ee[r];let t=Ue(r);return t?ye(t):[]}function M(O){let r=O.toLowerCase().trim();return ue.includes(r)||pe.includes(r)}function H(O){let r=O.toLowerCase().trim();return me.includes(r)}function G(O){let r=O.toLowerCase().trim();return Le.includes(r)}function fe(O){let r=O.toLowerCase().trim();return He[r]||[]}var D={version:"2026-02-09",lastUpdated:"2026-02-09",businessLeads:{"alex.fox@eudia.com":{email:"alex.fox@eudia.com",name:"Alex Fox",accounts:[{id:"001Wj00000mCFsT",name:"Arabic Computer Systems",hadOpportunity:!0},{id:"001Wj00000mCFsO",name:"Brown Thomas",hadOpportunity:!0},{id:"001Wj00000mCFt2",name:"Byrne Wallace Shields",hadOpportunity:!0},{id:"001Wj00000mCFsu",name:"Corrigan & Corrigan Solicitors LLP",hadOpportunity:!0},{id:"001Wj00000pzTPY",name:"Defence Forces Tribunal",hadOpportunity:!1},{id:"001Wj00000mCFsc",name:"Department of Children, Disability and Equality",hadOpportunity:!0},{id:"001Wj00000mCFsN",name:"Department of Climate, Energy and the Environment",hadOpportunity:!0},{id:"001Wj00000mCFrZ",name:"Department of Housing",hadOpportunity:!0},{id:"001Wj00000mCFsU",name:"ESB NI/Electric Ireland",hadOpportunity:!0},{id:"001Wj00000pzTPV",name:"MW Keller",hadOpportunity:!1},{id:"001Wj00000pzTPX",name:"Murphy's Ice Cream",hadOpportunity:!1},{id:"001Wj00000mCFrM",name:"Sisk Group",hadOpportunity:!0}]},"ananth.cherukupally@eudia.com":{email:"ananth.cherukupally@eudia.com",name:"Ananth Cherukupally",accounts:[{id:"001Wj00000PfssX",name:"AGC Partners",hadOpportunity:!1},{id:"001Wj00000ahBZt",name:"AMETEK",hadOpportunity:!1},{id:"001Wj00000ahBZr",name:"Accel-KKR",hadOpportunity:!1},{id:"001Wj00000bwVu4",name:"Addtech",hadOpportunity:!1},{id:"001Wj00000YNV7Z",name:"Advent",hadOpportunity:!0},{id:"001Wj00000VZScK",name:"Affinity Consulting Group",hadOpportunity:!1},{id:"001Wj00000lyFyt",name:"Albacore Capital Group",hadOpportunity:!0},{id:"001Wj00000nlL88",name:"Alder",hadOpportunity:!0},{id:"001Wj00000XumF6",name:"Alpine Investors",hadOpportunity:!0},{id:"001Wj00000QTbLP",name:"Alvarez AI Advisors",hadOpportunity:!1},{id:"001Wj00000ahFCJ",name:"American Pacific Group",hadOpportunity:!1},{id:"001Wj00000ah6dg",name:"Angeles Equity Partners",hadOpportunity:!1},{id:"001Hp00003kIrEu",name:"Apollo Global Management",hadOpportunity:!0},{id:"001Wj00000cl5pq",name:"Arizona MBDA Business Center",hadOpportunity:!1},{id:"001Wj00000nlRev",name:"Attack Capital",hadOpportunity:!0},{id:"001Wj00000ahFBx",name:"Audax Group",hadOpportunity:!1},{id:"001Wj00000YhZAE",name:"Beacon Software",hadOpportunity:!0},{id:"001Wj00000cfg0c",name:"Beekers Capital",hadOpportunity:!1},{id:"001Wj00000bwVsk",name:"Bertram Capital",hadOpportunity:!1},{id:"001Wj00000ahBa0",name:"Bessemer Venture Partners",hadOpportunity:!1},{id:"001Wj00000lzDWj",name:"BlueEarth Capital",hadOpportunity:!0},{id:"001Wj00000ah6dZ",name:"Brentwood Associates",hadOpportunity:!1},{id:"001Wj00000ah6dL",name:"Brown & Brown",hadOpportunity:!1},{id:"001Hp00003kIrCh",name:"CBRE Group",hadOpportunity:!0},{id:"001Wj00000cejJz",name:"CVC",hadOpportunity:!0},{id:"001Wj00000ahFCV",name:"Caltius Equity Partners",hadOpportunity:!1},{id:"001Wj00000ahFBz",name:"Capstone Partners",hadOpportunity:!1},{id:"001Wj00000nlB0g",name:"Capvest",hadOpportunity:!0},{id:"001Hp00003kIrFy",name:"Cardinal Health",hadOpportunity:!0},{id:"001Hp00003kIrDg",name:"Carlyle",hadOpportunity:!0},{id:"001Wj00000PbIZ8",name:"Cascadia Capital",hadOpportunity:!1},{id:"001Wj00000ah6dW",name:"Catterton",hadOpportunity:!1},{id:"001Wj00000ahFC7",name:"Century Park Capital Partners",hadOpportunity:!1},{id:"001Wj00000Rjuhj",name:"Citadel",hadOpportunity:!0},{id:"001Wj00000ah6dn",name:"Clearlake Capital Group",hadOpportunity:!1},{id:"001Wj00000ah6dY",name:"Cognex Corporation",hadOpportunity:!1},{id:"001Wj00000ah6do",name:"Comvest Partners",hadOpportunity:!1},{id:"001Wj00000ah6dv",name:"Constellation Software",hadOpportunity:!0},{id:"001Wj00000ahFCI",name:"Cortec Group",hadOpportunity:!1},{id:"001Wj00000ahBa4",name:"Crosslink Capital",hadOpportunity:!1},{id:"001Wj00000ahFCR",name:"DCA Partners",hadOpportunity:!1},{id:"001Wj00000ah6dc",name:"DFO Management",hadOpportunity:!1},{id:"001Wj00000W8fEu",name:"Davis Polk",hadOpportunity:!1},{id:"001Wj00000crdDR",name:"Delcor",hadOpportunity:!0},{id:"001Wj00000ahFCM",name:"Diploma",hadOpportunity:!1},{id:"001Wj00000kcANH",name:"Discord",hadOpportunity:!0},{id:"001Wj00000ahFCU",name:"Doughty Hanson & Co",hadOpportunity:!1},{id:"001Wj00000ah6dd",name:"Edgewater Capital Partners",hadOpportunity:!1},{id:"001Wj00000Y64qh",name:"Emigrant Bank",hadOpportunity:!0},{id:"001Wj00000ah6dM",name:"Encore Consumer Capital",hadOpportunity:!1},{id:"001Wj00000ahFCL",name:"Endeavour Capital",hadOpportunity:!1},{id:"001Wj00000ah6di",name:"FFL Partners",hadOpportunity:!1},{id:"001Wj00000ah6dV",name:"Falfurrias Capital Partners",hadOpportunity:!1},{id:"001Wj00000ah6dU",name:"FirstService Corporation",hadOpportunity:!1},{id:"001Wj00000nlLZU",name:"Five Capital",hadOpportunity:!0},{id:"001Wj00000ahFCK",name:"Flexpoint Ford",hadOpportunity:!1},{id:"001Wj00000QkjJL",name:"Floodgate",hadOpportunity:!1},{id:"001Wj00000bwVu6",name:"Fortive Corporation",hadOpportunity:!1},{id:"001Wj00000ahFCa",name:"Foundry Group",hadOpportunity:!1},{id:"001Hp00003kIrID",name:"Freeport-McMoRan",hadOpportunity:!0},{id:"001Wj00000bwVuN",name:"Fremont Partners",hadOpportunity:!1},{id:"001Wj00000ahFCO",name:"Frontenac Company",hadOpportunity:!1},{id:"001Hp00003kIrII",name:"GE Healthcare",hadOpportunity:!0},{id:"001Hp00003kIrIJ",name:"GE Vernova",hadOpportunity:!0},{id:"001Wj00000lz2Jb",name:"GTIS Partners",hadOpportunity:!0},{id:"001Wj00000ah6dh",name:"Gallant Capital Partners",hadOpportunity:!1},{id:"001Hp00003kJ9oP",name:"General Catalyst",hadOpportunity:!0},{id:"001Wj00000ah6dr",name:"Genstar Capital",hadOpportunity:!1},{id:"001Hp00003kIrIT",name:"GlaxoSmithKline",hadOpportunity:!0},{id:"001Wj00000ahFCb",name:"Goldner Hawn Johnson & Morrison",hadOpportunity:!1},{id:"001Wj00000ah6du",name:"Great Point Partners",hadOpportunity:!1},{id:"001Wj00000ahBZx",name:"Greenoaks Capital",hadOpportunity:!0},{id:"001Wj00000ahFCB",name:"Greenspring Associates",hadOpportunity:!1},{id:"001Wj00000ahFCX",name:"Group 206",hadOpportunity:!1},{id:"001Wj00000ahBZz",name:"Gryphon Investors",hadOpportunity:!1},{id:"001Wj00000ah6dT",name:"HEICO Corporation",hadOpportunity:!1},{id:"001Wj00000cy4m1",name:"HG",hadOpportunity:!0},{id:"001Wj00000ahBZn",name:"HGGC",hadOpportunity:!1},{id:"001Wj00000ah6df",name:"Halma",hadOpportunity:!1},{id:"001Wj00000ah48X",name:"Harvest Partners",hadOpportunity:!1},{id:"001Wj00000ahFCS",name:"HealthpointCapital",hadOpportunity:!1},{id:"001Wj00000lzDtJ",name:"Heidrick & Struggles",hadOpportunity:!0},{id:"001Hp00003kIrIl",name:"Hellman & Friedman",hadOpportunity:!0},{id:"001Wj00000ahFCW",name:"Highview Capital",hadOpportunity:!1},{id:"001Wj00000Pg7rW",name:"Houlihan Lokey",hadOpportunity:!1},{id:"001Wj00000ahFCH",name:"Housatonic Partners",hadOpportunity:!1},{id:"001Wj00000ahFC9",name:"Huron Capital",hadOpportunity:!1},{id:"001Wj00000ahFC6",name:"Indutrade",hadOpportunity:!1},{id:"001Wj00000ahBa5",name:"Insight Partners",hadOpportunity:!1},{id:"001Wj00000nlbr9",name:"Intercorp",hadOpportunity:!0},{id:"001Wj00000ahFCA",name:"Irving Place Capital",hadOpportunity:!1},{id:"001Wj00000bwVtt",name:"Jack Henry & Associates",hadOpportunity:!1},{id:"001Wj00000Pg9oT",name:"Jackim Woods & Co.",hadOpportunity:!1},{id:"001Wj00000ah6de",name:"Jonas Software",hadOpportunity:!1},{id:"001Hp00003kIrJU",name:"KKR",hadOpportunity:!1},{id:"001Wj00000ahBa1",name:"Kayne Anderson Capital Advisors",hadOpportunity:!1},{id:"001Wj00000m5kud",name:"Kelly Services",hadOpportunity:!0},{id:"001Wj00000ahBZp",name:"Keysight Technologies",hadOpportunity:!1},{id:"001Wj00000ahFC8",name:"L Squared Capital Partners",hadOpportunity:!1},{id:"001Wj00000QGTNV",name:"LCS Forensic Accounting & Advisory",hadOpportunity:!1},{id:"001Wj00000ahFCD",name:"Lagercrantz Group",hadOpportunity:!1},{id:"001Wj00000ahBZs",name:"Levine Leichtman Capital Partners",hadOpportunity:!1},{id:"001Wj00000Z6zhP",name:"Liberty Mutual Insurance",hadOpportunity:!0},{id:"001Wj00000ahFCC",name:"Lifco",hadOpportunity:!1},{id:"001Wj00000ahFCP",name:"LightBay Capital",hadOpportunity:!1},{id:"001Wj00000iYEVS",name:"Lightstone Group",hadOpportunity:!0},{id:"001Wj00000ahFCT",name:"Lincolnshire Management",hadOpportunity:!1},{id:"001Wj00000c8ynV",name:"Littelfuse",hadOpportunity:!0},{id:"001Wj00000W95CX",name:"Long Lake",hadOpportunity:!0},{id:"001Wj00000ahBa3",name:"Luminate Capital",hadOpportunity:!1},{id:"001Wj00000ahFC1",name:"Lumine Group",hadOpportunity:!1},{id:"001Wj00000bwVuH",name:"Markel Corporation",hadOpportunity:!1},{id:"001Wj00000Pfppo",name:"Marks Baughan",hadOpportunity:!1},{id:"001Wj00000ah6dm",name:"Martis Capital",hadOpportunity:!1},{id:"001Hp00003kKrRR",name:"Marvell Technology",hadOpportunity:!0},{id:"001Wj00000PbJ2B",name:"Meridian Capital",hadOpportunity:!1},{id:"001Wj00000ahFC3",name:"Nexa Equity",hadOpportunity:!1},{id:"001Wj00000ahBZv",name:"Norwest Venture Partners",hadOpportunity:!1},{id:"001Wj00000ah6dp",name:"Novanta",hadOpportunity:!1},{id:"001Wj00000ah6dQ",name:"Pacific Avenue Capital Partners",hadOpportunity:!1},{id:"001Wj00000ah6dt",name:"Palladium Equity Partners",hadOpportunity:!1},{id:"001Wj00000iXNFs",name:"Palomar Holdings",hadOpportunity:!0},{id:"001Wj00000ahFCG",name:"Pamlico Capital",hadOpportunity:!1},{id:"001Wj00000W3R2u",name:"Paradigm",hadOpportunity:!1},{id:"001Wj00000bWBlQ",name:"Pegasystems",hadOpportunity:!0},{id:"001Wj00000YcPTM",name:"Percheron Capital",hadOpportunity:!0},{id:"001Wj00000bzz9M",name:"Peregrine Hospitality",hadOpportunity:!0},{id:"001Wj00000VZkJ3",name:"PerformLaw",hadOpportunity:!1},{id:"001Hp00003ljCJ8",name:"Petco",hadOpportunity:!0},{id:"001Wj00000ahFBy",name:"Pharos Capital Group",hadOpportunity:!1},{id:"001Wj00000bwVuF",name:"Pool Corporation",hadOpportunity:!1},{id:"001Wj00000ah48Y",name:"Pritzker Private Capital",hadOpportunity:!1},{id:"001Wj00000mRFNX",name:"Publicis Group",hadOpportunity:!0},{id:"001Hp00003kKXSI",name:"Pure Storage",hadOpportunity:!0},{id:"001Wj00000ah6dS",name:"Quad-C Management",hadOpportunity:!1},{id:"001Hp00003kIrLo",name:"Raymond James Financial",hadOpportunity:!1},{id:"001Wj00000ah6ds",name:"Resilience Capital Partners",hadOpportunity:!1},{id:"001Wj00000m0jBC",name:"RingCentral",hadOpportunity:!0},{id:"001Wj00000ahFC4",name:"Riverside Acceleration Capital",hadOpportunity:!1},{id:"001Wj00000ah48a",name:"Riverside Partners",hadOpportunity:!1},{id:"001Wj00000ahFCE",name:"Rustic Canyon Partners",hadOpportunity:!1},{id:"001Wj00000ah6dR",name:"Sageview Capital",hadOpportunity:!1},{id:"001Wj00000ahFCN",name:"Salt Creek Capital",hadOpportunity:!1},{id:"001Wj00000lzlLX",name:"Sandbox",hadOpportunity:!0},{id:"001Wj00000nldrK",name:"Scout Motors",hadOpportunity:!0},{id:"001Wj00000ah48Z",name:"Searchlight Capital",hadOpportunity:!1},{id:"001Wj00000ahBZq",name:"Serent Capital",hadOpportunity:!1},{id:"001Hp00003kIrEB",name:"Silver Lake",hadOpportunity:!0},{id:"001Wj00000ahBZo",name:"Siris Capital Group",hadOpportunity:!1},{id:"001Wj00000ah6db",name:"Solace Capital Partners",hadOpportunity:!1},{id:"001Wj00000ahFCF",name:"Solis Capital Partners",hadOpportunity:!1},{id:"001Wj00000VkQyY",name:"Sonja Cotton & Associates",hadOpportunity:!1},{id:"001Wj00000ah6dO",name:"Sorenson Capital",hadOpportunity:!1},{id:"001Wj00000lygkU",name:"SoundPoint Capital",hadOpportunity:!0},{id:"001Wj00000lxbYR",name:"Spark Brighter Thinking",hadOpportunity:!0},{id:"001Wj00000ah6dj",name:"Spectrum Equity",hadOpportunity:!0},{id:"001Wj00000lusqi",name:"Symphony Technology Partners",hadOpportunity:!0},{id:"001Wj00000tOAoE",name:"TA Associates",hadOpportunity:!0},{id:"001Hp00003kKrU1",name:"TPG",hadOpportunity:!0},{id:"001Wj00000dNhDy",name:"TSS Europe",hadOpportunity:!0},{id:"001Wj00000QTbzh",name:"Taytrom",hadOpportunity:!1},{id:"001Wj00000ahFCY",name:"The Courtney Group",hadOpportunity:!1},{id:"001Wj00000ahFCZ",name:"The Riverside Company",hadOpportunity:!1},{id:"001Wj00000cgCF8",name:"Titan AI",hadOpportunity:!1},{id:"001Wj00000nlOIv",name:"Together Fund",hadOpportunity:!0},{id:"001Wj00000ah6dX",name:"Topicus.com",hadOpportunity:!1},{id:"001Hp00003kIrNO",name:"TransDigm Group",hadOpportunity:!1},{id:"001Wj00000ah6dN",name:"Transom Capital Group",hadOpportunity:!1},{id:"001Wj00000ahBZu",name:"Trimble Inc.",hadOpportunity:!1},{id:"001Wj00000ah6dl",name:"Trivest Partners",hadOpportunity:!1},{id:"001Wj00000dXDo3",name:"Tucker's Farm",hadOpportunity:!0},{id:"001Wj00000ah6da",name:"Tyler Technologies",hadOpportunity:!1},{id:"001Wj00000Y6VMa",name:"UBS",hadOpportunity:!0},{id:"001Wj00000ahFCQ",name:"Vance Street Capital",hadOpportunity:!1},{id:"001Wj00000bn8VS",name:"Vista Equity Partners",hadOpportunity:!0},{id:"001Wj00000ahFC0",name:"Vitec Software",hadOpportunity:!1},{id:"001Wj00000ah6dP",name:"Volaris Group",hadOpportunity:!1},{id:"001Hp00003kIrO2",name:"Watsco",hadOpportunity:!1},{id:"001Wj00000ahBZw",name:"West Lane Capital Partners",hadOpportunity:!1},{id:"001Wj00000ahBZy",name:"Zebra Technologies",hadOpportunity:!1}]},"asad.hussain@eudia.com":{email:"asad.hussain@eudia.com",name:"Asad Hussain",accounts:[{id:"001Hp00003kIrFC",name:"AT&T",hadOpportunity:!0},{id:"001Hp00003kIrCy",name:"Airbnb",hadOpportunity:!0},{id:"001Hp00003kIrEe",name:"Amazon",hadOpportunity:!0},{id:"001Wj00000WElj9",name:"American Arbitration Association",hadOpportunity:!0},{id:"001Hp00003kIrCz",name:"American Express",hadOpportunity:!0},{id:"001Wj00000hewsX",name:"Amkor",hadOpportunity:!0},{id:"001Wj00000WZ05x",name:"Applied Intuition",hadOpportunity:!0},{id:"001Hp00003kIrEx",name:"Applied Materials",hadOpportunity:!1},{id:"001Hp00003kIrEz",name:"Archer Daniels Midland",hadOpportunity:!0},{id:"001Wj00000Y0g8Z",name:"Asana",hadOpportunity:!0},{id:"001Wj00000gGYAQ",name:"Autodesk",hadOpportunity:!0},{id:"001Wj00000c0wRA",name:"Away",hadOpportunity:!0},{id:"001Wj00000WTMCR",name:"BNY Mellon",hadOpportunity:!0},{id:"001Wj00000c6DHy",name:"BetterUp",hadOpportunity:!0},{id:"001Hp00003kIrFY",name:"BlackRock",hadOpportunity:!1},{id:"001Hp00003kIrFe",name:"Booz Allen Hamilton",hadOpportunity:!1},{id:"001Wj00000XhcVG",name:"Box.com",hadOpportunity:!0},{id:"001Wj00000bWBla",name:"CNA Insurance",hadOpportunity:!0},{id:"001Wj00000XiYqz",name:"Canva",hadOpportunity:!0},{id:"001Hp00003kIrG0",name:"Carrier Global",hadOpportunity:!1},{id:"001Wj00000mosEX",name:"Carta",hadOpportunity:!0},{id:"001Wj00000ah6dk",name:"Charlesbank Capital Partners",hadOpportunity:!0},{id:"001Wj00000XiXjd",name:"Circle",hadOpportunity:!0},{id:"001Hp00003kIrE5",name:"Coherent",hadOpportunity:!0},{id:"001Hp00003kIrGf",name:"Corning",hadOpportunity:!0},{id:"001Wj00000fgfGu",name:"Cyware",hadOpportunity:!0},{id:"001Hp00003kIrE6",name:"DHL",hadOpportunity:!0},{id:"001Wj00000duIWr",name:"Deepmind",hadOpportunity:!0},{id:"001Hp00003kIrGy",name:"Dell Technologies",hadOpportunity:!1},{id:"001Hp00003kIrGz",name:"Deloitte",hadOpportunity:!0},{id:"001Wj00000W8ZKl",name:"Docusign",hadOpportunity:!0},{id:"001Hp00003kIrHN",name:"Ecolab",hadOpportunity:!0},{id:"001Wj00000dheQN",name:"Emory",hadOpportunity:!0},{id:"001Wj00000bWIxP",name:"Ericsson",hadOpportunity:!0},{id:"001Hp00003kIrHs",name:"FedEx",hadOpportunity:!1},{id:"001Wj00000lMcwT",name:"Flo Health",hadOpportunity:!0},{id:"001Hp00003kIrI3",name:"Fluor",hadOpportunity:!0},{id:"001Hp00003kIrIA",name:"Fox",hadOpportunity:!0},{id:"001Hp00003kJ9oe",name:"Fresh Del Monte",hadOpportunity:!0},{id:"001Wj00000Y6HEY",name:"G-III Apparel Group",hadOpportunity:!0},{id:"001Wj00000kNTF0",name:"GLG",hadOpportunity:!0},{id:"001Hp00003kIrIK",name:"Geico",hadOpportunity:!0},{id:"001Hp00003lhVuD",name:"General Atlantic",hadOpportunity:!0},{id:"001Wj00000dw1gb",name:"Glean",hadOpportunity:!0},{id:"001Hp00003kJ9l1",name:"Google",hadOpportunity:!0},{id:"001Wj00000oqVXg",name:"Goosehead Insurance",hadOpportunity:!0},{id:"001Wj00000tuXZb",name:"Gopuff",hadOpportunity:!0},{id:"001Hp00003kIrDP",name:"HP",hadOpportunity:!0},{id:"001Hp00003kIrIt",name:"HSBC",hadOpportunity:!0},{id:"001Hp00003kL3Mo",name:"Honeywell",hadOpportunity:!0},{id:"001Hp00003kIrIy",name:"Huntsman",hadOpportunity:!0},{id:"001Wj00000d7IL8",name:"IAC",hadOpportunity:!0},{id:"001Hp00003kIrJ0",name:"IBM",hadOpportunity:!0},{id:"001Wj00000hdoLx",name:"Insight Enterprises Inc.",hadOpportunity:!0},{id:"001Wj00000gH7ua",name:"JFrog",hadOpportunity:!0},{id:"001Wj00000tNwur",name:"Janus Henderson",hadOpportunity:!1},{id:"001Wj00000iC14X",name:"Klarna",hadOpportunity:!0},{id:"001Wj00000wSLUl",name:"LexisNexis",hadOpportunity:!1},{id:"001Wj00000mCFtJ",name:"LinkedIn",hadOpportunity:!0},{id:"001Hp00003kIrJu",name:"Lockheed Martin",hadOpportunity:!0},{id:"001Hp00003kIrKC",name:"Mass Mutual Life Insurance",hadOpportunity:!0},{id:"001Hp00003kIrKO",name:"Microsoft",hadOpportunity:!0},{id:"001Wj00000lyDQk",name:"MidOcean Partners",hadOpportunity:!0},{id:"001Hp00003kIrKT",name:"Morgan Stanley",hadOpportunity:!0},{id:"001Wj00000bWIxq",name:"Motiva",hadOpportunity:!0},{id:"001Hp00003kIrKr",name:"NVIDIA",hadOpportunity:!1},{id:"001Hp00003kIrCx",name:"Novartis",hadOpportunity:!0},{id:"001Wj00000hVTTB",name:"One Oncology",hadOpportunity:!0},{id:"001Wj00000Y6VVW",name:"Oscar Health",hadOpportunity:!0},{id:"001Wj00000eLHLO",name:"Palo Alto Networks",hadOpportunity:!1},{id:"001Wj00000kNp2X",name:"Plusgrade",hadOpportunity:!0},{id:"001Wj00000YoLqW",name:"Procore Technologies",hadOpportunity:!0},{id:"001Wj00000lXD0F",name:"RBI (Burger King)",hadOpportunity:!1},{id:"001Hp00003kIrLx",name:"Republic Services",hadOpportunity:!1},{id:"001Wj00000bWJ0J",name:"SAP",hadOpportunity:!1},{id:"001Hp00003kIrD9",name:"Salesforce",hadOpportunity:!0},{id:"001Wj00000fPr6N",name:"Santander",hadOpportunity:!0},{id:"001Hp00003kIrMK",name:"ServiceNow",hadOpportunity:!0},{id:"001Wj00000eL760",name:"Shell",hadOpportunity:!1},{id:"001Wj00000kNmsg",name:"Skims",hadOpportunity:!0},{id:"001Wj00000aCGR3",name:"Solventum",hadOpportunity:!0},{id:"001Hp00003kIrEC",name:"Southwest Airlines",hadOpportunity:!0},{id:"001Hp00003kIrMc",name:"SpaceX",hadOpportunity:!1},{id:"001Wj00000SdYHq",name:"Spotify",hadOpportunity:!0},{id:"001Hp00003kIrDl",name:"StoneX Group",hadOpportunity:!0},{id:"001Wj00000WYtsU",name:"Tenable",hadOpportunity:!0},{id:"001Hp00003kIrN5",name:"Tesla",hadOpportunity:!1},{id:"001Wj00000c0wRK",name:"The Initial Group",hadOpportunity:!0},{id:"001Wj00000bWBlX",name:"Thomson Reuters Ventures",hadOpportunity:!1},{id:"001Hp00003kIrCs",name:"UPS",hadOpportunity:!0},{id:"001Wj00000tuRNo",name:"Virtusa",hadOpportunity:!0},{id:"001Hp00003kIrNw",name:"W.W. Grainger",hadOpportunity:!0},{id:"001Hp00003kIrNy",name:"Walmart",hadOpportunity:!0},{id:"001Wj00000Y64qk",name:"Warburg Pincus LLC",hadOpportunity:!1},{id:"001Wj00000bzz9N",name:"Wealth Partners Capital Group",hadOpportunity:!0},{id:"001Wj00000tuolf",name:"Wynn Las Vegas",hadOpportunity:!0},{id:"001Wj00000bzz9Q",name:"Youtube",hadOpportunity:!0},{id:"001Wj00000uzs1f",name:"Zero RFI",hadOpportunity:!0}]},"conor.molloy@eudia.com":{email:"conor.molloy@eudia.com",name:"Conor Molloy",accounts:[{id:"001Wj00000mCFrf",name:"APEX Group",hadOpportunity:!1},{id:"001Wj00000xxtg6",name:"ASR Nederland",hadOpportunity:!1},{id:"001Hp00003kIrQD",name:"Accenture",hadOpportunity:!0},{id:"001Wj00000qLixn",name:"Al Dahra Group Llc",hadOpportunity:!0},{id:"001Wj00000syNyn",name:"Alliance Healthcare",hadOpportunity:!1},{id:"001Hp00003kIrEy",name:"Aramark Ireland",hadOpportunity:!0},{id:"001Wj00000tWwXk",name:"Aramex",hadOpportunity:!1},{id:"001Wj00000xyXlY",name:"Arkema",hadOpportunity:!1},{id:"001Wj00000mCFrg",name:"Aryza",hadOpportunity:!0},{id:"001Wj00000xz3F7",name:"Aurubis",hadOpportunity:!1},{id:"001Wj00000bWIzJ",name:"BAE Systems, Inc.",hadOpportunity:!1},{id:"001Wj00000fFhea",name:"BBC News",hadOpportunity:!1},{id:"001Wj00000Y6Vk4",name:"BBC Studios",hadOpportunity:!1},{id:"001Wj00000xypIc",name:"BMW Group",hadOpportunity:!1},{id:"001Wj00000eLPna",name:"BP",hadOpportunity:!1},{id:"001Wj00000tsfWO",name:"Baker Tilly",hadOpportunity:!0},{id:"001Wj00000tWwXr",name:"Bestseller",hadOpportunity:!1},{id:"001Wj00000xz3LZ",name:"Bouygues",hadOpportunity:!1},{id:"001Wj00000xz3Td",name:"British Broadcasting Corporation",hadOpportunity:!1},{id:"001Wj00000xyc3f",name:"Carrefour",hadOpportunity:!1},{id:"001Wj00000tWwXy",name:"Citco",hadOpportunity:!1},{id:"001Wj00000mCFrk",name:"Coillte",hadOpportunity:!0},{id:"001Wj00000mCFsH",name:"Consensys",hadOpportunity:!0},{id:"001Wj00000xxS3B",name:"Currys",hadOpportunity:!1},{id:"001Wj00000Y6Vgo",name:"Cushman & Wakefield",hadOpportunity:!1},{id:"001Wj00000tWwY2",name:"DB Schenker",hadOpportunity:!1},{id:"001Wj00000xxpXf",name:"DZ Bank",hadOpportunity:!1},{id:"001Wj00000bWIzG",name:"DZB BANK GmbH",hadOpportunity:!1},{id:"001Wj00000Y6VMZ",name:"Danone",hadOpportunity:!1},{id:"001Wj00000xyCKX",name:"Deutsche Bahn",hadOpportunity:!1},{id:"001Wj00000tWwY3",name:"Dyson",hadOpportunity:!1},{id:"001Wj00000xy3Iu",name:"E.ON",hadOpportunity:!1},{id:"001Wj00000xz3Jx",name:"Electricite de France",hadOpportunity:!1},{id:"001Hp00003kIrHR",name:"Electronic Arts",hadOpportunity:!1},{id:"001Wj00000xz373",name:"Energie Baden-Wurttemberg",hadOpportunity:!1},{id:"001Wj00000xwnL0",name:"Evonik Industries",hadOpportunity:!1},{id:"001Wj00000xyr5v",name:"FMS Wertmanagement",hadOpportunity:!1},{id:"001Wj00000Y6DDb",name:"Federal Reserve Bank of New York",hadOpportunity:!1},{id:"001Wj00000tWwYf",name:"Fenergo",hadOpportunity:!1},{id:"001Wj00000xxuFZ",name:"Finatis",hadOpportunity:!1},{id:"001Wj00000xz3QP",name:"Groupe SEB",hadOpportunity:!1},{id:"001Wj00000syXLZ",name:"Guerbet",hadOpportunity:!1},{id:"001Wj00000xyP83",name:"Heraeus Holding",hadOpportunity:!1},{id:"001Wj00000xxuVh",name:"Hermes International",hadOpportunity:!1},{id:"001Wj00000xz32D",name:"Hornbach Group",hadOpportunity:!1},{id:"001Wj00000hkk0u",name:"ICON",hadOpportunity:!1},{id:"001Wj00000mCFr2",name:"ICON Clinical Research",hadOpportunity:!0},{id:"001Wj00000Y64qd",name:"ION",hadOpportunity:!0},{id:"001Wj00000xz3AH",name:"Ingka Group",hadOpportunity:!1},{id:"001Wj00000tWwXa",name:"Jacobs Engineering Group",hadOpportunity:!1},{id:"001Wj00000xz30c",name:"Johnson Matthey",hadOpportunity:!1},{id:"001Wj00000mCFtM",name:"Kellanova",hadOpportunity:!0},{id:"001Wj00000xz3S1",name:"Klockner",hadOpportunity:!1},{id:"001Wj00000tWwYC",name:"Kuehne & Nagel",hadOpportunity:!1},{id:"001Wj00000bWIym",name:"LSEG",hadOpportunity:!1},{id:"001Wj00000Y6VZE",name:"Linde",hadOpportunity:!1},{id:"001Wj00000xy1Lu",name:"M&G",hadOpportunity:!1},{id:"001Wj00000xz0h4",name:"Metinvest",hadOpportunity:!1},{id:"001Wj00000xyNse",name:"NN Group",hadOpportunity:!1},{id:"001Wj00000xyECc",name:"Network Rail",hadOpportunity:!1},{id:"001Wj00000xyudG",name:"Nordex",hadOpportunity:!1},{id:"001Wj00000tWwXc",name:"Ocorian",hadOpportunity:!1},{id:"001Wj00000fFW1m",name:"Okta",hadOpportunity:!1},{id:"001Wj00000mCFrI",name:"Orsted",hadOpportunity:!0},{id:"001Wj00000tWwYK",name:"PGIM",hadOpportunity:!1},{id:"001Wj00000xz38f",name:"PPF Group",hadOpportunity:!1},{id:"001Wj00000tWwYi",name:"Penneys",hadOpportunity:!1},{id:"001Wj00000tWwYL",name:"Philips Electronics",hadOpportunity:!1},{id:"001Wj00000tWwYP",name:"Reddit",hadOpportunity:!1},{id:"001Wj00000mCFrU",name:"Riot Games",hadOpportunity:!0},{id:"001Wj00000xyD0Q",name:"Rolls-Royce",hadOpportunity:!1},{id:"001Wj00000xxIqC",name:"Royal Ahold Delhaize",hadOpportunity:!1},{id:"001Wj00000xz3Gj",name:"Rubis",hadOpportunity:!1},{id:"001Wj00000xyrh0",name:"Salzgitter",hadOpportunity:!1},{id:"001Wj00000bWBm6",name:"Schneider Electric",hadOpportunity:!1},{id:"001Wj00000mI9Nm",name:"Sequoia Climate Fund",hadOpportunity:!1},{id:"001Wj00000fCp7J",name:"Siemens",hadOpportunity:!1},{id:"001Wj00000tWwYR",name:"Smurfit Kappa",hadOpportunity:!1},{id:"001Wj00000tWwYS",name:"Stewart",hadOpportunity:!1},{id:"001Wj00000syavy",name:"Symrise AG",hadOpportunity:!1},{id:"001Wj00000mCFs0",name:"Taoglas Limited",hadOpportunity:!0},{id:"001Wj00000mCFtP",name:"Teamwork.com",hadOpportunity:!0},{id:"001Wj00000sxsOq",name:"TechnipFMC",hadOpportunity:!1},{id:"001Wj00000tWwXe",name:"Teneo",hadOpportunity:!1},{id:"001Wj00000Y64qc",name:"Thales",hadOpportunity:!1},{id:"001Hp00003kIrNJ",name:"Toyota",hadOpportunity:!0},{id:"001Wj00000mCFqw",name:"Ulster Bank",hadOpportunity:!1},{id:"001Wj00000xxDSI",name:"Unedic",hadOpportunity:!1},{id:"001Wj00000mCFs2",name:"Vantage Towers",hadOpportunity:!0},{id:"001Hp00003kIrNs",name:"Vistra",hadOpportunity:!0},{id:"001Wj00000Y6VZD",name:"WPP",hadOpportunity:!0},{id:"001Wj00000ZLVpT",name:"Wellspring Philanthropic Fund",hadOpportunity:!0},{id:"001Wj00000mCFsY",name:"World Rugby",hadOpportunity:!1},{id:"001Wj00000xyygs",name:"Wurth",hadOpportunity:!1},{id:"001Wj00000aLlzL",name:"Xerox",hadOpportunity:!1},{id:"001Wj00000j3QNL",name:"adidas",hadOpportunity:!1}]},"david.vanreyk@eudia.com":{email:"david.vanreyk@eudia.com",name:"David Van Reyk",accounts:[{id:"001Wj00000cIA4i",name:"Amerivet",hadOpportunity:!0},{id:"001Wj00000dw9pN",name:"Ardian",hadOpportunity:!0}]},"emer.flynn@eudia.com":{email:"emer.flynn@eudia.com",name:"Emer Flynn",accounts:[{id:"001Wj00000syUts",name:"Bakkavor",hadOpportunity:!1},{id:"001Wj00000syAdO",name:"Bonduelle",hadOpportunity:!1},{id:"001Wj00000syAoe",name:"Gerresheimer",hadOpportunity:!1},{id:"001Wj00000syBb5",name:"Harbour Energy",hadOpportunity:!1},{id:"001Wj00000soqIv",name:"Lundbeck",hadOpportunity:!1},{id:"001Wj00000mCFr6",name:"NTMA",hadOpportunity:!0},{id:"001Wj00000sxy9J",name:"Orion Pharma",hadOpportunity:!1},{id:"001Wj00000soqNk",name:"Sobi",hadOpportunity:!1},{id:"001Wj00000sy54F",name:"SubSea7",hadOpportunity:!1},{id:"001Wj00000sxvzJ",name:"Virbac",hadOpportunity:!1}]},"greg.machale@eudia.com":{email:"greg.machale@eudia.com",name:"Greg MacHale",accounts:[{id:"001Wj00000Y64ql",name:"ABN AMRO Bank N.V.",hadOpportunity:!1},{id:"001Wj00000tWwYd",name:"AXA",hadOpportunity:!1},{id:"001Hp00003kIrEF",name:"Abbott Laboratories",hadOpportunity:!0},{id:"001Wj00000tWwXg",name:"Abtran",hadOpportunity:!1},{id:"001Wj00000umCEl",name:"Aerogen",hadOpportunity:!1},{id:"001Wj00000xyMyB",name:"Air Liquide",hadOpportunity:!1},{id:"001Wj00000tWwYa",name:"Allergan",hadOpportunity:!1},{id:"001Wj00000sgXdB",name:"Allianz Insurance",hadOpportunity:!0},{id:"001Wj00000tWwYb",name:"Almac Group",hadOpportunity:!1},{id:"001Hp00003kIrEm",name:"Amgen",hadOpportunity:!1},{id:"001Wj00000pzTPu",name:"Arrow Global Group PLC/Mars Capital",hadOpportunity:!1},{id:"001Wj00000tWwXm",name:"Arvato Digital Services",hadOpportunity:!1},{id:"001Wj00000tWwXn",name:"Arvato Supply Chain Solutions",hadOpportunity:!1},{id:"001Wj00000tWwYc",name:"Arvato Systems",hadOpportunity:!1},{id:"001Wj00000xz3VF",name:"Asklepios",hadOpportunity:!1},{id:"001Wj00000vWwfx",name:"Associated British Foods",hadOpportunity:!1},{id:"001Hp00003kIrFB",name:"AstraZeneca",hadOpportunity:!1},{id:"001Wj00000bWJ0A",name:"Atos",hadOpportunity:!1},{id:"001Wj00000hfWMu",name:"Aya Healthcare",hadOpportunity:!1},{id:"001Wj00000tWwXV",name:"BCM Group",hadOpportunity:!1},{id:"001Wj00000tWwXU",name:"BCMGlobal ASI Ltd",hadOpportunity:!1},{id:"001Wj00000Y6VMd",name:"BNP Paribas",hadOpportunity:!0},{id:"001Wj00000X4OqN",name:"BT Group",hadOpportunity:!0},{id:"001Wj00000vRJ13",name:"BWG Group",hadOpportunity:!1},{id:"001Wj00000bWBsw",name:"Bausch + Lomb",hadOpportunity:!1},{id:"001Hp00003kIrFO",name:"Baxter International",hadOpportunity:!1},{id:"001Wj00000wLIjh",name:"Baywa",hadOpportunity:!1},{id:"001Wj00000tWwXs",name:"Bidvest Noonan",hadOpportunity:!1},{id:"001Wj00000mCFqr",name:"Biomarin International Limited",hadOpportunity:!0},{id:"001Hp00003kIrFd",name:"Booking Holdings",hadOpportunity:!0},{id:"001Wj00000T5gdt",name:"Bosch",hadOpportunity:!1},{id:"001Hp00003kIrFg",name:"Boston Scientific",hadOpportunity:!1},{id:"001Wj00000xyNsd",name:"Brenntag",hadOpportunity:!1},{id:"001Wj00000tgYgj",name:"British American Tobacco ( BAT )",hadOpportunity:!1},{id:"001Wj00000ulXoK",name:"British Petroleum ( BP )",hadOpportunity:!1},{id:"001Hp00003kIrDK",name:"Bupa",hadOpportunity:!1},{id:"001Wj00000bWBkr",name:"CRH",hadOpportunity:!1},{id:"001Wj00000uZ5J7",name:"Canada Life",hadOpportunity:!0},{id:"001Hp00003kIrFu",name:"Capgemini",hadOpportunity:!1},{id:"001Wj00000tWwYe",name:"Capita",hadOpportunity:!1},{id:"001Wj00000mCFt9",name:"Cerberus European Servicing",hadOpportunity:!0},{id:"001Wj00000tWwXz",name:"CluneTech",hadOpportunity:!1},{id:"001Wj00000wKnrE",name:"Co-operative Group ( Co-op )",hadOpportunity:!1},{id:"001Wj00000Y6HEM",name:"Commerzbank AG",hadOpportunity:!1},{id:"001Wj00000aLp9L",name:"Compass",hadOpportunity:!1},{id:"001Wj00000cSBr6",name:"Compass Group Equity Partners",hadOpportunity:!1},{id:"001Wj00000Y6VMk",name:"Computershare",hadOpportunity:!0},{id:"001Wj00000uP5x8",name:"Cornmarket Financial Services",hadOpportunity:!0},{id:"001Wj00000tWwY0",name:"Cornmarket Hill Trading Limited",hadOpportunity:!1},{id:"001Hp00003kIrGk",name:"Covestro",hadOpportunity:!1},{id:"001Wj00000tWwXY",name:"DCC Vital",hadOpportunity:!1},{id:"001Wj00000mCFrV",name:"Danske Bank",hadOpportunity:!1},{id:"001Hp00003kJ9fx",name:"Deutsche Bank AG",hadOpportunity:!1},{id:"001Wj00000Y6VMM",name:"Diageo",hadOpportunity:!0},{id:"001Wj00000prFOX",name:"Doosan Bobcat",hadOpportunity:!0},{id:"001Wj00000wKzZ1",name:"Drax Group",hadOpportunity:!1},{id:"001Hp00003kIrHQ",name:"EG Group",hadOpportunity:!1},{id:"001Wj00000hUcQZ",name:"EY",hadOpportunity:!0},{id:"001Wj00000wK30S",name:"EY ( Ernst & Young )",hadOpportunity:!1},{id:"001Hp00003kIrHL",name:"Eaton Corporation",hadOpportunity:!1},{id:"001Wj00000mCFtR",name:"Ekco Cloud Limited",hadOpportunity:!0},{id:"001Hp00003kIrHS",name:"Elevance Health",hadOpportunity:!1},{id:"001Hp00003kIrHT",name:"Eli Lilly",hadOpportunity:!1},{id:"001Wj00000Y6HEn",name:"Ferring Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000tWwYn",name:"Fibrus",hadOpportunity:!1},{id:"001Hp00003kIrHu",name:"Fidelity Investments",hadOpportunity:!1},{id:"001Hp00003kIrI0",name:"Fiserv",hadOpportunity:!1},{id:"001Wj00000xxg4V",name:"Fnac Darty",hadOpportunity:!1},{id:"001Wj00000wL79x",name:"Frasers Group",hadOpportunity:!1},{id:"001Wj00000aLlyX",name:"Gartner",hadOpportunity:!1},{id:"001Wj00000fFuFY",name:"Grant Thornton",hadOpportunity:!0},{id:"001Wj00000uZ4A9",name:"Great West Lifec co",hadOpportunity:!0},{id:"001Wj00000pzTPt",name:"Gym Plus Coffee",hadOpportunity:!1},{id:"001Wj00000xW3SE",name:"Hayfin",hadOpportunity:!0},{id:"001Wj00000pzTPm",name:"Hedgserv",hadOpportunity:!1},{id:"001Wj00000xxsbv",name:"Heidelberg Materials",hadOpportunity:!1},{id:"001Wj00000wvtPl",name:"ICEYE",hadOpportunity:!0},{id:"001Wj00000mCFrH",name:"Indra",hadOpportunity:!1},{id:"001Wj00000uZtcT",name:"Ineos",hadOpportunity:!0},{id:"001Wj00000vXdt1",name:"International Airline Group ( IAG )",hadOpportunity:!1},{id:"001Wj00000wKnZU",name:"International Distribution Services",hadOpportunity:!1},{id:"001Wj00000wKTao",name:"John Swire & Sons",hadOpportunity:!1},{id:"001Wj00000vaqot",name:"Johnson Controls",hadOpportunity:!1},{id:"001Wj00000xwwRX",name:"Jumbo Groep Holding",hadOpportunity:!1},{id:"001Hp00003kIrJb",name:"KPMG",hadOpportunity:!1},{id:"001Wj00000Y6VZM",name:"Kering",hadOpportunity:!1},{id:"001Wj00000mCFrr",name:"Kerry Group",hadOpportunity:!1},{id:"001Wj00000xyyk7",name:"La Poste",hadOpportunity:!1},{id:"001Wj00000tWwYr",name:"Laya Healthcare",hadOpportunity:!1},{id:"001Wj00000tWwYE",name:"Leaseplan",hadOpportunity:!1},{id:"001Wj00000tWwYF",name:"Linked Finance",hadOpportunity:!1},{id:"001Wj00000Y6HEA",name:"Lloyds Banking Group",hadOpportunity:!1},{id:"001Wj00000xyDV4",name:"LyondellBasell Industries",hadOpportunity:!1},{id:"001Wj00000tWwYG",name:"MSC - Mediterranean Shipping Company",hadOpportunity:!1},{id:"001Wj00000wvGLB",name:"MTU Maintenance Lease Services",hadOpportunity:!1},{id:"001Wj00000iC14L",name:"MUFG Investor Services",hadOpportunity:!1},{id:"001Wj00000xyp2U",name:"MVV Energie",hadOpportunity:!1},{id:"001Wj00000tWwYp",name:"Mail Metrics",hadOpportunity:!0},{id:"001Wj00000qFtCk",name:"Mars Capital",hadOpportunity:!1},{id:"001Wj00000pAeWg",name:"Meetingsbooker",hadOpportunity:!0},{id:"001Hp00003kIrKJ",name:"Mercedes-Benz Group",hadOpportunity:!0},{id:"001Wj00000YEMaI",name:"Mercer",hadOpportunity:!1},{id:"001Wj00000vwSUX",name:"Mercor",hadOpportunity:!0},{id:"001Wj00000mCFtU",name:"Mercury Engineering",hadOpportunity:!0},{id:"001Wj00000yGZth",name:"Monzo",hadOpportunity:!1},{id:"001Wj00000tWwYg",name:"Musgrave",hadOpportunity:!1},{id:"001Wj00000lPFP3",name:"Nomura",hadOpportunity:!0},{id:"001Wj00000tWwYH",name:"Norbrook Laboratories",hadOpportunity:!1},{id:"001Hp00003kIrKn",name:"Northrop Grumman",hadOpportunity:!1},{id:"001Wj00000xxcH4",name:"Orange",hadOpportunity:!1},{id:"001Wj00000tWwYI",name:"P.J. Carroll (BAT Ireland)",hadOpportunity:!1},{id:"001Wj00000mCFsf",name:"Pepper Finance Corporation",hadOpportunity:!0},{id:"001Wj00000mCFrO",name:"Peptalk",hadOpportunity:!0},{id:"001Wj00000mCFr1",name:"Permanent TSB plc",hadOpportunity:!0},{id:"001Wj00000Y6QfR",name:"Pernod Ricard",hadOpportunity:!0},{id:"001Wj00000vVxFy",name:"Phoenix Group",hadOpportunity:!1},{id:"001Wj00000tWwYM",name:"Pinewood Laboratories",hadOpportunity:!1},{id:"001Wj00000tWwYN",name:"Pinsent Masons",hadOpportunity:!1},{id:"001Wj00000tWwYO",name:"Pramerica",hadOpportunity:!1},{id:"001Hp00003kIrLf",name:"PwC",hadOpportunity:!1},{id:"001Hp00003kIrLi",name:"Quest Diagnostics",hadOpportunity:!0},{id:"001Wj00000xy735",name:"RATP Group",hadOpportunity:!1},{id:"001Wj00000xyKjS",name:"Randstad",hadOpportunity:!1},{id:"001Wj00000mCFsF",name:"Regeneron",hadOpportunity:!0},{id:"001Wj00000xwh4H",name:"Renault",hadOpportunity:!1},{id:"001Wj00000xy1P5",name:"Rheinmetall",hadOpportunity:!1},{id:"001Wj00000tWwYQ",name:"Roche",hadOpportunity:!1},{id:"001Wj00000wKi8O",name:"Royal London",hadOpportunity:!1},{id:"001Wj00000mCFsR",name:"Ryanair",hadOpportunity:!0},{id:"001Wj00000xyJqd",name:"SCOR",hadOpportunity:!1},{id:"001Wj00000pAxKo",name:"SSP Group",hadOpportunity:!0},{id:"001Wj00000bWIzx",name:"Saint-Gobain",hadOpportunity:!1},{id:"001Wj00000pzTPv",name:"Scottish Friendly",hadOpportunity:!1},{id:"001Wj00000bzz9U",name:"Signify Group",hadOpportunity:!0},{id:"001Wj00000fFuG4",name:"Sky",hadOpportunity:!1},{id:"001Hp00003kIrDR",name:"Smith & Nephew",hadOpportunity:!1},{id:"001Hp00003kIrE1",name:"Societe Generale",hadOpportunity:!1},{id:"001Hp00003kIrMj",name:"State Street",hadOpportunity:!0},{id:"001Wj00000xyy4A",name:"Sudzucker",hadOpportunity:!1},{id:"001Wj00000mCFtB",name:"SurveyMonkey",hadOpportunity:!1},{id:"001Wj00000xypQh",name:"TUI",hadOpportunity:!1},{id:"001Wj00000tWwYT",name:"Takeda",hadOpportunity:!1},{id:"001Wj00000wKD4c",name:"Talanx",hadOpportunity:!1},{id:"001Wj00000mCFr9",name:"Tesco",hadOpportunity:!0},{id:"001Wj00000tWwYX",name:"Tullow Oil",hadOpportunity:!1},{id:"001Wj00000mCFsS",name:"Uniphar PLC",hadOpportunity:!0},{id:"001Hp00003kIrNg",name:"UnitedHealth Group",hadOpportunity:!1},{id:"001Wj00000mCFsx",name:"Vodafone Ireland",hadOpportunity:!1},{id:"001Wj00000xybh4",name:"Wendel",hadOpportunity:!1},{id:"001Wj00000sCb3D",name:"Willis Towers Watson",hadOpportunity:!1},{id:"001Wj00000tWwYY",name:"Winthrop",hadOpportunity:!1},{id:"001Wj00000pzTPW",name:"WizzAir",hadOpportunity:!1},{id:"001Wj00000mCFrm",name:"eShopWorld",hadOpportunity:!0},{id:"001Hp00003kJ9Ck",name:"wnco.com",hadOpportunity:!1}]},"himanshu.agarwal@eudia.com":{email:"himanshu.agarwal@eudia.com",name:"Himanshu Agarwal",accounts:[{id:"001Hp00003kIrEs",name:"AON",hadOpportunity:!0},{id:"001Wj00000RwUpO",name:"Acrisure",hadOpportunity:!0},{id:"001Hp00003kIrCd",name:"Adobe",hadOpportunity:!1},{id:"001Hp00003kIrEU",name:"Albertsons",hadOpportunity:!0},{id:"001Wj00000T6Hrw",name:"Atlassian",hadOpportunity:!0},{id:"001Wj00000ZRrYl",name:"Avis Budget Group",hadOpportunity:!0},{id:"001Wj00000kIYAD",name:"Axis Bank",hadOpportunity:!0},{id:"001Hp00003kIrD0",name:"Broadcom",hadOpportunity:!0},{id:"001Hp00003kIrGh",name:"Costco Wholesale",hadOpportunity:!1},{id:"001Hp00003kIrCu",name:"Disney",hadOpportunity:!1},{id:"001Hp00003kIrIF",name:"Gap",hadOpportunity:!0},{id:"001Hp00003kIrDN",name:"Genpact",hadOpportunity:!0},{id:"001Wj00000Zcmad",name:"Geodis",hadOpportunity:!0},{id:"001Wj00000Q2yaX",name:"Innovative Driven",hadOpportunity:!1},{id:"001Hp00003lhshd",name:"Instacart",hadOpportunity:!0},{id:"001Hp00003kIrJx",name:"Lowe's",hadOpportunity:!1},{id:"001Hp00003kIrDk",name:"Moderna",hadOpportunity:!0},{id:"001Wj00000hDvCc",name:"Nykaa",hadOpportunity:!0},{id:"001Wj00000h9r1F",name:"Piramal Finance",hadOpportunity:!0},{id:"001Hp00003kIrDc",name:"Progressive",hadOpportunity:!0},{id:"001Wj00000cyDxS",name:"Pyxus",hadOpportunity:!0},{id:"001Wj00000XXvnk",name:"Relativity",hadOpportunity:!0},{id:"001Wj00000kIFDh",name:"Reliance",hadOpportunity:!0},{id:"001Wj00000eKsGZ",name:"Snowflake",hadOpportunity:!1},{id:"001Hp00003kIrNr",name:"Visa",hadOpportunity:!0},{id:"001Hp00003kIrO0",name:"Warner Bros Discovery",hadOpportunity:!1},{id:"001Hp00003kIrDT",name:"xAI",hadOpportunity:!0}]},"jon.cobb@eudia.com":{email:"jon.cobb@eudia.com",name:"Jon Cobb",accounts:[{id:"001Wj00000XTOQZ",name:"Armstrong World Industries",hadOpportunity:!0},{id:"001Wj00000c0Cxn",name:"U.S. Aircraft Insurance Group",hadOpportunity:!0}]},"julie.stefanich@eudia.com":{email:"julie.stefanich@eudia.com",name:"Julie Stefanich",accounts:[{id:"001Wj00000asSHB",name:"Airbus",hadOpportunity:!0},{id:"001Hp00003kIrEl",name:"Ameriprise Financial",hadOpportunity:!0},{id:"001Wj00000X6IDs",name:"Andersen",hadOpportunity:!0},{id:"001Hp00003kIrEv",name:"Apple",hadOpportunity:!0},{id:"001Wj00000soLVH",name:"Base Power",hadOpportunity:!0},{id:"001Hp00003kJ9pX",name:"Bayer",hadOpportunity:!0},{id:"001Hp00003kIrFP",name:"Bechtel",hadOpportunity:!0},{id:"001Hp00003kIrFZ",name:"Block",hadOpportunity:!0},{id:"001Hp00003kIrE3",name:"Cargill",hadOpportunity:!0},{id:"001Hp00003kIrGD",name:"Charles Schwab",hadOpportunity:!0},{id:"001Hp00003kIrE4",name:"Chevron",hadOpportunity:!0},{id:"001Hp00003kIrDh",name:"Comcast",hadOpportunity:!0},{id:"001Hp00003kIrGe",name:"Corebridge Financial",hadOpportunity:!0},{id:"001Wj00000eLJAK",name:"CrowdStrike",hadOpportunity:!1},{id:"001Hp00003liBe9",name:"DoorDash",hadOpportunity:!1},{id:"001Hp00003kIrE7",name:"ECMS",hadOpportunity:!0},{id:"001Hp00003kIrHP",name:"Edward Jones",hadOpportunity:!0},{id:"001Wj00000iRzqv",name:"Florida Crystals Corporation",hadOpportunity:!0},{id:"001Wj00000XS3MX",name:"Flutter",hadOpportunity:!0},{id:"001Hp00003kIrIP",name:"Genworth Financial",hadOpportunity:!0},{id:"001Hp00003kIrIX",name:"Goldman Sachs",hadOpportunity:!0},{id:"001Wj00000rceVp",name:"Hikma",hadOpportunity:!0},{id:"001Hp00003kIrJV",name:"KLA",hadOpportunity:!0},{id:"001Wj00000XkT43",name:"Kaiser Permanente",hadOpportunity:!0},{id:"001Wj00000aLmhe",name:"Macmillan",hadOpportunity:!0},{id:"001Wj00000X6G8q",name:"Mainsail Partners",hadOpportunity:!0},{id:"001Hp00003kIrDb",name:"McKinsey & Company",hadOpportunity:!0},{id:"001Hp00003kIrKL",name:"MetLife",hadOpportunity:!0},{id:"001Hp00003kIrCp",name:"Mosaic",hadOpportunity:!0},{id:"001Hp00003kIrDe",name:"National Grid",hadOpportunity:!0},{id:"001Hp00003kIrKY",name:"Netflix",hadOpportunity:!0},{id:"001Hp00003kIrKj",name:"Nordstrom",hadOpportunity:!0},{id:"001Hp00003kIrL2",name:"O'Reilly Automotive",hadOpportunity:!0},{id:"001Hp00003kIrDv",name:"Oracle",hadOpportunity:!0},{id:"001Hp00003kIrLP",name:"PG&E",hadOpportunity:!1},{id:"001Hp00003kIrLH",name:"PayPal inc.",hadOpportunity:!1},{id:"001Hp00003kIrLN",name:"Petsmart",hadOpportunity:!0},{id:"001Hp00003kIrLZ",name:"Procter & Gamble",hadOpportunity:!0},{id:"001Wj00000XcHEb",name:"Resmed",hadOpportunity:!0},{id:"001Hp00003lhsUY",name:"Rio Tinto Group",hadOpportunity:!0},{id:"001Wj00000svQI3",name:"Safelite",hadOpportunity:!0},{id:"001Wj00000Yfysf",name:"Samsara",hadOpportunity:!0},{id:"001Wj00000fRtLm",name:"State Farm",hadOpportunity:!0},{id:"001Hp00003kIrNH",name:"T-Mobile",hadOpportunity:!0},{id:"001Hp00003kIrCr",name:"TIAA",hadOpportunity:!0},{id:"001Wj00000bIVo1",name:"TSMC",hadOpportunity:!0},{id:"001Wj00000bzz9T",name:"Tailored Brands",hadOpportunity:!0},{id:"001Hp00003kIrNB",name:"The Wonderful Company",hadOpportunity:!0},{id:"001Hp00003kIrNV",name:"Uber",hadOpportunity:!0},{id:"001Wj00000Y6VYk",name:"Verifone",hadOpportunity:!0},{id:"001Hp00003kIrOL",name:"World Wide Technology",hadOpportunity:!0},{id:"001Wj00000bWIza",name:"eBay",hadOpportunity:!1}]},"justin.hills@eudia.com":{email:"justin.hills@eudia.com",name:"Justin Hills",accounts:[{id:"001Wj00000vCx6j",name:"1800 Flowers",hadOpportunity:!1},{id:"001Wj00000Y6VM4",name:"Ares Management Corporation",hadOpportunity:!0},{id:"001Hp00003kIrG8",name:"Centene",hadOpportunity:!0},{id:"001Wj00000c9oCv",name:"Cox Media Group",hadOpportunity:!0},{id:"001Wj00000vCPMs",name:"Crusoe",hadOpportunity:!1},{id:"001Wj00000vCiAw",name:"Deel",hadOpportunity:!1},{id:"001Wj00000Y0jPm",name:"Delinea",hadOpportunity:!0},{id:"001Wj00000iwKGQ",name:"Dominos",hadOpportunity:!0},{id:"001Hp00003kIrDa",name:"Duracell",hadOpportunity:!0},{id:"001Wj00000Y6Vde",name:"EPIC Insurance Brokers & Consultants",hadOpportunity:!1},{id:"001Hp00003kIrIC",name:"Freddie Mac",hadOpportunity:!1},{id:"001Hp00003kJ9gW",name:"Genentech",hadOpportunity:!0},{id:"001Hp00003kIrDV",name:"Intel",hadOpportunity:!0},{id:"001Hp00003kIrJJ",name:"Johnson & Johnson",hadOpportunity:!0},{id:"001Wj00000gnrug",name:"Kraken",hadOpportunity:!0},{id:"001Wj00000op4EW",name:"McCormick & Co Inc",hadOpportunity:!0},{id:"001Wj00000RCeqA",name:"Nielsen",hadOpportunity:!0},{id:"001Wj00000YEMZp",name:"Notion",hadOpportunity:!1},{id:"001Wj00000ix7c2",name:"Nouryon",hadOpportunity:!0},{id:"001Wj00000WYyKI",name:"Ramp",hadOpportunity:!0},{id:"001Wj00000hzxnD",name:"Ro Healthcare",hadOpportunity:!1},{id:"001Hp00003kIrMi",name:"Starbucks",hadOpportunity:!0},{id:"001Wj00000o5G0v",name:"StockX",hadOpportunity:!0},{id:"001Wj00000f3bWU",name:"TransUnion",hadOpportunity:!0},{id:"001Wj00000oqRyc",name:"Walgreens Boots Alliance",hadOpportunity:!0}]},"mike.ayres@eudia.com":{email:"mike.ayres@eudia.com",name:"Mike Ayres",accounts:[{id:"001Wj00000synYD",name:"Barry Callebaut Group",hadOpportunity:!1}]},"mike@eudia.com":{email:"mike@eudia.com",name:"Mike Masiello",accounts:[{id:"001Wj00000celOy",name:"Arizona Gov Office",hadOpportunity:!1},{id:"001Wj00000p1lCP",name:"Army Applications Lab",hadOpportunity:!0},{id:"001Wj00000p1hYb",name:"Army Corps of Engineers",hadOpportunity:!0},{id:"001Wj00000ZxEpD",name:"Army Futures Command",hadOpportunity:!0},{id:"001Hp00003lhZrR",name:"DARPA",hadOpportunity:!0},{id:"001Wj00000bWBlA",name:"Defense Innovation Unit (DIU)",hadOpportunity:!0},{id:"001Hp00003kJzoR",name:"Gov - Civ",hadOpportunity:!1},{id:"001Hp00003kJuJ5",name:"Gov - DOD",hadOpportunity:!0},{id:"001Wj00000p1PVH",name:"IFC",hadOpportunity:!0},{id:"001Wj00000UkYiC",name:"MITRE",hadOpportunity:!1},{id:"001Wj00000VVJ31",name:"NATO",hadOpportunity:!0},{id:"001Wj00000Ukxzt",name:"SIIA",hadOpportunity:!1},{id:"001Wj00000p1Ybm",name:"SOCOM",hadOpportunity:!0},{id:"001Wj00000Zwarp",name:"Second Front",hadOpportunity:!1},{id:"001Hp00003lhcL9",name:"Social Security Administration",hadOpportunity:!0},{id:"001Wj00000p1jH3",name:"State of Alaska",hadOpportunity:!0},{id:"001Wj00000hVa6V",name:"State of Arizona",hadOpportunity:!0},{id:"001Wj00000p0PcE",name:"State of California",hadOpportunity:!0},{id:"001Wj00000bWBke",name:"U.S. Air Force",hadOpportunity:!0},{id:"001Wj00000bWIzN",name:"U.S. Army",hadOpportunity:!0},{id:"001Hp00003kIrDU",name:"U.S. Government",hadOpportunity:!1},{id:"001Wj00000p1SRX",name:"U.S. Marine Corps",hadOpportunity:!0},{id:"001Wj00000hfaDc",name:"U.S. Navy",hadOpportunity:!0},{id:"001Wj00000Rrm5O",name:"UK Government",hadOpportunity:!0},{id:"001Hp00003lieJP",name:"USDA",hadOpportunity:!0},{id:"001Wj00000p1SuZ",name:"Vulcan Special Ops",hadOpportunity:!0}]},"mitch.loquaci@eudia.com":{email:"mitch.loquaci@eudia.com",name:"Mitch Loquaci",accounts:[{id:"001Hp00003kIrCn",name:"Home Depot",hadOpportunity:!0},{id:"001Wj00000wlTbU",name:"Mimecast",hadOpportunity:!1},{id:"001Wj00000cpxt0",name:"Novelis",hadOpportunity:!0}]},"nathan.shine@eudia.com":{email:"nathan.shine@eudia.com",name:"Nathan Shine",accounts:[{id:"001Wj00000xy4hv",name:"ASDA Group",hadOpportunity:!1},{id:"001Wj00000xz26A",name:"Achmea",hadOpportunity:!1},{id:"001Wj00000xyb9C",name:"Adient",hadOpportunity:!1},{id:"001Hp00003kIrEn",name:"Amphenol",hadOpportunity:!0},{id:"001Wj00000mCFr3",name:"Ancestry",hadOpportunity:!0},{id:"001Wj00000xxHhF",name:"Ashtead Group",hadOpportunity:!1},{id:"001Wj00000mCFr5",name:"Boomi",hadOpportunity:!1},{id:"001Wj00000mCFrQ",name:"CaliberAI",hadOpportunity:!1},{id:"001Wj00000WiFP8",name:"Cantor Fitzgerald",hadOpportunity:!0},{id:"001Wj00000mCFrj",name:"CarTrawler",hadOpportunity:!0},{id:"001Wj00000xz2UM",name:"Carnival",hadOpportunity:!1},{id:"001Wj00000pzTPd",name:"Circle K",hadOpportunity:!1},{id:"001Wj00000xyP82",name:"Claas Group",hadOpportunity:!1},{id:"001Wj00000bW3KA",name:"Cloud Software Group",hadOpportunity:!1},{id:"001Wj00000mHDBo",name:"Coimisiun na Mean",hadOpportunity:!0},{id:"001Wj00000mCFqt",name:"CommScope Technologies",hadOpportunity:!0},{id:"001Wj00000xz2ZC",name:"Continental",hadOpportunity:!1},{id:"001Wj00000Y6wFZ",name:"Coursera",hadOpportunity:!1},{id:"001Wj00000xz3DV",name:"Credit Mutuel Group",hadOpportunity:!1},{id:"001Wj00000Y6DDY",name:"Credit Suisse",hadOpportunity:!1},{id:"001Wj00000pzTPZ",name:"CubeMatch",hadOpportunity:!1},{id:"001Wj00000pzTPb",name:"Dawn Meats",hadOpportunity:!1},{id:"001Wj00000xxtwB",name:"Deutsche Telekom",hadOpportunity:!1},{id:"001Hp00003kIrDM",name:"Dropbox",hadOpportunity:!0},{id:"001Wj00000mCFra",name:"Dunnes Stores",hadOpportunity:!0},{id:"001Wj00000xxq75",name:"ELO Group",hadOpportunity:!1},{id:"001Wj00000xyEnj",name:"Engie",hadOpportunity:!1},{id:"001Wj00000mCFqu",name:"Fexco",hadOpportunity:!0},{id:"001Wj00000mCFsA",name:"First Derivatives",hadOpportunity:!1},{id:"001Wj00000mCFtD",name:"Flynn O'Driscoll, Business Lawyers",hadOpportunity:!1},{id:"001Wj00000xyMmu",name:"Forvia",hadOpportunity:!1},{id:"001Wj00000xz3Bt",name:"Freudenberg Group",hadOpportunity:!1},{id:"001Wj00000mCFro",name:"GemCap",hadOpportunity:!0},{id:"001Wj00000xxqjp",name:"Groupama",hadOpportunity:!1},{id:"001Wj00000xyFdR",name:"Groupe Eiffage",hadOpportunity:!1},{id:"001Wj00000xxtuZ",name:"Hays",hadOpportunity:!1},{id:"001Wj00000xy4A2",name:"HelloFresh",hadOpportunity:!1},{id:"001Wj00000mCFrq",name:"ID-Pal",hadOpportunity:!1},{id:"001Wj00000xz3IL",name:"ING Group",hadOpportunity:!1},{id:"001Wj00000xz2xN",name:"Inchcape",hadOpportunity:!1},{id:"001Wj00000mCFs5",name:"Indeed",hadOpportunity:!0},{id:"001Wj00000sooaT",name:"Ipsen",hadOpportunity:!1},{id:"001Wj00000mCFss",name:"Irish League of Credit Unions",hadOpportunity:!0},{id:"001Wj00000mCFrS",name:"Irish Life",hadOpportunity:!0},{id:"001Wj00000mCFsV",name:"Irish Residential Properties REIT Plc",hadOpportunity:!1},{id:"001Hp00003kIrJO",name:"Keurig Dr Pepper",hadOpportunity:!0},{id:"001Wj00000hkk0z",name:"Kingspan",hadOpportunity:!0},{id:"001Wj00000mCFrs",name:"Kitman Labs",hadOpportunity:!0},{id:"001Wj00000xy1VZ",name:"LDC Group",hadOpportunity:!1},{id:"001Wj00000mCFtF",name:"Let's Get Checked",hadOpportunity:!1},{id:"001Hp00003kIrJo",name:"Liberty Insurance",hadOpportunity:!1},{id:"001Wj00000xz2yz",name:"Marks and Spencer Group",hadOpportunity:!1},{id:"001Wj00000mCFsM",name:"McDermott Creed & Martyn",hadOpportunity:!0},{id:"001Hp00003kIrKF",name:"McKesson",hadOpportunity:!1},{id:"001Wj00000mCFso",name:"Mediolanum",hadOpportunity:!0},{id:"001Wj00000xyP9g",name:"Munich Re Group",hadOpportunity:!1},{id:"001Wj00000xxIyF",name:"Nationwide Building Society",hadOpportunity:!1},{id:"001Wj00000xxgZB",name:"Nebius Group",hadOpportunity:!1},{id:"001Wj00000symlp",name:"Nestl\xE9 Health Science",hadOpportunity:!1},{id:"001Wj00000xyYPq",name:"Nexans",hadOpportunity:!1},{id:"001Wj00000xybvb",name:"Next",hadOpportunity:!1},{id:"001Wj00000syczN",name:"Nomad Foods",hadOpportunity:!1},{id:"001Wj00000mCFrF",name:"OKG Payments Services Limited",hadOpportunity:!0},{id:"001Wj00000mCFqy",name:"Oneview Healthcare",hadOpportunity:!1},{id:"001Wj00000aCGRB",name:"Optum",hadOpportunity:!1},{id:"001Wj00000sylmX",name:"Orlen",hadOpportunity:!1},{id:"001Wj00000mCFrL",name:"PROS",hadOpportunity:!1},{id:"001Wj00000ZDPUI",name:"Perrigo Pharma",hadOpportunity:!0},{id:"001Wj00000xz33p",name:"Phoenix Pharma",hadOpportunity:!1},{id:"001Wj00000mCFqz",name:"Phoenix Tower International",hadOpportunity:!0},{id:"001Wj00000pzTPf",name:"Pipedrive",hadOpportunity:!1},{id:"001Wj00000mCFtS",name:"Poe Kiely Hogan Lanigan",hadOpportunity:!0},{id:"001Wj00000xxwys",name:"REWE Group",hadOpportunity:!1},{id:"001Wj00000xz3On",name:"Rexel",hadOpportunity:!1},{id:"001Wj00000xyJLy",name:"Royal BAM Group",hadOpportunity:!1},{id:"001Wj00000xysZq",name:"SPIE",hadOpportunity:!1},{id:"001Wj00000xxuVg",name:"SSE",hadOpportunity:!1},{id:"001Wj00000xxk1y",name:"Schaeffler",hadOpportunity:!1},{id:"001Wj00000syeJe",name:"Schott Pharma",hadOpportunity:!1},{id:"001Wj00000mCFrX",name:"South East Financial Services Cluster",hadOpportunity:!1},{id:"001Wj00000mCFry",name:"Spectrum Wellness Holdings Limited",hadOpportunity:!0},{id:"001Wj00000mCFsq",name:"Speed Fibre Group(enet)",hadOpportunity:!0},{id:"001Wj00000mCFtH",name:"StepStone Group",hadOpportunity:!0},{id:"001Hp00003kIrMp",name:"Stryker",hadOpportunity:!1},{id:"001Wj00000pzTPa",name:"SuperNode Ltd",hadOpportunity:!1},{id:"001Wj00000mCFtI",name:"Swish Fibre",hadOpportunity:!1},{id:"001Wj00000SFiOv",name:"TikTok",hadOpportunity:!0},{id:"001Wj00000ZDXTR",name:"Tinder LLC",hadOpportunity:!0},{id:"001Wj00000mCFrC",name:"Tines Security Services Limited",hadOpportunity:!0},{id:"001Wj00000xxQsc",name:"UDG Healthcare",hadOpportunity:!1},{id:"001Wj00000pzTPe",name:"Udaras na Gaeltachta",hadOpportunity:!1},{id:"001Wj00000bWBlE",name:"Udemy",hadOpportunity:!0},{id:"001Wj00000Y6VMX",name:"Unilever",hadOpportunity:!1},{id:"001Wj00000pzTPc",name:"Urban Volt",hadOpportunity:!1},{id:"001Wj00000xwB2o",name:"Vitesco Technologies Group",hadOpportunity:!1},{id:"001Hp00003liCZY",name:"Workday",hadOpportunity:!1},{id:"001Wj00000xyOlT",name:"X5 Retail Group",hadOpportunity:!1},{id:"001Wj00000xyXQZ",name:"Zalando",hadOpportunity:!1},{id:"001Wj00000Y6VZ3",name:"Ziff Davis",hadOpportunity:!1},{id:"001Wj00000mCFsZ",name:"Zurich Irish Life plc",hadOpportunity:!0}]},"nicola.fratini@eudia.com":{email:"nicola.fratini@eudia.com",name:"Nicola Fratini",accounts:[{id:"001Wj00000mCFqs",name:"AIB",hadOpportunity:!0},{id:"001Wj00000tWwXp",name:"AXIS Capital",hadOpportunity:!1},{id:"001Wj00000tWwXh",name:"Actavo Group Ltd",hadOpportunity:!1},{id:"001Wj00000thuKE",name:"Aer Lingus",hadOpportunity:!0},{id:"001Wj00000tWwXi",name:"Aer Rianta",hadOpportunity:!1},{id:"001Wj00000mCFrG",name:"AerCap",hadOpportunity:!0},{id:"001Wj00000YEMaB",name:"Aligned Incentives, a Bureau Veritas company",hadOpportunity:!1},{id:"001Wj00000mCFs7",name:"Allied Irish Banks plc",hadOpportunity:!0},{id:"001Wj00000mCFsb",name:"Amundi Ireland Limited",hadOpportunity:!0},{id:"001Wj00000uZ7w2",name:"Anna Charles",hadOpportunity:!1},{id:"001Wj00000TUdXw",name:"Anthropic",hadOpportunity:!0},{id:"001Wj00000mCFrD",name:"Applegreen",hadOpportunity:!1},{id:"001Wj00000wvc5a",name:"AppliedAI",hadOpportunity:!0},{id:"001Wj00000socke",name:"Archer The Well Company",hadOpportunity:!1},{id:"001Wj00000tWwXl",name:"Ardagh Glass Sales",hadOpportunity:!1},{id:"001Wj00000sgB1h",name:"Autorek",hadOpportunity:!1},{id:"001Wj00000mCFrh",name:"Avant Money",hadOpportunity:!0},{id:"001Wj00000tWwXT",name:"Avantcard",hadOpportunity:!1},{id:"001Wj00000mI7Na",name:"Aviva Insurance",hadOpportunity:!0},{id:"001Wj00000tWwXo",name:"Avolon",hadOpportunity:!1},{id:"001Wj00000uNUIB",name:"Bank of China",hadOpportunity:!0},{id:"001Hp00003kJ9kN",name:"Barclays",hadOpportunity:!0},{id:"001Wj00000ttPZB",name:"Barings",hadOpportunity:!0},{id:"001Wj00000tWwXW",name:"Beauparc Group",hadOpportunity:!0},{id:"001Wj00000xxRyK",name:"Bertelsmann",hadOpportunity:!1},{id:"001Wj00000tWwXX",name:"Bidx1",hadOpportunity:!1},{id:"001Wj00000soanc",name:"Borr Drilling",hadOpportunity:!1},{id:"001Wj00000tWwXu",name:"Boylesports",hadOpportunity:!1},{id:"001Wj00000uYz0o",name:"Bud Financial",hadOpportunity:!1},{id:"001Wj00000tWwXv",name:"Bunzl",hadOpportunity:!1},{id:"001Wj00000xxtGE",name:"Burelle",hadOpportunity:!1},{id:"001Wj00000mCFr0",name:"CNP Santander Insurance Services Limited",hadOpportunity:!0},{id:"001Wj00000tWwXw",name:"Cairn Homes",hadOpportunity:!0},{id:"001Wj00000uZ2hp",name:"Centrica",hadOpportunity:!1},{id:"001Wj00000uYYWv",name:"Checkout.com",hadOpportunity:!1},{id:"001Wj00000Y64qg",name:"Christian Dior Couture",hadOpportunity:!1},{id:"001Wj00000Y6VLh",name:"Citi",hadOpportunity:!0},{id:"001Wj00000mCFrE",name:"Clanwilliam Group",hadOpportunity:!0},{id:"001Wj00000tWwYl",name:"Clevercards",hadOpportunity:!1},{id:"001Wj00000mCFsm",name:"Coca-Cola HBC Ireland Limited",hadOpportunity:!0},{id:"001Wj00000xz30b",name:"Compagnie de l'Odet",hadOpportunity:!1},{id:"001Wj00000xxtOM",name:"Credit Industriel & Commercial",hadOpportunity:!1},{id:"001Wj00000uZ7RN",name:"Cuvva",hadOpportunity:!1},{id:"001Wj00000tx2MQ",name:"CyberArk",hadOpportunity:!0},{id:"001Wj00000tWwY1",name:"DAA",hadOpportunity:!1},{id:"001Wj00000xyNnm",name:"DS Smith",hadOpportunity:!1},{id:"001Wj00000hkk0s",name:"DSM",hadOpportunity:!1},{id:"001Wj00000hfWMt",name:"Dassault Syst?mes",hadOpportunity:!1},{id:"001Wj00000mCFsB",name:"Datalex",hadOpportunity:!0},{id:"001Wj00000mCFrl",name:"Davy",hadOpportunity:!0},{id:"001Wj00000tWwYm",name:"Deliveroo",hadOpportunity:!1},{id:"001Wj00000w0uVV",name:"Doceree",hadOpportunity:!0},{id:"001Wj00000vbvuX",name:"Dole plc",hadOpportunity:!1},{id:"001Wj00000tWwXZ",name:"EVO Payments",hadOpportunity:!1},{id:"001Wj00000xxsvH",name:"EXOR Group",hadOpportunity:!1},{id:"001Wj00000tWwY4",name:"Easons",hadOpportunity:!1},{id:"001Wj00000xz35R",name:"EasyJet",hadOpportunity:!1},{id:"001Wj00000xx4SK",name:"Edeka Zentrale",hadOpportunity:!1},{id:"001Wj00000uJwxo",name:"Eir",hadOpportunity:!0},{id:"001Wj00000tWwY5",name:"Elavon",hadOpportunity:!1},{id:"001Wj00000pzTPn",name:"Euronext Dublin",hadOpportunity:!1},{id:"001Wj00000sg8Gc",name:"FARFETCH",hadOpportunity:!0},{id:"001Wj00000mIEAX",name:"FNZ Group",hadOpportunity:!0},{id:"001Wj00000tWwY7",name:"First Data",hadOpportunity:!1},{id:"001Wj00000soigL",name:"Fresenius Kabi",hadOpportunity:!1},{id:"001Wj00000xyXyQ",name:"FrieslandCampina",hadOpportunity:!1},{id:"001Wj00000xyAP9",name:"GasTerra",hadOpportunity:!1},{id:"001Wj00000mCFt1",name:"Goodbody Stockbrokers",hadOpportunity:!0},{id:"001Wj00000soN5f",name:"Greencore",hadOpportunity:!1},{id:"001Wj00000xyyli",name:"Groupe BPCE",hadOpportunity:!1},{id:"001Wj00000xz9xF",name:"Haleon",hadOpportunity:!1},{id:"001Wj00000xz3S2",name:"Hapag-Lloyd",hadOpportunity:!1},{id:"001Wj00000tWwY9",name:"Henderson Group",hadOpportunity:!1},{id:"001Wj00000Y6VMb",name:"Henkel",hadOpportunity:!1},{id:"001Hp00003liHvf",name:"Hubspot",hadOpportunity:!0},{id:"001Wj00000sg9MN",name:"INNIO Group",hadOpportunity:!1},{id:"001Wj00000bzz9O",name:"IPG Mediabrands",hadOpportunity:!0},{id:"001Wj00000tWwYA",name:"IPL Plastics",hadOpportunity:!1},{id:"001Wj00000ZDXrd",name:"Intercom",hadOpportunity:!0},{id:"001Wj00000tWwYB",name:"Ires Reit",hadOpportunity:!1},{id:"001Wj00000xy2WS",name:"J. Sainsbury",hadOpportunity:!1},{id:"001Wj00000xyG3B",name:"JD Sports Fashion",hadOpportunity:!1},{id:"001Wj00000ullPp",name:"Jet2 Plc",hadOpportunity:!0},{id:"001Wj00000xyIeR",name:"KION Group",hadOpportunity:!1},{id:"001Wj00000tWwXb",name:"Keywords Studios",hadOpportunity:!1},{id:"001Wj00000xxdOO",name:"Kingfisher",hadOpportunity:!1},{id:"001Wj00000xy0o1",name:"Knorr-Bremse",hadOpportunity:!1},{id:"001Wj00000xxuVi",name:"L'Oreal",hadOpportunity:!1},{id:"001Wj00000xwh4I",name:"Landesbank Baden-Wurttemberg",hadOpportunity:!1},{id:"001Wj00000au3sw",name:"Lenovo",hadOpportunity:!0},{id:"001Wj00000sobq8",name:"MOL Magyarorsz\xE1g",hadOpportunity:!1},{id:"001Wj00000xwrq3",name:"Michelin",hadOpportunity:!1},{id:"001Wj00000xz3i9",name:"Mondi Group",hadOpportunity:!1},{id:"001Wj00000xxaf3",name:"NatWest Group",hadOpportunity:!1},{id:"001Wj00000xzFJV",name:"Norddeutsche Landesbank",hadOpportunity:!1},{id:"001Hp00003kIrKm",name:"Northern Trust Management Services",hadOpportunity:!0},{id:"001Wj00000bWIxi",name:"Novo Nordisk",hadOpportunity:!1},{id:"001Wj00000TV1Wz",name:"OpenAi",hadOpportunity:!0},{id:"001Wj00000tWwYh",name:"Origin Enterprises",hadOpportunity:!1},{id:"001Wj00000xz3dJ",name:"Otto",hadOpportunity:!1},{id:"001Wj00000tWwYs",name:"Panda Waste",hadOpportunity:!1},{id:"001Wj00000tWwYJ",name:"Paysafe",hadOpportunity:!1},{id:"001Wj00000souuM",name:"Premier Foods",hadOpportunity:!1},{id:"001Wj00000xyzrT",name:"RWE",hadOpportunity:!1},{id:"001Wj00000u0eJp",name:"Re-Turn",hadOpportunity:!0},{id:"001Wj00000xyAdg",name:"SGAM La Mondiale",hadOpportunity:!1},{id:"001Wj00000sg2T0",name:"SHEIN",hadOpportunity:!0},{id:"001Wj00000hfaEC",name:"Safran",hadOpportunity:!1},{id:"001Wj00000sonmQ",name:"Sandoz",hadOpportunity:!1},{id:"001Wj00000xz9ik",name:"Savencia",hadOpportunity:!1},{id:"001Wj00000xyGKs",name:"Sodexo",hadOpportunity:!1},{id:"001Wj00000c9oD6",name:"Stripe",hadOpportunity:!0},{id:"001Hp00003kKrS0",name:"Sword Health",hadOpportunity:!0},{id:"001Wj00000soZus",name:"Tate & Lyle",hadOpportunity:!1},{id:"001Wj00000mEEkG",name:"Team Car Care dba Jiffy Lube",hadOpportunity:!0},{id:"001Hp00003kIrN0",name:"Teleperformance",hadOpportunity:!1},{id:"001Wj00000vzG8f",name:"Temu",hadOpportunity:!1},{id:"001Wj00000xy9fz",name:"Tennet Holding",hadOpportunity:!1},{id:"001Wj00000tWwXf",name:"The Est\xE9e Lauder Companies Inc.",hadOpportunity:!1},{id:"001Wj00000Y6DDc",name:"The HEINEKEN Company",hadOpportunity:!1},{id:"001Wj00000tWwYV",name:"The Irish Stock Exchange",hadOpportunity:!1},{id:"001Wj00000xxp7o",name:"Thuga Holding",hadOpportunity:!1},{id:"001Wj00000xyBgC",name:"ThyssenKrupp",hadOpportunity:!1},{id:"001Wj00000tWwYW",name:"Total Produce plc",hadOpportunity:!1},{id:"001Wj00000xxxLU",name:"TotalEnergies",hadOpportunity:!1},{id:"001Wj00000mIBpN",name:"Transworld Business Advisors",hadOpportunity:!0},{id:"001Wj00000mCFs1",name:"Twitter",hadOpportunity:!0},{id:"001Wj00000xV8Vg",name:"UNHCR, the UN Refugee Agency",hadOpportunity:!0},{id:"001Wj00000xxo5I",name:"United Internet",hadOpportunity:!1},{id:"001Wj00000bWIzw",name:"Veolia | Water Tech",hadOpportunity:!1},{id:"001Hp00003kIrDA",name:"Verizon",hadOpportunity:!0},{id:"001Wj00000tWwXd",name:"Virgin Media Ireland Limited",hadOpportunity:!1},{id:"001Wj00000sgaj9",name:"Volkswagon",hadOpportunity:!0},{id:"001Wj00000ZDTG9",name:"Waystone",hadOpportunity:!0},{id:"001Wj00000pB5DX",name:"White Swan Data",hadOpportunity:!0},{id:"001Wj00000xwL2A",name:"Wm. Morrison Supermarkets",hadOpportunity:!1},{id:"001Wj00000mIB6E",name:"Zendesk",hadOpportunity:!0},{id:"001Wj00000S4r49",name:"Zoom",hadOpportunity:!0}]},"olivia.jung@eudia.com":{email:"olivia.jung@eudia.com",name:"Olivia Jung",accounts:[{id:"001Hp00003kIrED",name:"3M",hadOpportunity:!1},{id:"001Hp00003kIrEK",name:"ADP",hadOpportunity:!1},{id:"001Hp00003kIrEO",name:"AES",hadOpportunity:!0},{id:"001Hp00003kIrEG",name:"AbbVie",hadOpportunity:!1},{id:"001Wj00000mCFrd",name:"Airship Group Inc",hadOpportunity:!0},{id:"001Hp00003kIrET",name:"Albemarle",hadOpportunity:!1},{id:"001Hp00003kIrEZ",name:"Ally Financial",hadOpportunity:!1},{id:"001Hp00003kIrEc",name:"Altria Group",hadOpportunity:!1},{id:"001Hp00003kIrEf",name:"Ameren",hadOpportunity:!1},{id:"001Hp00003kIrEi",name:"American Family Insurance Group",hadOpportunity:!1},{id:"001Wj00000YIOI1",name:"Aptiv",hadOpportunity:!0},{id:"001Hp00003kIrFA",name:"Astellas",hadOpportunity:!0},{id:"001Hp00003kIrFD",name:"Autoliv",hadOpportunity:!1},{id:"001Hp00003kIrDJ",name:"Avery Dennison",hadOpportunity:!1},{id:"001Hp00003kIrDG",name:"Bain",hadOpportunity:!0},{id:"001Hp00003kIrFL",name:"Bank of America",hadOpportunity:!0},{id:"001Hp00003kIrFN",name:"Bath & Body Works",hadOpportunity:!1},{id:"001Hp00003kIrFQ",name:"Becton Dickinson",hadOpportunity:!1},{id:"001Hp00003kIrFV",name:"Best Buy",hadOpportunity:!0},{id:"001Hp00003kIrDY",name:"Blackstone",hadOpportunity:!0},{id:"001Hp00003kIrFb",name:"Boeing",hadOpportunity:!0},{id:"001Hp00003kIrFf",name:"BorgWarner",hadOpportunity:!1},{id:"001Hp00003kIrFk",name:"Bristol-Myers Squibb",hadOpportunity:!0},{id:"001Hp00003kIrFo",name:"Burlington Stores",hadOpportunity:!1},{id:"001Wj00000Y6VLn",name:"CHANEL",hadOpportunity:!1},{id:"001Hp00003kIrGK",name:"CHS",hadOpportunity:!0},{id:"001Hp00003kJ9kw",name:"CSL",hadOpportunity:!0},{id:"001Hp00003kIrGq",name:"CVS Health",hadOpportunity:!1},{id:"001Hp00003kIrG7",name:"Cencora (formerly AmerisourceBergen)",hadOpportunity:!1},{id:"001Hp00003kIrGE",name:"Charter Communications",hadOpportunity:!0},{id:"001Hp00003kIrDZ",name:"Ciena",hadOpportunity:!0},{id:"001Hp00003kIrGL",name:"Cintas",hadOpportunity:!1},{id:"001Wj00000c6df9",name:"Clear",hadOpportunity:!0},{id:"001Wj00000eLOI4",name:"Cleveland Clinic",hadOpportunity:!1},{id:"001Hp00003kIrGO",name:"Cleveland-Cliffs",hadOpportunity:!1},{id:"001Hp00003kIrGQ",name:"Coca-Cola",hadOpportunity:!1},{id:"001Hp00003kIrGX",name:"Conagra Brands",hadOpportunity:!1},{id:"001Hp00003kIrGZ",name:"Consolidated Edison",hadOpportunity:!0},{id:"001Wj00000jK5Hl",name:"Crate & Barrel",hadOpportunity:!0},{id:"001Hp00003kIrGo",name:"Cummins",hadOpportunity:!0},{id:"001Hp00003kIrGu",name:"Danaher",hadOpportunity:!1},{id:"001Wj00000bzz9R",name:"Datadog",hadOpportunity:!0},{id:"001Wj00000aZvt9",name:"Dolby",hadOpportunity:!0},{id:"001Hp00003kIrHB",name:"Dominion Energy",hadOpportunity:!1},{id:"001Hp00003kIrHE",name:"Dow",hadOpportunity:!1},{id:"001Hp00003kIrHH",name:"Duke Energy",hadOpportunity:!1},{id:"001Wj00000hkk0j",name:"Etsy",hadOpportunity:!0},{id:"001Hp00003kIrI7",name:"Ford",hadOpportunity:!1},{id:"001Hp00003kIrIL",name:"General Dynamics",hadOpportunity:!1},{id:"001Wj00000ScUQ3",name:"General Electric",hadOpportunity:!1},{id:"001Hp00003kIrIN",name:"General Motors",hadOpportunity:!1},{id:"001Hp00003kIrIS",name:"Gilead Sciences",hadOpportunity:!0},{id:"001Hp00003kIrE8",name:"Graybar Electric",hadOpportunity:!0},{id:"001Hp00003kIrDO",name:"Guardian Life Ins",hadOpportunity:!0},{id:"001Wj00000dvgdb",name:"HealthEquity",hadOpportunity:!0},{id:"001Hp00003kIrJ9",name:"Intuit",hadOpportunity:!0},{id:"001Wj00000aLlyV",name:"J.Crew",hadOpportunity:!0},{id:"001Hp00003kKKMc",name:"JPmorganchase",hadOpportunity:!0},{id:"001Hp00003kIrJI",name:"John Deere",hadOpportunity:!1},{id:"001Hp00003kIrDQ",name:"Jones Lang LaSalle",hadOpportunity:!0},{id:"001Wj00000hfaE1",name:"Lowe",hadOpportunity:!1},{id:"001Hp00003kIrDj",name:"Marsh McLennan",hadOpportunity:!0},{id:"001Hp00003kIrEA",name:"Mastercard",hadOpportunity:!0},{id:"001Wj00000QBapC",name:"Mayo Clinic",hadOpportunity:!1},{id:"001Hp00003kIrD7",name:"McDonald's",hadOpportunity:!1},{id:"001Hp00003kIrD8",name:"Medtronic",hadOpportunity:!0},{id:"001Hp00003kIrKK",name:"Merck",hadOpportunity:!0},{id:"001Hp00003kJ9lG",name:"Meta",hadOpportunity:!0},{id:"001Hp00003kIrKS",name:"Mondelez International",hadOpportunity:!0},{id:"001Hp00003kIrKU",name:"Motorola Solutions",hadOpportunity:!0},{id:"001Wj00000Y6VYj",name:"NBCUniversal",hadOpportunity:!1},{id:"001Wj00000j3QN2",name:"Nasdaq Private Market",hadOpportunity:!1},{id:"001Hp00003kIrCq",name:"Nationwide Insurance",hadOpportunity:!1},{id:"001Wj00000Y6VML",name:"Nestle",hadOpportunity:!1},{id:"001Hp00003kIrLF",name:"Paramount",hadOpportunity:!1},{id:"001Hp00003kIrLO",name:"Pfizer",hadOpportunity:!0},{id:"001Wj00000wzgaP",name:"Philip Morris International",hadOpportunity:!1},{id:"001Hp00003kIrLa",name:"Prudential",hadOpportunity:!1},{id:"001Hp00003kIrLp",name:"Raytheon Technologies",hadOpportunity:!1},{id:"001Hp00003kIrDz",name:"Shopify",hadOpportunity:!0},{id:"001Wj00000eLWPF",name:"Stellantis",hadOpportunity:!1},{id:"001Wj00000iS9AJ",name:"TE Connectivity",hadOpportunity:!0},{id:"001Hp00003kIrMx",name:"Target",hadOpportunity:!1},{id:"001Wj00000PjGDa",name:"The Weir Group PLC",hadOpportunity:!0},{id:"001Hp00003kIrDF",name:"Thermo Fisher Scientific",hadOpportunity:!0},{id:"001Hp00003kIrCw",name:"Toshiba US",hadOpportunity:!0},{id:"001Hp00003kIrNb",name:"Unisys",hadOpportunity:!0},{id:"001Hp00003kIrO7",name:"Wells Fargo",hadOpportunity:!0},{id:"001Wj00000kD7MA",name:"Wellspan Health",hadOpportunity:!0},{id:"001Hp00003kIrOA",name:"Western Digital",hadOpportunity:!0},{id:"001Wj00000kD3s1",name:"White Cap",hadOpportunity:!0}]},"rajeev.patel@eudia.com":{email:"rajeev.patel@eudia.com",name:"Rajeev Patel",accounts:[{id:"001Wj00000fFW35",name:"Alnylam Pharmaceuticals",hadOpportunity:!0},{id:"001Wj00000woNmQ",name:"Beiersdorf",hadOpportunity:!1},{id:"001Wj00000vCOx2",name:"Cambridge Associates",hadOpportunity:!1},{id:"001Wj00000wE56T",name:"Care Vet Health",hadOpportunity:!1},{id:"001Wj00000dIjyB",name:"CareVet, LLC",hadOpportunity:!1},{id:"001Wj00000xZEkY",name:"Modern Treasury",hadOpportunity:!1},{id:"001Wj00000vv2vX",name:"Nextdoor",hadOpportunity:!1}]},"riley.stack@eudia.com":{email:"riley.stack@eudia.com",name:"Riley Stack",accounts:[{id:"001Wj00000XiEDy",name:"Coinbase",hadOpportunity:!0},{id:"001Wj00000YEMa8",name:"Turing",hadOpportunity:!0}]},"sean.boyd@eudia.com":{email:"sean.boyd@eudia.com",name:"Sean Boyd",accounts:[{id:"001Hp00003kIrE9",name:"IQVIA",hadOpportunity:!0}]},"tom.clancy@eudia.com":{email:"tom.clancy@eudia.com",name:"Tom Clancy",accounts:[{id:"001Wj00000pB30V",name:"AIR (Advanced Inhalation Rituals)",hadOpportunity:!0},{id:"001Wj00000qLRqW",name:"ASML",hadOpportunity:!0},{id:"001Wj00000xyA0y",name:"Aegon",hadOpportunity:!1},{id:"001Wj00000xxpcR",name:"Air France-KLM Group",hadOpportunity:!1},{id:"001Wj00000xyIg2",name:"Akzo Nobel",hadOpportunity:!1},{id:"001Wj00000qFynV",name:"Alexion Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000xwuUW",name:"Alstom",hadOpportunity:!1},{id:"001Wj00000xxtL6",name:"Anglo American",hadOpportunity:!1},{id:"001Wj00000syHJt",name:"Aryzta",hadOpportunity:!1},{id:"001Wj00000tWwXq",name:"BAM Ireland",hadOpportunity:!1},{id:"001Wj00000c9oCe",name:"BLDG Management Co., Inc.",hadOpportunity:!0},{id:"001Wj00000hfWN1",name:"Balfour Beatty US",hadOpportunity:!1},{id:"001Wj00000fFuFM",name:"Bank of Ireland",hadOpportunity:!0},{id:"001Wj00000xy23Q",name:"Bayerische Landesbank",hadOpportunity:!1},{id:"001Wj00000tWwXt",name:"Boots",hadOpportunity:!1},{id:"001Wj00000xyIOL",name:"Ceconomy",hadOpportunity:!1},{id:"001Wj00000tWwXx",name:"Chanelle Pharma",hadOpportunity:!1},{id:"001Hp00003kIrD3",name:"Cisco Systems",hadOpportunity:!0},{id:"001Wj00000xyqxq",name:"Computacenter",hadOpportunity:!1},{id:"001Wj00000xy0ss",name:"Constellium",hadOpportunity:!1},{id:"001Wj00000Y6Vk0",name:"Credit Agricole CIB",hadOpportunity:!1},{id:"001Wj00000xwf7G",name:"Daimler Truck Holding",hadOpportunity:!1},{id:"001Wj00000xyaWU",name:"Delivery Hero",hadOpportunity:!1},{id:"001Wj00000mCFsz",name:"Electricity Supply Board",hadOpportunity:!0},{id:"001Wj00000sp0Bl",name:"Ensco PLC",hadOpportunity:!1},{id:"001Wj00000xz374",name:"EssilorLuxottica",hadOpportunity:!1},{id:"001Wj00000hfaDT",name:"Experian",hadOpportunity:!1},{id:"001Wj00000tWwY6",name:"Fineos",hadOpportunity:!1},{id:"001Wj00000mCFsd",name:"Fujitsu",hadOpportunity:!1},{id:"001Wj00000mCFrc",name:"Glanbia",hadOpportunity:!0},{id:"001Wj00000mHuzr",name:"IHRB",hadOpportunity:!1},{id:"001Wj00000xy9Ho",name:"Imperial Brands",hadOpportunity:!1},{id:"001Wj00000sp1nl",name:"Ina Groupa",hadOpportunity:!1},{id:"001Wj00000xz3ev",name:"Infineon",hadOpportunity:!1},{id:"001Wj00000xyMzn",name:"JDE Peet's",hadOpportunity:!1},{id:"001Wj00000hfWN2",name:"Jazz Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000soxsD",name:"Jazz Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000xxtcq",name:"John Lewis Partnership",hadOpportunity:!1},{id:"001Wj00000tWwYo",name:"Just Eat",hadOpportunity:!1},{id:"001Wj00000xz3jl",name:"KfW Group",hadOpportunity:!1},{id:"001Wj00000tWwYD",name:"Ladbrokes",hadOpportunity:!1},{id:"001Wj00000xystC",name:"Lanxess Group",hadOpportunity:!1},{id:"001Wj00000vRNFu",name:"Legal & General",hadOpportunity:!1},{id:"001Wj00000xxgZC",name:"Legrand",hadOpportunity:!1},{id:"001Wj00000Y64qm",name:"Louis Dreyfus Company",hadOpportunity:!1},{id:"001Wj00000xyGRQ",name:"Lufthansa Group",hadOpportunity:!1},{id:"001Wj00000pA6d7",name:"Masdar Future Energy Company",hadOpportunity:!0},{id:"001Wj00000xz0xC",name:"Metro",hadOpportunity:!1},{id:"001Wj00000xzAen",name:"Motability Operations Group",hadOpportunity:!1},{id:"001Wj00000mCFrv",name:"Ornua",hadOpportunity:!1},{id:"001Hp00003kIrLK",name:"Pepsi",hadOpportunity:!1},{id:"001Wj00000qFudS",name:"Pluralsight",hadOpportunity:!1},{id:"001Wj00000xyODc",name:"Puma",hadOpportunity:!1},{id:"001Wj00000iC14Z",name:"RELX",hadOpportunity:!1},{id:"001Wj00000tWwYj",name:"Rabobank",hadOpportunity:!1},{id:"001Wj00000xyU9M",name:"Reckitt Benckiser",hadOpportunity:!1},{id:"001Wj00000xz3bh",name:"Rentokil Initial",hadOpportunity:!1},{id:"001Wj00000sp1hL",name:"SBM Offshore",hadOpportunity:!1},{id:"001Wj00000xybkK",name:"SHV Holdings",hadOpportunity:!1},{id:"001Wj00000xz3gX",name:"SNCF Group",hadOpportunity:!1},{id:"001Wj00000tWwYt",name:"Sage",hadOpportunity:!1},{id:"001Wj00000sGEuO",name:"Sanofi",hadOpportunity:!1},{id:"001Wj00000qL7AG",name:"Seismic",hadOpportunity:!0},{id:"001Wj00000soyhp",name:"Stada Group",hadOpportunity:!1},{id:"001Wj00000xytSg",name:"Standard Chartered",hadOpportunity:!1},{id:"001Wj00000tWwYq",name:"Symantec",hadOpportunity:!1},{id:"001Wj00000pAPW2",name:"Tarmac",hadOpportunity:!0},{id:"001Wj00000xxvA1",name:"Technip Energies",hadOpportunity:!1},{id:"001Wj00000tWwYU",name:"Tegral Building Products",hadOpportunity:!1},{id:"001Wj00000fFuFq",name:"The Boots Group",hadOpportunity:!1},{id:"001Wj00000tWwYk",name:"Three",hadOpportunity:!1},{id:"001Wj00000xy5HP",name:"Trane Technologies",hadOpportunity:!1},{id:"001Wj00000sohCP",name:"Trans Ocean",hadOpportunity:!1},{id:"001Wj00000mCFtO",name:"Uisce Eireann (Irish Water)",hadOpportunity:!0},{id:"001Wj00000xyQ5k",name:"Uniper",hadOpportunity:!1},{id:"001Wj00000xz1GY",name:"Valeo",hadOpportunity:!1},{id:"001Wj00000pBibT",name:"Version1",hadOpportunity:!0},{id:"001Wj00000xy2BT",name:"Vivendi",hadOpportunity:!1},{id:"001Wj00000xyulK",name:"Wacker Chemie",hadOpportunity:!1},{id:"001Wj00000tWwYZ",name:"Wyeth Nutritionals Ireland",hadOpportunity:!1},{id:"001Wj00000mI9qo",name:"XACT Data Discovery",hadOpportunity:!0},{id:"001Wj00000xyq3P",name:"ZF Friedrichshafen",hadOpportunity:!1}]}}},L=class{constructor(r){this.cachedData=null;this.serverUrl=r}async getAccountsForUser(r){return(await this.getAccountsWithProspects(r)).accounts}async getAccountsWithProspects(r){let t=r.toLowerCase().trim(),e=await this.fetchFromServerWithProspects(t);if(e&&(e.accounts.length>0||e.prospects.length>0))return console.log(`[AccountOwnership] Got ${e.accounts.length} active + ${e.prospects.length} prospects from server for ${t}`),e;console.log(`[AccountOwnership] Using static data fallback for ${t}`);let n=this.getAccountsFromStatic(t),a=n.filter(s=>s.hadOpportunity!==!1),i=n.filter(s=>s.hadOpportunity===!1);return{accounts:a,prospects:i}}getAccountsFromStatic(r){if(ge(r)==="sales_leader"){let i=Ge(r);if(i.length===0)return console.log(`[AccountOwnership] No direct reports found for sales leader: ${r}`),[];let s=new Map;for(let l of i){let c=D.businessLeads[l];if(c)for(let d of c.accounts)s.has(d.id)||s.set(d.id,{...d,isOwned:!1})}let o=Array.from(s.values()).sort((l,c)=>l.name.localeCompare(c.name));return console.log(`[AccountOwnership] Found ${o.length} static accounts for sales leader ${r} (from ${i.length} direct reports)`),o}let e=D.businessLeads[r],n=e?e.accounts.map(i=>({...i,isOwned:!0})):[],a=Be[r];if(a){let i=ye(a),s=new Set(n.map(l=>l.id));for(let l of i){let c=D.businessLeads[l];if(c)for(let d of c.accounts)s.has(d.id)||(n.push({...d,isOwned:!1}),s.add(d.id))}let o=n.sort((l,c)=>l.name.localeCompare(c.name));return console.log(`[AccountOwnership] Pod-view user ${r} (${a}): ${o.length} static accounts (${e?.accounts.length||0} owned + region)`),o}return e?(console.log(`[AccountOwnership] Found ${e.accounts.length} static accounts for ${r} (own accounts only)`),e.accounts):(console.log(`[AccountOwnership] No static mapping found for: ${r}`),[])}async fetchFromServer(r){let t=await this.fetchFromServerWithProspects(r);return t?t.accounts:null}async fetchFromServerWithProspects(r){let t=`${this.serverUrl}/api/accounts/ownership/${encodeURIComponent(r)}`;console.log(`[AccountOwnership] Fetching accounts from: ${t}`);let e=n=>({id:n.id,name:n.name,type:n.type||"Prospect",hadOpportunity:n.hadOpportunity??!0,website:n.website||void 0,industry:n.industry||void 0});try{let{requestUrl:n}=await import("obsidian"),a=await n({url:t,method:"GET",headers:{Accept:"application/json"},throw:!1});if(console.log(`[AccountOwnership] requestUrl status: ${a.status}`),a.status===200&&a.json?.success){let i=(a.json.accounts||[]).map(e),s=(a.json.prospectAccounts||[]).map(e);return console.log(`[AccountOwnership] requestUrl success: ${i.length} accounts, ${s.length} prospects`),{accounts:i,prospects:s}}console.log("[AccountOwnership] requestUrl returned non-success:",a.status,a.json?.message||"")}catch(n){console.error("[AccountOwnership] requestUrl failed:",n?.message||n)}try{console.log("[AccountOwnership] Trying native fetch fallback...");let n=await fetch(t,{method:"GET",headers:{Accept:"application/json"}});if(console.log(`[AccountOwnership] fetch status: ${n.status}`),n.ok){let a=await n.json();if(a?.success){let i=(a.accounts||[]).map(e),s=(a.prospectAccounts||[]).map(e);return console.log(`[AccountOwnership] fetch success: ${i.length} accounts, ${s.length} prospects`),{accounts:i,prospects:s}}}}catch(n){console.error("[AccountOwnership] Native fetch also failed:",n?.message||n)}return console.warn(`[AccountOwnership] Both requestUrl and fetch failed for ${r}`),null}async getNewAccounts(r,t){let e=await this.getAccountsForUser(r),n=t.map(a=>a.toLowerCase().trim());return e.filter(a=>{let i=a.name.toLowerCase().trim();return!n.some(s=>s===i||s.startsWith(i)||i.startsWith(s))})}findTeamLeader(r){let t=r.toLowerCase().trim();for(let[e,n]of Object.entries(ee))if(n.includes(t))return e;return null}hasUser(r){return r.toLowerCase().trim()in D.businessLeads}getAllBusinessLeads(){return Object.keys(D.businessLeads)}getBusinessLead(r){let t=r.toLowerCase().trim();return D.businessLeads[t]||null}getDataVersion(){return D.version}async getAllAccountsForAdmin(r){let t=r.toLowerCase().trim();if(!M(t))return console.log(`[AccountOwnership] ${t} is not an admin, returning owned accounts only`),this.getAccountsForUser(t);let e=await this.fetchAllAccountsFromServer();if(e&&e.length>0){let n=await this.getAccountsForUser(t),a=new Set(n.map(i=>i.id));return e.map(i=>({...i,isOwned:a.has(i.id)}))}return console.log("[AccountOwnership] Using static data fallback for admin all-accounts"),this.getAllAccountsFromStatic(t)}async getExecProductAccounts(r){let t=r.toLowerCase().trim(),e=`${this.serverUrl}/api/accounts/ownership/${encodeURIComponent(t)}?role=exec`;console.log(`[AccountOwnership] Fetching exec/product accounts from: ${e}`);let n=a=>({id:a.id,name:a.name,type:a.type||"Prospect",hadOpportunity:a.hadOpportunity??!0,website:a.website||void 0,industry:a.industry||void 0});try{let{requestUrl:a}=await import("obsidian"),i=await a({url:e,method:"GET",headers:{Accept:"application/json"},throw:!1});if(i.status===200&&i.json?.success){let s=(i.json.accounts||[]).map(n);return console.log(`[AccountOwnership] Exec/product accounts: ${s.length}`),s}}catch(a){console.warn("[AccountOwnership] Exec/product fetch failed:",a)}return console.log("[AccountOwnership] Exec/product fallback: using static CS accounts"),[...F]}getAllAccountsFromStatic(r){let t=new Map,e=new Set,n=D.businessLeads[r];if(n)for(let a of n.accounts)e.add(a.id),t.set(a.id,{...a,isOwned:!0});for(let a of Object.values(D.businessLeads))for(let i of a.accounts)t.has(i.id)||t.set(i.id,{...i,isOwned:!1});return Array.from(t.values()).sort((a,i)=>a.name.localeCompare(i.name))}async getCSAccounts(r){let t=r.toLowerCase().trim();console.log(`[AccountOwnership] Fetching CS accounts for: ${t}`);let e=3,n=3e3;for(let i=1;i<=e;i++)try{let{requestUrl:s,Notice:o}=await import("obsidian");console.log(`[AccountOwnership] CS fetch attempt ${i}/${e} for ${t}`);let l=await s({url:`${this.serverUrl}/api/bl-accounts/${encodeURIComponent(t)}`,method:"GET",headers:{Accept:"application/json"},throw:!1});if(console.log(`[AccountOwnership] CS fetch response status: ${l.status}`),l.status===200&&l.json?.success){let c=(l.json.accounts||[]).map(u=>({id:u.id,name:u.name,type:u.customerType||u.type||"Customer",isOwned:!1,hadOpportunity:!0,website:u.website||null,industry:u.industry||null,ownerName:u.ownerName||null,csmName:u.csmName||null})),d=(l.json.prospectAccounts||[]).map(u=>({id:u.id,name:u.name,type:u.customerType||u.type||"Prospect",isOwned:!1,hadOpportunity:!1,website:u.website||null,industry:u.industry||null,ownerName:u.ownerName||null,csmName:u.csmName||null}));if(c.length>0)return console.log(`[AccountOwnership] CS accounts for ${t}: ${c.length} active + ${d.length} prospects`),new o(`Found ${c.length} CS accounts`),{accounts:c,prospects:d};if(console.warn(`[AccountOwnership] CS fetch attempt ${i}: server returned success but 0 accounts (Salesforce not ready)`),i<e){console.log(`[AccountOwnership] Retrying in ${n}ms...`),await new Promise(u=>setTimeout(u,n));continue}}else console.warn(`[AccountOwnership] CS fetch attempt ${i} returned status ${l.status} for ${t}`),i<e&&(console.log(`[AccountOwnership] Retrying in ${n}ms...`),await new Promise(c=>setTimeout(c,n)))}catch(s){console.error(`[AccountOwnership] CS account fetch attempt ${i} failed for ${t}:`,s),i<e&&(console.log(`[AccountOwnership] Retrying in ${n}ms after error...`),await new Promise(o=>setTimeout(o,n)))}console.warn(`[AccountOwnership] Server returned no CS accounts after ${e} attempts. Using static fallback (${F.length} accounts).`);let{Notice:a}=await import("obsidian");return new a(`Loading ${F.length} CS accounts (server warming up)`),{accounts:[...F],prospects:[]}}async fetchAllAccountsFromServer(){try{let{requestUrl:r}=await import("obsidian"),t=await r({url:`${this.serverUrl}/api/accounts/all`,method:"GET",headers:{Accept:"application/json"}});return t.json?.success&&t.json?.accounts?t.json.accounts.map(e=>({id:e.id,name:e.name,type:e.type||"Prospect"})):null}catch(r){return console.log("[AccountOwnership] Server fetch all accounts failed:",r),null}}};var ve=[{value:"America/New_York",label:"Eastern Time (ET)"},{value:"America/Chicago",label:"Central Time (CT)"},{value:"America/Denver",label:"Mountain Time (MT)"},{value:"America/Los_Angeles",label:"Pacific Time (PT)"},{value:"Europe/London",label:"London (GMT/BST)"},{value:"Europe/Dublin",label:"Dublin (GMT/IST)"},{value:"Europe/Paris",label:"Central Europe (CET)"},{value:"Europe/Berlin",label:"Berlin (CET)"},{value:"UTC",label:"UTC"}],ze={serverUrl:"https://gtm-wizard.onrender.com",accountsFolder:"Accounts",recordingsFolder:"Recordings",syncOnStartup:!0,autoSyncAfterTranscription:!0,saveAudioFiles:!0,appendTranscript:!0,lastSyncTime:null,cachedAccounts:[],enableSmartTags:!0,showCalendarView:!0,userEmail:"",setupCompleted:!1,calendarConfigured:!1,salesforceConnected:!1,accountsImported:!1,importedAccountCount:0,timezone:"America/New_York",lastAccountRefreshDate:null,archiveRemovedAccounts:!0,syncAccountsOnStartup:!0,sfAutoSyncEnabled:!0,sfAutoSyncIntervalMinutes:15,audioCaptureMode:"full_call",audioMicDeviceId:"",audioSystemDeviceId:"",audioSetupDismissed:!1,meetingTemplate:"meddic",lastUpdateVersion:null,lastUpdateTimestamp:null,pendingUpdateVersion:null,themeFixApplied:!1,editModeFixApplied:!1,healQueue:[],prospectsMigrated:!1,pendingReloadVersion:null,userRole:"",deviceId:null,deviceName:""},te=class{constructor(r,t=""){this.deviceId="";this.deviceName="";this.enabled=!0;this.pluginVersion="0.0.0";this.serverUrl=r,this.userEmail=t}setPluginVersion(r){this.pluginVersion=r}setUserEmail(r){this.userEmail=r}setDeviceIdentity(r,t){this.deviceId=r,this.deviceName=t}async reportError(r,t){this.enabled&&this.send("error",r,t)}async reportWarning(r,t){this.enabled&&this.send("warning",r,t)}async reportInfo(r,t){this.enabled&&this.send("info",r,t)}async sendHeartbeat(r,t){if(!this.enabled||!this.userEmail)return null;try{return(await(0,p.requestUrl)({url:`${this.serverUrl}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"heartbeat",userEmail:this.userEmail,deviceId:this.deviceId,deviceName:this.deviceName,pluginVersion:this.pluginVersion,platform:"obsidian",accountCount:r,connections:t})})).json}catch{return null}}async reportSync(r){if(this.enabled)try{(0,p.requestUrl)({url:`${this.serverUrl}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"sync",userEmail:this.userEmail||"anonymous",pluginVersion:this.pluginVersion,platform:"obsidian",context:r})}).catch(()=>{})}catch{}}async checkForPushedConfig(){if(!this.userEmail)return[];try{let r=await(0,p.requestUrl)({url:`${this.serverUrl}/api/admin/users/${encodeURIComponent(this.userEmail)}/config`,method:"GET",headers:{"Content-Type":"application/json"}});return r.json?.hasUpdates&&r.json?.updates?(console.log("[Eudia] Received pushed config from admin:",r.json.updates),r.json.updates):[]}catch{return[]}}async reportRecordingStart(r){this.enabled&&this.send("recording_start","Recording started",r)}async reportRecordingStop(r){this.enabled&&this.send("recording_stop",`Recording stopped (${r.durationSec}s)`,r)}async reportTranscriptionResult(r){if(!this.enabled)return;let t=r.success?`Transcription complete (${r.transcriptLength} chars)`:`Transcription failed: ${r.error||"unknown"}`;this.send("transcription_result",t,r)}async reportAutoHealScan(r){this.enabled&&this.send("autoheal_scan",`AutoHeal: ${r.healed} healed, ${r.failed} failed`,r)}async reportUpdateCheck(r){this.enabled&&this.send("update_check",`Update check: ${r.updateResult}`,r)}async reportSafetyNetFailure(r){this.enabled&&this.send("safety_net_failure",`Safety net save failed: ${r.error}`,r)}async send(r,t,e){try{(0,p.requestUrl)({url:`${this.serverUrl}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:r,message:t,context:e,userEmail:this.userEmail||"anonymous",deviceId:this.deviceId,pluginVersion:this.pluginVersion,platform:"obsidian"})}).catch(()=>{})}catch{}}},z="eudia-calendar-view",B="eudia-setup-view",_="eudia-live-query-view",ne=class extends p.EditorSuggest{constructor(r,t){super(r),this.plugin=t}onTrigger(r,t,e){let n=t.getLine(r.line),a=t.getValue(),i=t.posToOffset(r),s=a.indexOf("---"),o=a.indexOf("---",s+3);if(s===-1||i<s||i>o)return null;let l=n.match(/^account:\s*(.*)$/);if(!l)return null;let c=l[1].trim(),d=n.indexOf(":")+1,u=n.substring(d).match(/^\s*/)?.[0].length||0;return{start:{line:r.line,ch:d+u},end:r,query:c}}getSuggestions(r){let t=r.query.toLowerCase(),e=this.plugin.settings.cachedAccounts;return t?e.filter(n=>n.name.toLowerCase().includes(t)).sort((n,a)=>{let i=n.name.toLowerCase().startsWith(t),s=a.name.toLowerCase().startsWith(t);return i&&!s?-1:s&&!i?1:n.name.localeCompare(a.name)}).slice(0,10):e.slice(0,10)}renderSuggestion(r,t){t.createEl("div",{text:r.name,cls:"suggestion-title"})}selectSuggestion(r,t){this.context&&this.context.editor.replaceRange(r.name,this.context.start,this.context.end)}},ae=class{constructor(r,t,e,n){this.containerEl=null;this.waveformBars=[];this.durationEl=null;this.waveformData=new Array(16).fill(0);this.onPause=r,this.onResume=t,this.onStop=e,this.onCancel=n}show(){if(this.containerEl)return;this.containerEl=document.createElement("div"),this.containerEl.className="eudia-transcription-bar active";let r=document.createElement("div");r.className="eudia-recording-dot",this.containerEl.appendChild(r);let t=document.createElement("div");t.className="eudia-waveform",this.waveformBars=[];for(let i=0;i<16;i++){let s=document.createElement("div");s.className="eudia-waveform-bar",s.style.height="2px",t.appendChild(s),this.waveformBars.push(s)}this.containerEl.appendChild(t),this.durationEl=document.createElement("div"),this.durationEl.className="eudia-duration",this.durationEl.textContent="0:00",this.containerEl.appendChild(this.durationEl);let e=document.createElement("div");e.className="eudia-controls-minimal";let n=document.createElement("button");n.className="eudia-control-btn stop",n.innerHTML='<span class="eudia-stop-icon"></span>',n.title="Stop and summarize",n.onclick=()=>this.onStop(),e.appendChild(n);let a=document.createElement("button");a.className="eudia-control-btn cancel",a.textContent="Cancel",a.onclick=()=>this.onCancel(),e.appendChild(a),this.containerEl.appendChild(e),document.body.appendChild(this.containerEl)}hide(){this.containerEl&&(this.containerEl.remove(),this.containerEl=null,this.waveformBars=[],this.durationEl=null)}updateState(r){if(this.containerEl){if(this.waveformData.shift(),this.waveformData.push(r.audioLevel),this.waveformBars.forEach((t,e)=>{let n=this.waveformData[e]||0,a=Math.max(2,Math.min(24,n*.24));t.style.height=`${a}px`}),this.durationEl){let t=Math.floor(r.duration/60),e=Math.floor(r.duration%60);this.durationEl.textContent=`${t}:${e.toString().padStart(2,"0")}`}this.containerEl.className=r.isPaused?"eudia-transcription-bar paused":"eudia-transcription-bar active"}}showProcessing(){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar processing";let r=document.createElement("div");r.className="eudia-processing-spinner",this.containerEl.appendChild(r);let t=document.createElement("div");t.className="eudia-processing-text",t.textContent="Processing...",this.containerEl.appendChild(t)}showComplete(r){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar complete";let t=document.createElement("div");t.className="eudia-complete-checkmark",this.containerEl.appendChild(t);let e=document.createElement("div");if(e.className="eudia-complete-content",r.summaryPreview){let o=document.createElement("div");o.className="eudia-summary-preview",o.textContent=r.summaryPreview.length>80?r.summaryPreview.substring(0,80)+"...":r.summaryPreview,e.appendChild(o)}let n=document.createElement("div");n.className="eudia-complete-stats-row";let a=Math.floor(r.duration/60),i=Math.floor(r.duration%60);n.textContent=`${a}:${i.toString().padStart(2,"0")} recorded`,r.nextStepsCount>0&&(n.textContent+=` | ${r.nextStepsCount} action${r.nextStepsCount>1?"s":""}`),r.meddiccCount>0&&(n.textContent+=` | ${r.meddiccCount} signals`),e.appendChild(n),this.containerEl.appendChild(e);let s=document.createElement("button");s.className="eudia-control-btn close",s.textContent="Dismiss",s.onclick=()=>this.hide(),this.containerEl.appendChild(s),setTimeout(()=>this.hide(),8e3)}};var ie=class extends p.Modal{constructor(r,t,e){super(r),this.plugin=t,this.onSelect=e}onOpen(){let{contentEl:r}=this;r.empty(),r.addClass("eudia-account-selector"),r.createEl("h3",{text:"Select Account for Meeting Note"}),this.searchInput=r.createEl("input",{type:"text",placeholder:"Search accounts..."}),this.searchInput.style.cssText="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);",this.resultsContainer=r.createDiv({cls:"eudia-account-results"}),this.resultsContainer.style.cssText="max-height: 300px; overflow-y: auto;",this.updateResults(""),this.searchInput.addEventListener("input",()=>this.updateResults(this.searchInput.value)),this.searchInput.focus()}updateResults(r){this.resultsContainer.empty();let t=this.plugin.settings.cachedAccounts,e=r?t.filter(n=>n.name.toLowerCase().includes(r.toLowerCase())).slice(0,15):t.slice(0,15);if(e.length===0){this.resultsContainer.createDiv({cls:"eudia-no-results",text:"No accounts found"});return}e.forEach(n=>{let a=this.resultsContainer.createDiv({cls:"eudia-account-item",text:n.name});a.onclick=()=>{this.onSelect(n),this.close()}})}onClose(){this.contentEl.empty()}},K=class extends p.Modal{constructor(t,e,n){super(t);this.accountContext=null;this.sessionId=null;this.plugin=e,this.accountContext=n||null}onOpen(){let{contentEl:t}=this;t.empty(),t.addClass("eudia-intelligence-modal");let e=t.createDiv({cls:"eudia-intelligence-header"});e.createEl("h2",{text:this.accountContext?`Ask about ${this.accountContext.name}`:"Ask gtm-brain"}),this.accountContext?e.createEl("p",{text:"Get insights, prep for meetings, or ask about this account.",cls:"eudia-intelligence-subtitle"}):e.createEl("p",{text:"Ask questions about your accounts, deals, or pipeline.",cls:"eudia-intelligence-subtitle"});let n=t.createDiv({cls:"eudia-intelligence-input-container"});this.queryInput=n.createEl("textarea",{placeholder:this.accountContext?`e.g., "What should I know before my next meeting?" or "What's the deal status?"`:`e.g., "Who owns Dolby?" or "What's my late stage pipeline?"`}),this.queryInput.addClass("eudia-intelligence-input"),this.queryInput.rows=3;let i=t.createDiv({cls:"eudia-intelligence-actions"}).createEl("button",{text:"Ask",cls:"eudia-btn-primary"});i.onclick=()=>this.submitQuery(),this.queryInput.onkeydown=d=>{d.key==="Enter"&&!d.shiftKey&&(d.preventDefault(),this.submitQuery())},this.threadContainer=t.createDiv({cls:"eudia-intelligence-thread"}),this.responseContainer=t.createDiv({cls:"eudia-intelligence-response"}),this.responseContainer.style.display="none";let o=t.createDiv({cls:"eudia-intelligence-thread-actions"}).createEl("button",{text:"New conversation",cls:"eudia-btn-secondary"});o.onclick=()=>{this.threadContainer.empty(),this.sessionId=null,this.queryInput.value="",this.queryInput.focus()};let l=t.createDiv({cls:"eudia-intelligence-suggestions"});l.createEl("p",{text:"Suggested:",cls:"eudia-suggestions-label"});let c;if(this.accountContext)c=["What should I know before my next meeting?","Summarize our relationship and deal status","What are the key pain points?"];else{let u=(this.plugin.settings.cachedAccounts||[]).slice(0,3).map(h=>h.name);u.length>=2?c=[`What should I know about ${u[0]} before my next meeting?`,`What's the account history with ${u[1]}?`,"What's my late-stage pipeline?"]:c=["What should I know before my next meeting?","What accounts need attention this week?","What is my late-stage pipeline?"]}c.forEach(d=>{let u=l.createEl("button",{text:d,cls:"eudia-suggestion-btn"});u.onclick=()=>{this.queryInput.value=d,this.submitQuery()}}),setTimeout(()=>this.queryInput.focus(),100)}async submitQuery(){let t=this.queryInput.value.trim();if(!t)return;this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-user"}).setText(t),this.queryInput.value="";let n=this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-loading"}),a=this.accountContext?.name?` about ${this.accountContext.name}`:"";n.setText(`Thinking${a}...`),this.scrollThread();try{let i={query:t,accountId:this.accountContext?.id,accountName:this.accountContext?.name,userEmail:this.plugin.settings.userEmail};this.sessionId&&(i.sessionId=this.sessionId);let s=await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/intelligence/query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(i),throw:!1,contentType:"application/json"});if(n.remove(),s.status>=400){let o=s.json?.error||`Server error (${s.status}). Please try again.`;this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-error"}).setText(o),this.scrollThread();return}if(s.json?.success){s.json.sessionId&&(this.sessionId=s.json.sessionId);let o=s.json.answer||"",l=[],c=o.match(/---\s*\n\s*You might also ask:\s*\n((?:\d+\.\s*.+\n?)+)/i);if(c){o=o.substring(0,o.indexOf(c[0])).trim();let C=c[1].trim().split(`
`);for(let S of C){let b=S.replace(/^\d+\.\s*/,"").trim();b.length>5&&l.push(b)}}let d=this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-ai"}),u=d.createDiv({cls:"eudia-intelligence-answer"});if(u.innerHTML=this.formatResponse(o),s.json.context){let C=s.json.context,S=[];C.accountName&&S.push(C.accountName),C.opportunityCount>0&&S.push(`${C.opportunityCount} opps`),C.hasNotes&&S.push("notes"),C.hasCustomerBrain&&S.push("history");let b=C.dataFreshness==="cached"||C.dataFreshness==="session-cached"?" (cached)":"";S.length&&d.createDiv({cls:"eudia-intelligence-context-info"}).setText(`${S.join(" \u2022 ")}${b}`)}if(l.length>0){let C=d.createDiv({cls:"eudia-suggestions-inline"});for(let S of l.slice(0,3)){let b=C.createEl("button",{text:S,cls:"eudia-suggestion-chip-inline"});b.onclick=()=>{this.queryInput.value=S,this.submitQuery()}}}let h=d.createDiv({cls:"eudia-feedback-row"}),m=h.createEl("button",{text:"\u2191 Helpful",cls:"eudia-feedback-btn"}),g=h.createEl("button",{text:"\u2193 Not helpful",cls:"eudia-feedback-btn"}),v=async(C,S,b)=>{S.disabled=!0,S.style.fontWeight="600",S.style.color=C==="helpful"?"var(--text-success)":"var(--text-error)",b.style.display="none";try{await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/intelligence/feedback`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:t,answerSnippet:o.substring(0,300),accountName:this.accountContext?.name||"",accountId:this.accountContext?.id||"",userEmail:this.plugin.settings.userEmail,sessionId:this.sessionId||"",rating:C}),throw:!1})}catch{}};m.onclick=()=>v("helpful",m,g),g.onclick=()=>v("not_helpful",g,m)}else{let o=s.json?.error||"Could not get an answer. Try rephrasing your question.";this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-error"}).setText(o)}this.scrollThread()}catch(i){n.remove(),console.error("[GTM Brain] Intelligence query error:",i);let s="Unable to connect. Please check your internet connection and try again.";i?.message?.includes("timeout")?s="Request timed out. The server may be busy - please try again.":(i?.message?.includes("network")||i?.message?.includes("fetch"))&&(s="Network error. Please check your connection and try again."),this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-error"}).setText(s),this.scrollThread()}}scrollThread(){this.threadContainer.scrollTop=this.threadContainer.scrollHeight}formatResponse(t){let e=t;return e=e.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu,""),e=e.replace(/\n{3,}/g,`

`),e=e.replace(/^([•\-]\s+.+)\n\n(?=[•\-]\s+)/gm,`$1
`),e=e.replace(/^(#{2,3}\s+.+)\n\n/gm,`$1
`),e=e.replace(/^#{1,3}\s+.+\n+(?=#{1,3}\s|\s*$)/gm,""),e=e.replace(/^#{2,3}\s+(.+)$/gm,'</p><h3 class="eudia-intel-header">$1</h3><p>'),e=e.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>"),e=e.replace(/^-\s+\[\s*\]\s+(.+)$/gm,'<li class="eudia-intel-todo">$1</li>'),e=e.replace(/^-\s+\[x\]\s+(.+)$/gm,'<li class="eudia-intel-done">$1</li>'),e=e.replace(/^[•\-]\s+(.+)$/gm,"<li>$1</li>"),e=e.replace(/(<li[^>]*>.*?<\/li>\s*)+/g,'<ul class="eudia-intel-list">$&</ul>'),e=e.replace(/\n\n/g,"</p><p>"),e=e.replace(/\n/g,"<br>"),e=e.replace(/<p>\s*(<ul)/g,"$1"),e=e.replace(/<\/ul>\s*<\/p>/g,"</ul>"),e=e.replace(/<p>\s*(<h3)/g,"$1"),e=e.replace(/<\/h3>\s*<\/p>/g,"</h3>"),e=e.replace(/<\/li>\s*<br>\s*<li/g,"</li><li"),e=e.replace(/<p>\s*<\/p>/g,""),e=e.replace(/<p>\s*<br>\s*<\/p>/g,""),e=e.replace(/(<br>\s*){2,}/g,""),e=e.replace(/<\/h3>\s*<br>/g,"</h3>"),e=e.replace(/<br>\s*<h3/g,"<h3"),e=e.replace(/<br>\s*<ul/g,"<ul"),e=e.replace(/<\/ul>\s*<br>/g,"</ul>"),e=e.replace(/^(<br>)+|(<br>)+$/g,""),e="<p>"+e+"</p>",e=e.replace(/<p><\/p>/g,""),e}onClose(){this.contentEl.empty()}};var se=class extends p.ItemView{constructor(t,e){super(t);this.emailInput=null;this.pollInterval=null;this.plugin=e,this.accountOwnershipService=new L(e.settings.serverUrl),this.steps=[{id:"calendar",title:"Connect Your Calendar",description:"View your meetings and create notes with one click",status:"pending"},{id:"salesforce",title:"Connect to Salesforce",description:"Sync notes and access your accounts",status:"pending"},{id:"transcribe",title:"Ready to Transcribe",description:"Record and summarize meetings automatically",status:"pending"}]}getViewType(){return B}getDisplayText(){return"Setup"}getIcon(){return"settings"}async onOpen(){await this.checkExistingStatus(),await this.render()}async onClose(){this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null)}async checkExistingStatus(){if(this.plugin.settings.userEmail){this.steps[0].status="complete";try{(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0&&(this.steps[1].status="complete",this.plugin.settings.salesforceConnected=!0)}catch{}if(this.plugin.settings.accountsImported){let e=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(s=>s.children!==void 0)||[];e.length>0?(this.steps[2].status="complete",console.log(`[Eudia] Vault reopen: ${e.length} account folders verified`)):(console.warn("[Eudia] accountsImported=true but 0 account folders found \u2014 resetting for re-import"),this.plugin.settings.accountsImported=!1,this.plugin.settings.importedAccountCount=0,await this.plugin.saveSettings());try{let s=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");s&&await this.plugin.app.vault.delete(s)}catch{}let n=this.plugin.settings.userEmail,i=(this.plugin.settings.cachedAccounts||[]).filter(s=>s.id&&String(s.id).startsWith("001"));if(n&&i.length>0){let s=this.plugin.settings.accountsFolder||"Accounts",o=!1;for(let l of i.slice(0,5)){let c=(l.name||"").replace(/[<>:"/\\|?*]/g,"_").trim(),d=`${s}/${c}/Contacts.md`,u=this.plugin.app.vault.getAbstractFileByPath(d);if(u instanceof p.TFile&&!this.plugin.app.metadataCache.getFileCache(u)?.frontmatter?.enriched_at){o=!0;break}}o&&(console.log("[Eudia Setup] Accounts need enrichment \u2014 triggering on vault reopen..."),setTimeout(async()=>{try{let l=i.map(c=>({id:c.id,name:c.name,type:"",isOwned:!1,hadOpportunity:!0,website:null,industry:null}));await this.plugin.enrichAccountFolders(l),console.log(`[Eudia] Vault-reopen enrichment complete: ${l.length} accounts enriched`)}catch(l){console.log("[Eudia] Vault-reopen enrichment failed (will retry next open):",l)}},3e3))}}else{console.log("[Eudia Setup] Email set but accounts not imported \u2014 auto-retrying import...");let t=this.plugin.app.workspace.leftSplit,e=t?.collapsed;try{let n=this.plugin.settings.userEmail,a=this.plugin.settings.userRole||(M(n)?"admin":H(n)?"cs":"sales"),i=[],s=[];if(console.log(`[Eudia Setup] Auto-retry for ${n} (role: ${a})`),a==="other")i=[];else if(a==="exec"||a==="product")i=await this.accountOwnershipService.getExecProductAccounts(n);else if(a==="cs")i=[...F],console.log(`[Eudia Setup] Auto-retry CS: using ${i.length} static accounts`);else if(a==="admin")i=await this.accountOwnershipService.getAllAccountsForAdmin(n);else{let o=await this.accountOwnershipService.getAccountsWithProspects(n);i=o.accounts,s=o.prospects}if(i.length>0||s.length>0){if(t&&!e&&t.collapse(),a==="admin"?await this.plugin.createAdminAccountFolders(i):(await this.plugin.createTailoredAccountFolders(i,{}),s.length>0&&await this.plugin.createProspectAccountFiles(s)),G(n))try{await this.plugin.createCSManagerDashboard(n,i)}catch{}this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=i.length+s.length,await this.plugin.saveSettings(),this.steps[2].status="complete";try{let o=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");o&&await this.plugin.app.vault.delete(o)}catch{}t&&!e&&t.expand(),console.log(`[Eudia Setup] Auto-retry imported ${i.length} accounts for ${n}`),new p.Notice(`Enriching ${i.length} accounts with Salesforce contacts...`);try{let o=a==="cs"?i:[...i,...s];await this.plugin.enrichAccountFolders(o),new p.Notice(`${i.length} accounts loaded and enriched!`),console.log("[Eudia Setup] Auto-retry enrichment complete")}catch(o){console.log("[Eudia Setup] Auto-retry enrichment failed:",o),new p.Notice(`${i.length} accounts imported! Contacts will populate on next open.`)}}else console.warn(`[Eudia Setup] Auto-retry returned 0 accounts for ${n}. Server may still be starting.`),t&&!e&&t.expand()}catch(n){console.error("[Eudia Setup] Auto-retry account import failed:",n),t&&!e&&t.expand()}}}}getCompletionPercentage(){let t=this.steps.filter(e=>e.status==="complete").length;return Math.round(t/this.steps.length*100)}async render(){let t=this.containerEl.children[1];t.empty(),t.addClass("eudia-setup-view"),this.renderHeader(t),this.renderSteps(t),this.renderGettingStarted(t),this.renderFooter(t)}renderGettingStarted(t){let e=t.createDiv({cls:"eudia-getting-started"});e.createEl("h3",{text:"Your Sidebar Tools",cls:"eudia-getting-started-title"});let n=[{icon:"calendar",name:"Calendar",desc:"View your external meetings. Click any event to create a meeting note under the matched account. Adjust your timezone in the Eudia Lite settings."},{icon:"microphone",name:"Transcribe",desc:"Click the mic icon before a meeting to start recording. AI transcribes and extracts key insights, objections, and next steps automatically."},{icon:"message-circle",name:"Ask GTM Brain",desc:"Query Salesforce data in natural language \u2014 pipeline, contacts, deal history, and account intelligence."}];for(let a of n){let i=e.createDiv({cls:"eudia-getting-started-row"}),s=i.createDiv({cls:"eudia-getting-started-icon"});(0,p.setIcon)(s,a.icon);let o=i.createDiv({cls:"eudia-getting-started-text"});o.createEl("strong",{text:a.name}),o.createEl("span",{text:` \u2014 ${a.desc}`})}}renderHeader(t){let e=t.createDiv({cls:"eudia-setup-header"}),n=e.createDiv({cls:"eudia-setup-title-section"});n.createEl("h1",{text:"Welcome to Eudia Notetaker",cls:"eudia-setup-main-title"}),n.createEl("p",{text:"Complete these steps to transcribe and summarize meetings -- capturing objections, next steps, and pain points to drive better client outcomes and smarter selling.",cls:"eudia-setup-subtitle"});let a=e.createDiv({cls:"eudia-setup-progress-section"}),i=this.getCompletionPercentage(),s=a.createDiv({cls:"eudia-setup-progress-label"});s.createSpan({text:"Setup Progress"}),s.createSpan({text:`${i}%`,cls:"eudia-setup-progress-value"});let l=a.createDiv({cls:"eudia-setup-progress-bar"}).createDiv({cls:"eudia-setup-progress-fill"});l.style.width=`${i}%`}renderSteps(t){let e=t.createDiv({cls:"eudia-setup-steps-container"});this.renderRoleStep(e),this.renderCalendarStep(e),this.renderSalesforceStep(e),this.renderTranscribeStep(e)}renderRoleStep(t){let e=!!this.plugin.settings.userRole,n=t.createDiv({cls:`eudia-setup-step-card ${e?"complete":"in_progress"}`}),a=n.createDiv({cls:"eudia-setup-step-header"}),i=a.createDiv({cls:"eudia-setup-step-number"});i.setText(""),e?i.addClass("eudia-step-complete"):i.setText("1");let s=a.createDiv({cls:"eudia-setup-step-info"});s.createEl("h3",{text:"Select Your Team"}),s.createEl("p",{text:"This determines which accounts and features are loaded"});let o=n.createDiv({cls:"eudia-setup-step-content"});if(e){let l={sales:"Sales",cs:"CS",exec:"Executive",product:"Product",admin:"Ops / Admin",other:"Other"};o.createDiv({cls:"eudia-setup-complete-message",text:l[this.plugin.settings.userRole]||this.plugin.settings.userRole})}else{let l=[{value:"sales",label:"Sales"},{value:"cs",label:"CS"},{value:"exec",label:"Executive"},{value:"product",label:"Product"},{value:"admin",label:"Ops / Admin"},{value:"other",label:"Other"}],c=o.createDiv();c.style.cssText="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;";for(let d of l){let u=c.createEl("button",{text:d.label,cls:"eudia-setup-btn"});u.style.cssText="text-align:center;font-size:12px;padding:6px 10px;",u.onclick=async()=>{this.plugin.settings.userRole=d.value,await this.plugin.saveSettings(),await this.render()}}}}renderCalendarStep(t){let e=this.steps[0],n=!!this.plugin.settings.userRole,a=t.createDiv({cls:`eudia-setup-step-card ${e.status}${n?"":" pending"}`}),i=a.createDiv({cls:"eudia-setup-step-header"}),s=i.createDiv({cls:"eudia-setup-step-number"});s.setText(e.status==="complete"?"":"2"),e.status==="complete"&&s.addClass("eudia-step-complete"),n||s.addClass("pending");let o=i.createDiv({cls:"eudia-setup-step-info"});o.createEl("h3",{text:e.title}),o.createEl("p",{text:e.description});let l=a.createDiv({cls:"eudia-setup-step-content"});if(!n){l.createDiv({cls:"eudia-setup-disabled-message",text:"Select your team first"});return}if(e.status==="complete")l.createDiv({cls:"eudia-setup-complete-message",text:`Connected as ${this.plugin.settings.userEmail}`});else{let c=l.createDiv({cls:"eudia-setup-input-group"});this.emailInput=c.createEl("input",{type:"email",placeholder:"yourname@eudia.com",cls:"eudia-setup-input"}),this.plugin.settings.userEmail&&(this.emailInput.value=this.plugin.settings.userEmail);let d=c.createEl("button",{text:"Connect",cls:"eudia-setup-btn primary"});d.onclick=async()=>{await this.handleCalendarConnect()},this.emailInput.onkeydown=async u=>{u.key==="Enter"&&await this.handleCalendarConnect()},l.createDiv({cls:"eudia-setup-validation-message"}),l.createEl("p",{cls:"eudia-setup-help-text",text:"Your calendar syncs automatically via Microsoft 365. We use your email to identify your meetings."})}}async handleCalendarConnect(){if(!this.emailInput)return;let t=this.emailInput.value.trim().toLowerCase(),e=this.containerEl.querySelector(".eudia-setup-validation-message");if(!t){e&&(e.textContent="Please enter your email",e.className="eudia-setup-validation-message error");return}if(!t.endsWith("@eudia.com")){e&&(e.textContent="Please use your @eudia.com email address",e.className="eudia-setup-validation-message error");return}e&&(e.textContent="Validating...",e.className="eudia-setup-validation-message loading");try{let n=await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${encodeURIComponent(t)}`,method:"GET",throw:!1});if(n.status===200&&n.json?.authorized){this.plugin.settings.userEmail=t,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),this.steps[0].status="complete",new p.Notice("Calendar connected successfully!"),e&&(e.textContent="Importing your accounts...",e.className="eudia-setup-validation-message loading");let a=this.plugin.app.workspace.leftSplit,i=a?.collapsed;a&&!i&&a.collapse();try{let s,o=[],l=this.plugin.settings.userRole||(M(t)?"admin":H(t)?"cs":"sales");if(console.log(`[Eudia] User role: ${l} for ${t}`),l==="other")s=[],console.log("[Eudia] Other role \u2014 no account sync"),this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=0,await this.plugin.saveSettings();else if(l==="exec"||l==="product"){console.log(`[Eudia] ${l} role \u2014 loading Existing + active pipeline accounts`),s=await this.accountOwnershipService.getExecProductAccounts(t),e&&(e.textContent=`Loading ${s.length} accounts...`),await this.plugin.createTailoredAccountFolders(s,{}),(this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(h=>h.children!==void 0)||[]).length>0&&(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length),await this.plugin.saveSettings();try{let h=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");h&&await this.plugin.app.vault.delete(h)}catch{}new p.Notice(`Imported ${s.length} accounts!`);let u=s.filter(h=>h.id&&h.id.startsWith("001"));if(u.length>0){e&&(e.textContent=`Enriching ${u.length} accounts...`);try{await this.plugin.enrichAccountFolders(u)}catch{}}}else if(l==="cs"){if(console.log(`[Eudia] CS user detected \u2014 loading ${F.length} accounts from static data (instant, no server needed)`),s=[...F],o=[],e&&(e.textContent=`Loading ${s.length} Customer Success accounts...`),await this.plugin.createTailoredAccountFolders(s,{}),G(t))try{await this.plugin.createCSManagerDashboard(t,s)}catch(u){console.error("[Eudia] CS Manager dashboard creation failed (non-blocking):",u)}let d=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(u=>u.children!==void 0)||[];d.length>0?(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length,console.log(`[Eudia] CS accounts verified: ${d.length} folders created`)):(console.warn(`[Eudia] CS folder creation may have failed \u2014 ${d.length} folders found. Keeping accountsImported=false for retry.`),this.plugin.settings.accountsImported=!1),await this.plugin.saveSettings();try{let u=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");u&&await this.plugin.app.vault.delete(u)}catch{}console.log(`[Eudia] CS accounts created: ${s.length} folders from static data`),e&&(e.textContent=`Enriching ${s.length} accounts with Salesforce contacts...`),new p.Notice(`Enriching ${s.length} accounts with contacts from Salesforce...`),console.log(`[Eudia] Starting synchronous enrichment for ${s.length} CS accounts...`);try{await this.plugin.enrichAccountFolders(s),console.log("[Eudia] Synchronous enrichment complete"),new p.Notice(`${s.length} accounts loaded with contacts from Salesforce!`),e&&(e.textContent=`${s.length} accounts loaded and enriched with Salesforce contacts!`)}catch(u){console.log("[Eudia] Synchronous enrichment failed, will retry in background:",u),new p.Notice(`${s.length} accounts loaded! Contacts will populate shortly...`);let h=t,m=[5e3,2e4,6e4],g=async v=>{let C=m[v];if(C!==void 0){await new Promise(S=>setTimeout(S,C));try{await this.plugin.enrichAccountFolders(s),console.log(`[Eudia] Background enrichment retry ${v+1} succeeded`)}catch{return g(v+1)}}};g(0)}}else if(l==="admin"){if(console.log("[Eudia] Admin user detected - importing all accounts"),s=await this.accountOwnershipService.getAllAccountsForAdmin(t),s.length>0){e&&(e.textContent=`Creating ${s.length} account folders...`),await this.plugin.createAdminAccountFolders(s);let d=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(h=>h.children!==void 0)||[];d.length>0?(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length,console.log(`[Eudia] Admin accounts verified: ${d.length} folders created`)):(console.warn("[Eudia] Admin folder creation may have failed \u2014 keeping accountsImported=false for retry"),this.plugin.settings.accountsImported=!1),await this.plugin.saveSettings();try{let h=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");h&&await this.plugin.app.vault.delete(h)}catch{}new p.Notice(`Imported ${s.length} accounts! Enriching with Salesforce data...`);let u=s.filter(h=>h.id&&h.id.startsWith("001"));if(u.length>0){e&&(e.textContent=`Enriching ${u.length} accounts with Salesforce contacts...`);try{await this.plugin.enrichAccountFolders(u),new p.Notice(`${s.length} accounts loaded and enriched with Salesforce data!`),console.log(`[Eudia] Admin/exec synchronous enrichment complete: ${u.length} accounts`),e&&(e.textContent=`${s.length} accounts loaded and enriched!`)}catch(h){console.log("[Eudia] Admin/exec synchronous enrichment failed, will retry on next open:",h),new p.Notice(`${s.length} accounts imported! Contacts will populate on next open.`);let m=[5e3,2e4,6e4],g=async v=>{let C=m[v];if(C!==void 0){await new Promise(S=>setTimeout(S,C));try{await this.plugin.enrichAccountFolders(u),console.log(`[Eudia] Admin/exec background enrichment retry ${v+1} succeeded`)}catch{return g(v+1)}}};g(0)}}}}else{let c=await this.accountOwnershipService.getAccountsWithProspects(t);if(s=c.accounts,o=c.prospects,s.length>0||o.length>0){e&&(e.textContent=`Creating ${s.length} account folders...`),await this.plugin.createTailoredAccountFolders(s,{}),o.length>0&&await this.plugin.createProspectAccountFiles(o);let u=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(m=>m.children!==void 0)||[];u.length>0?(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length+o.length,console.log(`[Eudia] BL accounts verified: ${u.length} folders created`)):(console.warn("[Eudia] BL folder creation may have failed \u2014 keeping accountsImported=false for retry"),this.plugin.settings.accountsImported=!1),await this.plugin.saveSettings();try{let m=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");m&&await this.plugin.app.vault.delete(m)}catch{}new p.Notice(`Imported ${s.length} active accounts + ${o.length} prospects! Enriching with Salesforce contacts...`);let h=[...s,...o];try{e&&(e.textContent=`Enriching ${h.length} accounts with Salesforce contacts...`),await this.plugin.enrichAccountFolders(h),new p.Notice(`${h.length} accounts enriched with Salesforce data!`),console.log(`[Eudia] BL enrichment complete: ${h.length} accounts`)}catch(m){console.log("[Eudia] BL enrichment failed, will retry on next launch:",m)}}else{console.warn(`[Eudia] No accounts returned for ${t} \u2014 auto-retrying...`);let d=!1;for(let u=1;u<=3;u++){e&&(e.textContent=`Server warming up... retrying in 10s (attempt ${u}/3)`,e.className="eudia-setup-validation-message warning"),await new Promise(h=>setTimeout(h,1e4));try{let h=await this.plugin.accountOwnershipService.getAccountsWithProspects(t);if(h.accounts.length>0||h.prospects.length>0){s=h.accounts,o=h.prospects,e&&(e.textContent=`Creating ${s.length} account folders...`),await this.plugin.createTailoredAccountFolders(s,{}),o.length>0&&await this.plugin.createProspectAccountFiles(o),(this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(v=>v.children!==void 0)||[]).length>0&&(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length+o.length),await this.plugin.saveSettings(),new p.Notice(`Imported ${s.length} accounts + ${o.length} prospects! Enriching...`);try{let v=[...s,...o];e&&(e.textContent=`Enriching ${v.length} accounts with Salesforce contacts...`),await this.plugin.enrichAccountFolders(v),new p.Notice(`${v.length} accounts enriched with Salesforce data!`)}catch(v){console.log("[Eudia] Retry enrichment failed, will retry on next launch:",v)}d=!0;break}}catch(h){console.warn(`[Eudia] Retry ${u} failed:`,h)}}d||(e&&(e.textContent="Could not load accounts after 3 attempts. Close this window, wait 1 minute, then re-open Obsidian and try again.",e.className="eudia-setup-validation-message error"),new p.Notice("Account import failed after retries. Wait 1 minute and try again."))}}}catch(s){console.error("[Eudia] Account import failed:",s),e&&(e.textContent="Account import failed. Please try again.",e.className="eudia-setup-validation-message error"),new p.Notice("Account import failed \u2014 please try again.")}finally{a&&!i&&a.expand()}await this.render()}else e&&(e.innerHTML=`<strong>${t}</strong> is not authorized for calendar access. Contact your admin.`,e.className="eudia-setup-validation-message error")}catch{e&&(e.textContent="Connection failed. Please try again.",e.className="eudia-setup-validation-message error")}}renderSalesforceStep(t){let e=this.steps[1],n=t.createDiv({cls:`eudia-setup-step-card ${e.status}`}),a=n.createDiv({cls:"eudia-setup-step-header"}),i=a.createDiv({cls:"eudia-setup-step-number"});i.setText(e.status==="complete"?"":"2"),e.status==="complete"&&i.addClass("eudia-step-complete");let s=a.createDiv({cls:"eudia-setup-step-info"});s.createEl("h3",{text:e.title}),s.createEl("p",{text:e.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(!this.plugin.settings.userEmail){o.createDiv({cls:"eudia-setup-disabled-message",text:"Complete the calendar step first"});return}if(e.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:"Salesforce connected successfully"}),this.plugin.settings.accountsImported&&o.createDiv({cls:"eudia-setup-account-status",text:`${this.plugin.settings.importedAccountCount} accounts imported`});else{let c=o.createDiv({cls:"eudia-setup-button-group"}).createEl("button",{text:"Connect to Salesforce",cls:"eudia-setup-btn primary"}),d=o.createDiv({cls:"eudia-setup-sf-status"});c.onclick=async()=>{let u=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(u,"_blank"),d.textContent="Complete the login in the popup window...",d.className="eudia-setup-sf-status loading",new p.Notice("Complete the Salesforce login in the popup window",5e3),this.startSalesforcePolling(d)},o.createEl("p",{cls:"eudia-setup-help-text",text:"This links your Obsidian notes to your Salesforce account for automatic sync."})}}startSalesforcePolling(t){this.pollInterval&&window.clearInterval(this.pollInterval);let e=0,n=60;this.pollInterval=window.setInterval(async()=>{e++;try{(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),this.steps[1].status="complete",new p.Notice("Salesforce connected successfully!"),await this.importTailoredAccounts(t),await this.render()):e>=n&&(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),t.textContent="Connection timed out. Please try again.",t.className="eudia-setup-sf-status error")}catch{}},5e3)}async importTailoredAccounts(t){t.textContent="Importing your accounts...",t.className="eudia-setup-sf-status loading";try{let e=this.plugin.settings.userEmail,n=M(e)?"admin":H(e)?"cs":"bl";console.log(`[Eudia SF Import] Importing for ${e} (group: ${n})`);let a,i=[];if(n==="cs"){console.log("[Eudia SF Import] CS user SF Connect \u2014 fetching live data from Salesforce..."),t.textContent="Syncing with Salesforce for latest account data...";try{let u=await this.accountOwnershipService.getCSAccounts(e);a=u.accounts,i=u.prospects,console.log(`[Eudia SF Import] CS server sync: ${a.length} accounts (with real SF IDs + CSM data)`)}catch{if(this.plugin.settings.accountsImported){t.textContent="Salesforce connected! Account folders already loaded. Enrichment will retry later.",t.className="eudia-setup-sf-status success",this.steps[1].status="complete";return}a=[...F],console.log(`[Eudia SF Import] CS server unavailable \u2014 using ${a.length} static accounts`)}}else if(n==="admin")console.log("[Eudia] Admin user detected - importing all accounts"),t.textContent="Admin detected - importing all accounts...",a=await this.accountOwnershipService.getAllAccountsForAdmin(e);else{let u=await this.accountOwnershipService.getAccountsWithProspects(e);a=u.accounts,i=u.prospects}if(a.length===0&&i.length===0){t.textContent="No accounts found for your email. Contact your admin.",t.className="eudia-setup-sf-status warning";return}t.textContent=`Creating ${a.length} account folders...`;let s=this.plugin.app.workspace.leftSplit,o=s?.collapsed;if(s&&!o&&s.collapse(),M(e)?await this.plugin.createAdminAccountFolders(a):(await this.plugin.createTailoredAccountFolders(a,{}),i.length>0&&await this.plugin.createProspectAccountFiles(i)),G(e))try{await this.plugin.createCSManagerDashboard(e,a)}catch{}this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=a.length+i.length,await this.plugin.saveSettings();try{let u=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");u&&await this.plugin.app.vault.delete(u)}catch{}s&&!o&&s.expand(),this.steps[2].status="complete";let l=a.filter(u=>u.isOwned!==!1).length,c=a.filter(u=>u.isOwned===!1).length;n==="admin"&&c>0?t.textContent=`${l} owned + ${c} view-only accounts imported! Enriching...`:t.textContent=`${a.length} active + ${i.length} prospect accounts imported! Enriching...`,t.className="eudia-setup-sf-status success";let d=[...a,...i];try{let u=d.filter(h=>h.id&&h.id.startsWith("001"));if(u.length>0?(t.textContent=`Enriching ${u.length} accounts with Salesforce contacts...`,await this.plugin.enrichAccountFolders(u),t.textContent=`${a.length} accounts imported, ${u.length} enriched with Salesforce data`):t.textContent=`${a.length} accounts imported (enrichment requires Salesforce IDs)`,n==="cs"&&G(e))try{console.log("[Eudia SF Import] Regenerating CS Manager dashboard with live CSM data..."),await this.plugin.createCSManagerDashboard(e,a),console.log("[Eudia SF Import] CS Manager dashboard updated with CSM assignments")}catch(h){console.error("[Eudia SF Import] Dashboard regeneration failed (non-blocking):",h)}}catch(u){console.log("[Eudia] SF Connect enrichment failed, will retry on next launch:",u),t.textContent=`${a.length+i.length} accounts imported (enrichment will retry on next launch)`}}catch{t.textContent="Failed to import accounts. Please try again.",t.className="eudia-setup-sf-status error";let n=this.plugin.app.workspace.leftSplit;if(n?.collapsed===!1)try{n.expand()}catch{}}}renderTranscribeStep(t){let e=this.steps[2],n=t.createDiv({cls:`eudia-setup-step-card ${e.status}`}),a=n.createDiv({cls:"eudia-setup-step-header"}),i=a.createDiv({cls:"eudia-setup-step-number"});i.setText(e.status==="complete"?"":"3"),e.status==="complete"&&i.addClass("eudia-step-complete");let s=a.createDiv({cls:"eudia-setup-step-info"});s.createEl("h3",{text:e.title}),s.createEl("p",{text:e.description});let o=n.createDiv({cls:"eudia-setup-step-content"}),l=o.createDiv({cls:"eudia-setup-instructions"}),c=l.createDiv({cls:"eudia-setup-instruction"}),d=c.createSpan({cls:"eudia-setup-instruction-icon"});(0,p.setIcon)(d,"microphone"),c.createSpan({text:"Click the microphone icon in the left sidebar during a call"});let u=l.createDiv({cls:"eudia-setup-instruction"}),h=u.createSpan({cls:"eudia-setup-instruction-icon"});(0,p.setIcon)(h,"terminal"),u.createSpan({text:'Or press Cmd/Ctrl+P and search for "Transcribe Meeting"'});let m=l.createDiv({cls:"eudia-setup-instruction"}),g=m.createSpan({cls:"eudia-setup-instruction-icon"});(0,p.setIcon)(g,"file-text"),m.createSpan({text:"AI will summarize and extract key insights automatically"}),e.status!=="complete"&&o.createEl("p",{cls:"eudia-setup-help-text muted",text:"This step completes automatically after connecting to Salesforce and importing accounts."})}renderFooter(t){let e=t.createDiv({cls:"eudia-setup-footer"});if(this.steps.every(i=>i.status==="complete")){let i=e.createDiv({cls:"eudia-setup-completion"}),s=i.createEl("h2",{cls:"eudia-setup-completion-title"}),o=s.createSpan({cls:"eudia-setup-completion-icon"});(0,p.setIcon)(o,"check-circle"),s.createSpan({text:" You're all set!"}),i.createEl("p",{text:"Your Eudia Notetaker is ready. Click below to start using Eudia."});let l=e.createEl("button",{text:"Open Calendar \u2192",cls:"eudia-setup-btn primary large"});l.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(B),await this.plugin.activateCalendarView()}}else{let i=e.createEl("button",{text:"Skip Setup (I'll do this later)",cls:"eudia-setup-btn secondary"});i.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(B);let s=this.plugin.app.vault.getAbstractFileByPath("QUICKSTART.md");s instanceof p.TFile&&await this.plugin.app.workspace.getLeaf().openFile(s),new p.Notice("You can complete setup anytime from Settings \u2192 Eudia Sync")}}let a=e.createEl("a",{text:"Advanced Settings",cls:"eudia-setup-settings-link"});a.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")}}},re=class extends p.ItemView{constructor(t,e){super(t);this.updateInterval=null;this.chatHistory=[];this.plugin=e}getViewType(){return _}getDisplayText(){return"Live Query"}getIcon(){return"message-circle"}async onOpen(){await this.render(),this.updateInterval=window.setInterval(()=>this.updateStatus(),5e3)}async onClose(){this.updateInterval&&window.clearInterval(this.updateInterval)}updateStatus(){let t=this.containerEl.querySelector(".eudia-lq-status");if(t)if(this.plugin.audioRecorder?.isRecording()){let e=Math.round((this.plugin.liveTranscript?.length||0)/5),n=this.plugin.audioRecorder.getState().duration,a=Math.floor(n/60),i=n%60;t.setText(`Recording ${a}:${i.toString().padStart(2,"0")} \u2014 ${e} words captured`),t.style.color="var(--text-success)"}else t.setText("Not recording. Start a recording to use Live Query."),t.style.color="var(--text-muted)"}async render(){let t=this.containerEl.children[1];t.empty(),t.addClass("eudia-live-query-view"),t.style.cssText="display:flex;flex-direction:column;height:100%;padding:12px;";let e=t.createDiv({cls:"eudia-lq-status"});e.style.cssText="font-size:12px;padding:8px 0;border-bottom:1px solid var(--background-modifier-border);margin-bottom:8px;",this.updateStatus();let n=t.createDiv({cls:"eudia-lq-quick-actions"});n.style.cssText="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;";let a=[{label:"Summarize so far",query:"Give me a concise summary of everything discussed so far."},{label:"Action items",query:"What action items or next steps have been discussed so far?"},{label:"Key concerns",query:"What concerns, objections, or risks have been raised?"}];for(let c of a){let d=n.createEl("button",{text:c.label});d.style.cssText="font-size:11px;padding:4px 10px;border-radius:12px;border:1px solid var(--background-modifier-border);cursor:pointer;background:var(--background-secondary);",d.onclick=()=>this.submitQuery(c.query,i,o)}let i=t.createDiv({cls:"eudia-lq-chat"});i.style.cssText="flex:1;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:8px;";for(let c of this.chatHistory)this.renderMessage(i,c.role,c.text);if(this.chatHistory.length===0){let c=i.createDiv();c.style.cssText="color:var(--text-muted);font-size:12px;text-align:center;padding:20px 0;",c.setText("Ask a question about the conversation while recording.")}let s=t.createDiv({cls:"eudia-lq-input-area"});s.style.cssText="display:flex;gap:8px;border-top:1px solid var(--background-modifier-border);padding-top:8px;";let o=s.createEl("textarea",{attr:{placeholder:"Ask about the conversation...",rows:"2"}});o.style.cssText="flex:1;resize:none;border-radius:8px;padding:8px;font-size:13px;border:1px solid var(--background-modifier-border);background:var(--background-primary);";let l=s.createEl("button",{text:"Ask"});l.style.cssText="padding:8px 16px;border-radius:8px;cursor:pointer;align-self:flex-end;font-weight:600;",l.addClass("mod-cta"),l.onclick=()=>this.submitQuery(o.value.trim(),i,o),o.addEventListener("keydown",c=>{c.key==="Enter"&&!c.shiftKey&&(c.preventDefault(),l.click())})}renderMessage(t,e,n){let a=t.querySelector(".eudia-lq-chat > div:only-child");a&&a.textContent?.includes("Ask a question")&&a.remove();let i=t.createDiv(),s=e==="user";i.style.cssText=`padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.5;max-width:90%;${s?"align-self:flex-end;background:var(--interactive-accent);color:var(--text-on-accent);":"align-self:flex-start;background:var(--background-secondary);"}`,i.setText(n)}async submitQuery(t,e,n){if(!t)return;if(!this.plugin.audioRecorder?.isRecording()){new p.Notice("Start a recording first to use Live Query.");return}let a=this.plugin.liveTranscript||"";if(a.length<50){new p.Notice("Not enough transcript captured yet. Keep recording for a few more minutes.");return}this.chatHistory.push({role:"user",text:t}),this.renderMessage(e,"user",t),n.value="";let i=e.createDiv();i.style.cssText="align-self:flex-start;padding:8px 12px;border-radius:10px;font-size:13px;background:var(--background-secondary);color:var(--text-muted);",i.setText("Thinking..."),e.scrollTop=e.scrollHeight;try{let s=await this.plugin.transcriptionService.liveQueryTranscript(t,a,this.plugin.getAccountNameFromActiveFile());i.remove();let o=s.success?s.answer:s.error||"Query failed";this.chatHistory.push({role:"assistant",text:o}),this.renderMessage(e,"assistant",o)}catch(s){i.remove();let o=`Error: ${s.message}`;this.chatHistory.push({role:"assistant",text:o}),this.renderMessage(e,"assistant",o)}e.scrollTop=e.scrollHeight}},oe=class O extends p.ItemView{constructor(t,e){super(t);this.refreshInterval=null;this.lastError=null;this.showExternalOnly=!0;this.weeksBack=2;this.plugin=e}getViewType(){return z}getDisplayText(){return"Calendar"}getIcon(){return"calendar"}async onOpen(){await this.render(),this.refreshInterval=window.setInterval(()=>this.render(),5*60*1e3)}async onClose(){this.refreshInterval&&window.clearInterval(this.refreshInterval)}async render(){let t=this.containerEl.children[1];if(t.empty(),t.addClass("eudia-calendar-view"),!this.plugin.settings.userEmail){this.renderSetupPanel(t);return}this.renderHeader(t),await this.renderCalendarContent(t)}static{this.INTERNAL_SUBJECT_PATTERNS=[/^block\b/i,/\bblock\s+for\b/i,/\bcommute\b/i,/\bpersonal\b/i,/\blunch\b/i,/\bOOO\b/i,/\bout of office\b/i,/\bfocus time\b/i,/\bno meetings?\b/i,/\bmeeting free\b/i,/\btravel\b/i,/\beye appt\b/i,/\bdoctor\b/i,/\bdentist\b/i,/\bgym\b/i,/\bworkout\b/i]}isExternalMeeting(t){if(t.isCustomerMeeting)return!0;if(!t.attendees||t.attendees.length===0)return!1;let e=this.plugin.settings.userEmail?.split("@")[1]||"eudia.com";if(t.attendees.some(a=>{if(a.isExternal===!0)return!0;if(a.isExternal===!1||!a.email)return!1;let i=a.email.split("@")[1]?.toLowerCase();return i&&i!==e.toLowerCase()}))return!0;for(let a of O.INTERNAL_SUBJECT_PATTERNS)if(a.test(t.subject))return!1;return!1}renderHeader(t){let e=t.createDiv({cls:"eudia-calendar-header"}),n=e.createDiv({cls:"eudia-calendar-title-row"});n.createEl("h4",{text:"Your Meetings"});let a=n.createDiv({cls:"eudia-calendar-actions"}),i=a.createEl("button",{cls:"eudia-btn-icon",text:"\u21BB"});i.title="Refresh",i.onclick=async()=>{i.addClass("spinning"),this._forceRefresh=!0,await this.render(),i.removeClass("spinning")};let s=a.createEl("button",{cls:"eudia-btn-icon"});(0,p.setIcon)(s,"settings"),s.title="Settings",s.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")};let o=e.createDiv({cls:"eudia-status-bar"});this.renderConnectionStatus(o);let l=e.createDiv({cls:"eudia-calendar-filter-row"});l.style.cssText="display:flex;align-items:center;gap:8px;margin-top:6px;padding:4px 0;";let c=l.createEl("button",{text:this.showExternalOnly?"External Only":"All Meetings",cls:"eudia-filter-toggle"});c.style.cssText=`font-size:11px;padding:3px 10px;border-radius:12px;cursor:pointer;border:1px solid var(--background-modifier-border);background:${this.showExternalOnly?"var(--interactive-accent)":"var(--background-secondary)"};color:${this.showExternalOnly?"var(--text-on-accent)":"var(--text-muted)"};`,c.title=this.showExternalOnly?"Showing customer/external meetings only \u2014 click to show all":"Showing all meetings \u2014 click to filter to external only",c.onclick=async()=>{this.showExternalOnly=!this.showExternalOnly,await this.render()}}async renderConnectionStatus(t){let e={server:"connecting",calendar:"not_configured",salesforce:"not_configured"},n=this.plugin.settings.serverUrl,a=this.plugin.settings.userEmail;try{(await(0,p.requestUrl)({url:`${n}/api/health`,method:"GET",throw:!1})).status===200?(e.server="connected",e.serverMessage="Server online"):(e.server="error",e.serverMessage="Server unavailable")}catch{e.server="error",e.serverMessage="Cannot reach server"}if(a&&e.server==="connected")try{let d=await(0,p.requestUrl)({url:`${n}/api/calendar/validate/${encodeURIComponent(a)}`,method:"GET",throw:!1});d.status===200&&d.json?.authorized?(e.calendar="connected",e.calendarMessage="Calendar synced"):(e.calendar="not_authorized",e.calendarMessage="Not authorized")}catch{e.calendar="error",e.calendarMessage="Error checking access"}if(a&&e.server==="connected")try{let d=await(0,p.requestUrl)({url:`${n}/api/sf/auth/status?email=${encodeURIComponent(a)}`,method:"GET",throw:!1});d.status===200&&d.json?.connected?(e.salesforce="connected",e.salesforceMessage="Salesforce connected"):(e.salesforce="not_configured",e.salesforceMessage="Not connected")}catch{e.salesforce="not_configured"}let i=t.createDiv({cls:"eudia-status-indicators"}),s=i.createSpan({cls:`eudia-status-dot ${e.server}`});s.title=e.serverMessage||"Server";let o=i.createSpan({cls:`eudia-status-dot ${e.calendar}`});o.title=e.calendarMessage||"Calendar";let l=i.createSpan({cls:`eudia-status-dot ${e.salesforce}`});if(l.title=e.salesforceMessage||"Salesforce",t.createDiv({cls:"eudia-status-labels"}).createSpan({cls:"eudia-status-label",text:this.plugin.settings.userEmail}),e.calendar==="not_authorized"){let d=t.createDiv({cls:"eudia-status-warning"});d.innerHTML=`<strong>${a}</strong> is not authorized for calendar access. Contact your admin.`}}async renderCalendarContent(t){let e=t.createDiv({cls:"eudia-calendar-content"}),n=e.createDiv({cls:"eudia-calendar-loading"});n.innerHTML='<div class="eudia-spinner"></div><span>Loading meetings...</span>';try{let a=new R(this.plugin.settings.serverUrl,this.plugin.settings.userEmail,this.plugin.settings.timezone||"America/New_York"),i=this._forceRefresh||!1;this._forceRefresh=!1;let s=await a.getWeekMeetings(i);if(!s.success){n.remove(),this.renderError(e,s.error||"Failed to load calendar");return}let o=new Date,l=new Date(o);l.setDate(l.getDate()-this.weeksBack*7);let c=new Date(o);c.setDate(c.getDate()-1);let d=[];try{d=await a.getMeetingsInRange(l,c)}catch{console.log("[Calendar] Could not fetch past meetings")}n.remove();let u={};for(let S of d){let b=S.start.split("T")[0];u[b]||(u[b]=[]),u[b].push(S)}for(let[S,b]of Object.entries(s.byDay||{})){u[S]||(u[S]=[]);let f=new Set(u[S].map(y=>y.id));for(let y of b)f.has(y.id)||u[S].push(y)}let h={};for(let[S,b]of Object.entries(u)){let f=this.showExternalOnly?b.filter(y=>this.isExternalMeeting(y)):b;f.length>0&&(h[S]=f)}let m=Object.keys(h).sort();if(m.length===0){this.renderEmptyState(e);return}await this.renderCurrentMeeting(e,a);let g=e.createEl("button",{text:"\u2190 Load earlier meetings",cls:"eudia-load-earlier"});g.style.cssText="width:100%;padding:8px;margin-bottom:8px;font-size:12px;cursor:pointer;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-muted);",g.onclick=async()=>{this.weeksBack+=2,await this.render()};let v=o.toISOString().split("T")[0],C=null;for(let S of m){let b=h[S];if(!b||b.length===0)continue;let f=this.renderDaySection(e,S,b);S===v&&(C=f)}C&&setTimeout(()=>C.scrollIntoView({block:"start",behavior:"auto"}),100)}catch(a){n.remove(),this.renderError(e,a.message||"Failed to load calendar")}}async renderCurrentMeeting(t,e){try{let n=await e.getCurrentMeeting();if(n.meeting){let a=t.createDiv({cls:"eudia-now-card"});n.isNow?a.createDiv({cls:"eudia-now-badge",text:"\u25CF NOW"}):a.createDiv({cls:"eudia-now-badge soon",text:`In ${n.minutesUntilStart}m`});let i=a.createDiv({cls:"eudia-now-content"});i.createEl("div",{cls:"eudia-now-subject",text:n.meeting.subject}),n.meeting.accountName&&i.createEl("div",{cls:"eudia-now-account",text:n.meeting.accountName});let s=a.createEl("button",{cls:"eudia-now-action",text:"Create Note"});s.onclick=()=>this.createNoteForMeeting(n.meeting)}}catch{}}renderDaySection(t,e,n){let a=t.createDiv({cls:"eudia-calendar-day"}),i=new Date().toISOString().split("T")[0],s=e===i,o=e<i,l=s?"TODAY":R.getDayName(e),c=a.createEl("div",{cls:`eudia-calendar-day-header ${s?"today":""} ${o?"past":""}`,text:l});s?c.style.cssText="font-weight:700;color:var(--interactive-accent);":o&&(c.style.cssText="opacity:0.7;");for(let d of n){let u=a.createDiv({cls:`eudia-calendar-meeting ${d.isCustomerMeeting?"customer":"internal"} ${o?"past":""}`});o&&(u.style.cssText="opacity:0.85;"),u.createEl("div",{cls:"eudia-calendar-time",text:R.formatTime(d.start,this.plugin.settings.timezone)});let h=u.createDiv({cls:"eudia-calendar-details"});if(h.createEl("div",{cls:"eudia-calendar-subject",text:d.subject}),d.accountName)h.createEl("div",{cls:"eudia-calendar-account",text:d.accountName});else if(d.attendees&&d.attendees.length>0){let m=d.attendees.filter(g=>g.isExternal!==!1).slice(0,2).map(g=>g.name||g.email?.split("@")[0]||"Unknown").join(", ");m&&h.createEl("div",{cls:"eudia-calendar-attendees",text:m})}u.onclick=()=>this.createNoteForMeeting(d),u.title="Click to create meeting note"}return a}renderEmptyState(t){let e=t.createDiv({cls:"eudia-calendar-empty"});e.innerHTML=`
      <div class="eudia-empty-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <p class="eudia-empty-title">No meetings this week</p>
      <p class="eudia-empty-subtitle">Enjoy your focus time!</p>
    `}renderError(t,e){let n=t.createDiv({cls:"eudia-calendar-error"}),a="",i="Unable to load calendar",s="";e.includes("not authorized")||e.includes("403")?(a="\u{1F512}",i="Calendar Access Required",s="Contact your admin to be added to the authorized users list."):e.includes("network")||e.includes("fetch")?(a="\u{1F4E1}",i="Connection Issue",s="Check your internet connection and try again."):(e.includes("server")||e.includes("500"))&&(a="\u{1F527}",i="Server Unavailable",s="The server may be waking up. Try again in 30 seconds."),n.innerHTML=`
      <div class="eudia-error-icon">${a}</div>
      <p class="eudia-error-title">${i}</p>
      <p class="eudia-error-message">${e}</p>
      ${s?`<p class="eudia-error-action">${s}</p>`:""}
    `;let o=n.createEl("button",{cls:"eudia-btn-retry",text:"Try Again"});o.onclick=()=>this.render()}renderSetupPanel(t){let e=t.createDiv({cls:"eudia-calendar-setup-panel"});e.innerHTML=`
      <div class="eudia-setup-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <h3 class="eudia-setup-title">Connect Your Calendar</h3>
      <p class="eudia-setup-desc">Enter your Eudia email to see your meetings and create notes with one click.</p>
    `;let n=e.createDiv({cls:"eudia-setup-input-group"}),a=n.createEl("input",{type:"email",placeholder:"yourname@eudia.com"});a.addClass("eudia-setup-email");let i=n.createEl("button",{cls:"eudia-setup-connect",text:"Connect"}),s=e.createDiv({cls:"eudia-setup-status"});i.onclick=async()=>{let o=a.value.trim().toLowerCase();if(!o||!o.endsWith("@eudia.com")){s.textContent="Please use your @eudia.com email",s.className="eudia-setup-status error";return}i.disabled=!0,i.textContent="Connecting...",s.textContent="";try{if(!(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${o}`,method:"GET"})).json?.authorized){s.innerHTML=`<strong>${o}</strong> is not authorized. Contact your admin to be added.`,s.className="eudia-setup-status error",i.disabled=!1,i.textContent="Connect";return}this.plugin.settings.userEmail=o,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),s.textContent="Connected",s.className="eudia-setup-status success",this.plugin.scanLocalAccountFolders().catch(()=>{}),setTimeout(()=>this.render(),500)}catch(l){let c=l.message||"Connection failed";c.includes("403")?s.innerHTML=`<strong>${o}</strong> is not authorized for calendar access.`:s.textContent=c,s.className="eudia-setup-status error",i.disabled=!1,i.textContent="Connect"}},a.onkeydown=o=>{o.key==="Enter"&&i.click()},e.createEl("p",{cls:"eudia-setup-help",text:"Your calendar syncs automatically via Microsoft 365."})}extractCompanyFromDomain(t){let e=t.toLowerCase().split("."),n=["mail","email","app","portal","crm","www","smtp","sales","support","login","sso","auth","api","my"],a=["com","org","net","io","co","ai","gov","edu","uk","us","de","fr","jp","au","ca"],i=e.filter(o=>!a.includes(o)&&o.length>1);if(i.length===0)return e[0]||"";if(i.length>1&&n.includes(i[0]))return i[1].charAt(0).toUpperCase()+i[1].slice(1);let s=i[i.length-1];return s.charAt(0).toUpperCase()+s.slice(1)}getExternalDomainsFromAttendees(t){if(!t||t.length===0)return[];let e=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com","live.com","msn.com","aol.com","protonmail.com","googlemail.com","mail.com","zoho.com","ymail.com"],n=new Set,a=[];for(let i of t){if(!i.email)continue;let o=i.email.toLowerCase().match(/@([a-z0-9.-]+)/);if(o){let l=o[1];if(l.includes("eudia.com")||e.includes(l)||n.has(l))continue;n.add(l);let c=this.extractCompanyFromDomain(l);c.length>=2&&a.push({domain:l,company:c})}}return a}findBestAccountMatch(t,e,n){let a=this.plugin.settings.accountsFolder||"Accounts",i=this.app.vault.getAbstractFileByPath(a);if(!(i instanceof p.TFolder))return null;let s=[];for(let l of i.children)if(l instanceof p.TFolder)if(l.name==="_Prospects")for(let c of l.children)c instanceof p.TFolder&&s.push(c.name);else s.push(l.name);if(s.length===0)return null;let o=[];for(let{domain:l,company:c}of t){let d=this.findAccountFolder(c),u=d?1:0;o.push({domain:l,company:c,folder:d,score:u})}if(o.sort((l,c)=>c.score-l.score),o.length>0&&o[0].folder){let l=o[0],c=l.folder.split("/").pop()||l.company;return console.log(`[Eudia Calendar] Best domain match: "${l.company}" from ${l.domain} -> ${l.folder}`),{folder:l.folder,accountName:c,source:"domain"}}if(e){let l=this.findAccountFolder(e);if(l){let c=l.split("/").pop()||e;return console.log(`[Eudia Calendar] Server account match: "${e}" -> ${l}`),{folder:l,accountName:c,source:"server"}}}if(n){let l=this.findAccountFolder(n);if(l){let c=l.split("/").pop()||n;return console.log(`[Eudia Calendar] Subject match: "${n}" -> ${l}`),{folder:l,accountName:c,source:"subject"}}}for(let{company:l}of t){let c=s.find(d=>{let u=d.toLowerCase(),h=l.toLowerCase();return u.includes(h)||h.includes(u)});if(c){let d=`${a}/${c}`;return console.log(`[Eudia Calendar] Partial domain match: "${l}" -> ${d}`),{folder:d,accountName:c,source:"domain-partial"}}}return null}extractAccountFromAttendees(t){let e=this.getExternalDomainsFromAttendees(t);if(e.length===0)return null;let n=e[0];return console.log(`[Eudia Calendar] Extracted company "${n.company}" from attendee domain ${n.domain}`),n.company}extractAccountFromSubject(t){if(!t)return null;let e=t.match(/^([^\/]+)\s*\/\s*Eudia|Eudia\s*\/\s*([^\/\-|]+)/i);if(e){let a=(e[1]||e[2]||"").trim();if(a.toLowerCase()!=="eudia")return a}let n=t.match(/^Eudia\s*[-–]\s*([^|]+)|^([^-–]+)\s*[-–]\s*Eudia/i);if(n){let i=(n[1]||n[2]||"").trim().replace(/\s+(Connect|Weekly|Call|Meeting|Intro|Demo|Check\s*in|Sync).*$/i,"").trim();if(i.toLowerCase()!=="eudia"&&i.length>0)return i}if(!t.toLowerCase().includes("eudia")){let a=t.match(/^([^-–|]+)/);if(a){let i=a[1].trim();if(i.length>2&&i.length<50)return i}}return null}findAccountFolder(t){if(!t)return null;let e=this.plugin.settings.accountsFolder||"Accounts",n=this.app.vault.getAbstractFileByPath(e);if(!(n instanceof p.TFolder))return console.log(`[Eudia Calendar] Accounts folder "${e}" not found`),null;let a=t.toLowerCase().trim(),i=[],s=new Set;for(let m of n.children)if(m instanceof p.TFolder)if(m.name==="_Prospects")for(let g of m.children)g instanceof p.TFolder&&(i.push(g.name),s.add(g.name));else i.push(m.name);console.log(`[Eudia Calendar] Searching for "${a}" in ${i.length} folders`);let o=m=>s.has(m)?`${e}/_Prospects/${m}`:`${e}/${m}`,l=i.find(m=>m.toLowerCase()===a);if(l)return console.log(`[Eudia Calendar] Exact match found: ${l}`),o(l);let c=i.find(m=>m.toLowerCase().startsWith(a));if(c)return console.log(`[Eudia Calendar] Folder starts with match: ${c}`),o(c);let d=i.find(m=>a.startsWith(m.toLowerCase()));if(d)return console.log(`[Eudia Calendar] Search starts with folder match: ${d}`),o(d);let u=i.find(m=>{let g=m.toLowerCase();return g.length<3||!a.includes(g)?!1:new RegExp(`\\b${g.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`).test(a)});if(u)return console.log(`[Eudia Calendar] Search contains folder match: ${u}`),o(u);let h=i.find(m=>{let g=m.toLowerCase();return a.length<3||!g.includes(a)?!1:new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`).test(g)});return h?(console.log(`[Eudia Calendar] Folder contains search match: ${h}`),o(h)):(console.log(`[Eudia Calendar] No folder match found for "${a}"`),null)}async createNoteForMeeting(t){let e=t.start.split("T")[0],n=this.plugin.settings.eudiaEmail||"",a=M(n),i=(t.attendees||[]).map(f=>f.email).filter(Boolean),s=de(t.subject,i);if(a&&s.isPipelineMeeting&&s.confidence>=60){await this._createPipelineNote(t,e);return}let o=t.subject.replace(/[<>:"/\\|?*]/g,"_").substring(0,50),l=`${e} - ${o}.md`,c=null,d=t.accountName||null,u=null;console.log(`[Eudia Calendar] === Creating note for meeting: "${t.subject}" ===`),console.log(`[Eudia Calendar] Attendees: ${JSON.stringify(t.attendees?.map(f=>f.email)||[])}`);let h=this.getExternalDomainsFromAttendees(t.attendees||[]);console.log(`[Eudia Calendar] External domains found: ${JSON.stringify(h)}`);let m=this.extractAccountFromSubject(t.subject);console.log(`[Eudia Calendar] Subject-extracted name: "${m||"none"}"`);let g=this.findBestAccountMatch(h,t.accountName,m||void 0);if(g&&(c=g.folder,d=g.accountName,console.log(`[Eudia Calendar] Best match (${g.source}): "${d}" -> ${c}`)),!c){let f=this.plugin.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(f)instanceof p.TFolder&&(c=f,console.log(`[Eudia Calendar] No match found, using Accounts root: ${c}`))}if(d){let f=this.plugin.settings.cachedAccounts.find(y=>y.name.toLowerCase()===d?.toLowerCase());f&&(u=f.id,d=f.name,console.log(`[Eudia Calendar] Matched to cached account: ${f.name} (${f.id})`))}let v=c?`${c}/${l}`:l,C=this.app.vault.getAbstractFileByPath(v);if(C instanceof p.TFile){await this.app.workspace.getLeaf().openFile(C);try{let f=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;f?.revealInFolder&&f.revealInFolder(C)}catch{}new p.Notice(`Opened existing note: ${l}`);return}let S=(t.attendees||[]).map(f=>f.name||f.email?.split("@")[0]||"Unknown").slice(0,5).join(", "),b=`---
title: "${t.subject}"
date: ${e}
attendees: [${S}]
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

`;try{let f=await this.app.vault.create(v,b);await this.app.workspace.getLeaf().openFile(f);try{let y=this.app.workspace.leftSplit;y?.collapsed&&y.expand();let w=this.app.workspace.getLeavesOfType("file-explorer")[0];w&&this.app.workspace.revealLeaf(w);let A=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;A?.revealInFolder&&(A.revealInFolder(f),setTimeout(()=>{let x=document.querySelector(`.nav-file-title[data-path="${f.path.replace(/"/g,'\\"')}"]`);x&&(x.addClass("is-flashing"),setTimeout(()=>x.removeClass("is-flashing"),3e3))},300))}catch{}new p.Notice(`Note created under ${d||"Accounts"}`)}catch(f){console.error("[Eudia Calendar] Failed to create note:",f),new p.Notice(`Could not create note: ${f.message||"Unknown error"}`)}}async _createPipelineNote(t,e){let n=new Date(e+"T00:00:00"),a=String(n.getMonth()+1).padStart(2,"0"),i=String(n.getDate()).padStart(2,"0"),s=String(n.getFullYear()).slice(-2),o=`${a}.${i}.${s}`,l=`Team Pipeline Meeting - ${o}.md`,c="Pipeline Meetings";this.app.vault.getAbstractFileByPath(c)||await this.app.vault.createFolder(c);let u=`${c}/${l}`,h=this.app.vault.getAbstractFileByPath(u);if(h instanceof p.TFile){await this.app.workspace.getLeaf().openFile(h);try{let v=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;v?.revealInFolder&&v.revealInFolder(h)}catch{}new p.Notice(`Opened existing: ${l}`);return}let m=(t.attendees||[]).map(v=>v.name||v.email?.split("@")[0]||"Unknown"),g=`---
title: "Team Pipeline Meeting - ${o}"
date: ${e}
attendees: [${m.slice(0,10).join(", ")}]
meeting_type: pipeline_review
meeting_start: ${t.start}
transcribed: false
---

# Weekly Pipeline Review | ${n.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"})}

## Attendees
${m.map(v=>`- ${v}`).join(`
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

`;try{let v=await this.app.vault.create(u,g);await this.app.workspace.getLeaf().openFile(v);try{let C=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;C?.revealInFolder&&C.revealInFolder(v)}catch{}new p.Notice(`Created pipeline note: ${l}`),console.log(`[Eudia Pipeline] Created pipeline meeting note: ${u}`)}catch(v){console.error("[Eudia Pipeline] Failed to create pipeline note:",v),new p.Notice(`Could not create pipeline note: ${v.message||"Unknown error"}`)}}},Q=class O extends p.Plugin{constructor(){super(...arguments);this.audioRecorder=null;this.recordingStatusBar=null;this.micRibbonIcon=null;this._updateInProgress=!1;this._hotReloadPending=!1;this._migrationInProgress=!1;this._updateStatusEl=null;this.liveTranscript="";this.liveTranscriptChunkInterval=null;this.isTranscribingChunk=!1;this._updateRetryCount=0;this._updateBannerEl=null;this.sfSyncStatusBarEl=null;this.sfSyncIntervalId=null}async onload(){if(await this.loadSettings(),this.settings.lastUpdateVersion&&this.settings.lastUpdateVersion===this.manifest?.version&&this.settings.lastUpdateTimestamp&&Date.now()-new Date(this.settings.lastUpdateTimestamp).getTime()<3e4){console.log("[Eudia] Post-update hot-reload detected. Escaping to clean reload."),this.settings.lastUpdateTimestamp=null,await this.saveSettings(),window.location.reload();return}if(this.transcriptionService=new q(this.settings.serverUrl),this.transcriptionService.setUserEmail(this.settings.userEmail),this.calendarService=new R(this.settings.serverUrl,this.settings.userEmail,this.settings.timezone||"America/New_York"),this.smartTagService=new J,this.telemetry=new te(this.settings.serverUrl,this.settings.userEmail),this.telemetry.setPluginVersion(this.manifest?.version||"0.0.0"),!this.settings.deviceId){try{this.settings.deviceId=crypto.randomUUID()}catch{this.settings.deviceId="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,n=>{let a=Math.random()*16|0;return(n==="x"?a:a&3|8).toString(16)})}try{this.settings.deviceName=require("os").hostname()}catch{this.settings.deviceName="unknown"}await this.saveSettings(),console.log(`[Eudia] Device registered: ${this.settings.deviceId} (${this.settings.deviceName})`)}this.telemetry.setDeviceIdentity(this.settings.deviceId||"",this.settings.deviceName||""),I.setupDisplayMediaHandler().then(n=>{console.log(n?"[Eudia] System audio: loopback handler ready":"[Eudia] System audio: handler not available, will try other strategies on record")}).catch(()=>{}),this.checkForUpdateRollback().catch(n=>console.warn("[Eudia] Rollback check error:",n)),this.ensureLightTheme().catch(()=>{}),this.ensureEditableMode().catch(()=>{});let t=this.settings.lastUpdateTimestamp?Date.now()-new Date(this.settings.lastUpdateTimestamp).getTime():1/0,e=this.manifest?.version||"0.0.0";if(t<3e4&&this.settings.lastUpdateVersion===e&&(this._showUpdateStatus(`\u2713 Eudia v${e} active`),setTimeout(()=>this._hideUpdateStatus(),6e3),console.log(`[Eudia Update] Confirmed: now running v${e}`)),this.settings.pendingReloadVersion&&(this.settings.pendingReloadVersion===e?(this.settings.pendingReloadVersion=null,this.saveSettings(),console.log(`[Eudia Update] Pending reload resolved \u2014 now running v${e}`)):setTimeout(()=>this._showUpdateBanner(this.settings.pendingReloadVersion),3e3)),this.settings.pendingUpdateVersion){let n=this.settings.pendingUpdateVersion;this.settings.pendingUpdateVersion=null,this.saveSettings(),setTimeout(()=>{console.log(`[Eudia Update] Resuming deferred update to v${n}`),this.performAutoUpdate(this.settings.serverUrl||"https://gtm-wizard.onrender.com",n,this.manifest?.version||"0.0.0")},8e3)}setTimeout(()=>this.checkForPluginUpdate(),5e3),setTimeout(()=>this.checkForPluginUpdate(),18e4),this.registerInterval(window.setInterval(()=>this.checkForPluginUpdate(),10*60*1e3)),setTimeout(()=>this.pollVaultOperations(),15e3),this.registerInterval(window.setInterval(()=>this.pollVaultOperations(),60*1e3)),this.registerInterval(window.setInterval(()=>this.sendPeriodicHeartbeat(),30*60*1e3)),setTimeout(()=>this.healFailedTranscriptions(),3e4),this.registerView(z,n=>new oe(n,this)),this.registerView(B,n=>new se(n,this)),this.registerObsidianProtocolHandler("eudia-update",async()=>{console.log("[Eudia Update] Protocol handler triggered: obsidian://eudia-update"),new p.Notice("Updating Eudia Notetaker...",5e3);let n=this.settings.serverUrl||"https://gtm-wizard.onrender.com";try{let[a,i,s]=await Promise.all([(0,p.requestUrl)({url:`${n}/api/plugin/main.js`}),(0,p.requestUrl)({url:`${n}/api/plugin/manifest.json`}),(0,p.requestUrl)({url:`${n}/api/plugin/styles.css`})]);if(!a.text||a.text.length<1e4){new p.Notice("Update download failed. Try again in a minute.",8e3);return}let o=this.manifest.dir;if(!o)return;let l=this.app.vault.adapter;try{await l.write(`${o}/main.js.bak`,await l.read(`${o}/main.js`))}catch{}await l.write(`${o}/main.js`,a.text),await l.write(`${o}/manifest.json`,i.text),await l.write(`${o}/styles.css`,s.text);let c=JSON.parse(i.text).version||"latest";this.settings.lastUpdateVersion=c,this.settings.lastUpdateTimestamp=new Date().toISOString(),await this.saveSettings(),new p.Notice(`Eudia Lite v${c} installed. Reloading...`,3e3),console.log(`[Eudia Update] Protocol update complete: v${c}. Reloading.`),setTimeout(()=>window.location.reload(),2e3)}catch(a){console.error("[Eudia Update] Protocol update failed:",a.message),new p.Notice("Update failed: "+a.message,1e4)}}),this.registerView(_,n=>new re(n,this)),this.addRibbonIcon("calendar","Open Calendar",()=>this.activateCalendarView()),this.micRibbonIcon=this.addRibbonIcon("microphone","Transcribe Meeting",async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}),this.addRibbonIcon("message-circle","Ask GTM Brain",()=>{this.openIntelligenceQueryForCurrentNote()}),this.registerEvent(this.app.vault.on("create",async n=>{if(!(n instanceof p.TFile)||n.extension!=="md")return;let a=this.settings.accountsFolder||"Accounts";if(!n.path.startsWith(a+"/")||!n.basename.startsWith("Untitled"))return;let i=n.path.split("/");if(i.length<3)return;let s=i[1],o=i.slice(0,2).join("/"),l="",c=["Contacts.md","Note 1.md","Intelligence.md"];for(let b of c){let f=this.app.vault.getAbstractFileByPath(`${o}/${b}`);if(f instanceof p.TFile)try{let w=(await this.app.vault.read(f)).match(/account_id:\s*"?([^"\n]+)"?/);if(w){l=w[1].trim();break}}catch{}}let d=this.app.vault.getAbstractFileByPath(o),u=0;if(d&&d.children)for(let b of d.children){let f=b.name?.match(/^Note\s+(\d+)/i);f&&(u=Math.max(u,parseInt(f[1])))}let h=u+1,m=new Date,g=m.toLocaleDateString("en-US",{month:"short",day:"numeric"}),v=m.toISOString().split("T")[0],C=`Note ${h} - ${g}.md`,S=`---
account: "${s}"
account_id: "${l}"
type: meeting_note
sync_to_salesforce: false
created: ${v}
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

`;try{let b=`${o}/${C}`;await this.app.vault.modify(n,S),await this.app.fileManager.renameFile(n,b),console.log(`[Eudia] Auto-templated: ${b} (account_id: ${l})`)}catch(b){console.warn("[Eudia] Auto-template failed:",b)}})),this.addCommand({id:"transcribe-meeting",name:"Transcribe Meeting",callback:async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}}),this.addCommand({id:"open-calendar",name:"Open Calendar",callback:()=>this.activateCalendarView()}),this.addCommand({id:"sync-accounts",name:"Sync Salesforce Accounts",callback:()=>this.syncAccounts()}),this.addCommand({id:"sync-note",name:"Sync Note to Salesforce",callback:()=>this.syncNoteToSalesforce()}),this.addCommand({id:"new-meeting-note",name:"New Meeting Note",callback:()=>this.createMeetingNote()}),this.addCommand({id:"ask-gtm-brain",name:"Ask gtm-brain",callback:()=>this.openIntelligenceQueryForCurrentNote()}),this.addCommand({id:"copy-for-slack",name:"Copy Note for Slack",callback:()=>this.copyForSlack()}),this.addCommand({id:"open-setup-guide",name:"Open Getting Started Guide",callback:()=>this.activateSetupView()}),this.addCommand({id:"check-for-updates",name:"Check for Eudia Updates",callback:async()=>{this._showUpdateStatus("\u27F3 Checking for updates\u2026");let n=this.manifest?.version||"?";try{let a=this.settings.serverUrl||"https://gtm-wizard.onrender.com",i=await(0,p.requestUrl)({url:`${a}/api/plugin/version`}),s=i.json?.currentVersion||"?";if(i.json?.success&&s!==n){let o=s.split(".").map(Number),l=n.split(".").map(Number),c=!1;for(let d=0;d<3;d++){if((o[d]||0)>(l[d]||0)){c=!0;break}if((o[d]||0)<(l[d]||0))break}c?await this.performAutoUpdate(a,s,n):(this._showUpdateStatus(`\u2713 Up to date (v${n})`),setTimeout(()=>this._hideUpdateStatus(),5e3))}else this._showUpdateStatus(`\u2713 Up to date (v${n})`),setTimeout(()=>this._hideUpdateStatus(),5e3)}catch{this._showUpdateStatus(`\u2717 Update check failed \u2014 v${n}`),setTimeout(()=>this._hideUpdateStatus(),8e3)}}}),this.addCommand({id:"test-system-audio",name:"Test System Audio Capture",callback:async()=>{new p.Notice("Probing system audio capabilities...",3e3);try{let n=await I.probeSystemAudioCapabilities(),a=[`Platform: ${n.platform}`,`Electron: ${n.electronVersion||"N/A"} | Chromium: ${n.chromiumVersion||"N/A"}`,`desktopCapturer: ${n.desktopCapturerAvailable?`YES (${n.desktopCapturerSources} sources)`:"no"}`,`@electron/remote: ${n.remoteAvailable?"YES":"no"} | session: ${n.remoteSessionAvailable?"YES":"no"}`,`ipcRenderer: ${n.ipcRendererAvailable?"YES":"no"}`,`getDisplayMedia: ${n.getDisplayMediaAvailable?"YES":"no"}`,`Handler setup: ${n.handlerSetupResult}`,"",`Best path: ${n.bestPath}`];new p.Notice(a.join(`
`),2e4),console.log("[Eudia] System audio probe:",JSON.stringify(n,null,2))}catch(n){new p.Notice(`Probe failed: ${n.message}`,5e3)}}}),this.addCommand({id:"enrich-accounts",name:"Enrich Account Folders with Salesforce Data",callback:async()=>{if(!this.settings.userEmail){new p.Notice("Please set up your email first.");return}let n=new L(this.settings.serverUrl),a;H(this.settings.userEmail)?a=await n.getCSAccounts(this.settings.userEmail):a=await n.getAccountsWithProspects(this.settings.userEmail);let i=[...a.accounts,...a.prospects];if(i.length===0){new p.Notice("No accounts found to enrich.");return}await this.enrichAccountFolders(i)}}),this.addCommand({id:"refresh-analytics",name:"Refresh Analytics Dashboard",callback:async()=>{let n=this.app.workspace.getActiveFile();n?await this.refreshAnalyticsDashboard(n):new p.Notice("No active file")}}),this.addCommand({id:"live-query-transcript",name:"Query Current Transcript (Live)",callback:async()=>{if(!this.audioRecorder?.isRecording()){new p.Notice("No active recording. Start recording first to use live query.");return}if(!this.liveTranscript||this.liveTranscript.length<50){new p.Notice("Not enough transcript captured yet. Keep recording for a few more minutes.");return}this.openLiveQueryModal()}}),this.addCommand({id:"retry-transcription",name:"Retry Transcription",callback:async()=>{await this.retryTranscriptionForCurrentNote()}}),this.sfSyncStatusBarEl=this.addStatusBarItem(),this.sfSyncStatusBarEl.setText("SF Sync: Idle"),this.sfSyncStatusBarEl.addClass("eudia-sf-sync-status"),this.addSettingTab(new ce(this.app,this)),this.registerEditorSuggest(new ne(this.app,this)),this.app.workspace.onLayoutReady(async()=>{if(!this.settings.setupCompleted&&this.settings.userEmail&&this.settings.salesforceConnected&&this.settings.accountsImported&&(this.settings.setupCompleted=!0,await this.saveSettings(),console.log("[Eudia] Auto-detected completed setup \u2014 skipping onboarding")),this.settings.setupCompleted){if(this.settings.syncOnStartup){if(await this.scanLocalAccountFolders(),!this.settings.prospectsMigrated&&this.settings.userEmail&&this.settings.accountsImported&&setTimeout(()=>this.migrateAccountStructure().catch(n=>console.warn("[Eudia] Account migration error (non-fatal):",n)),3e3),this.settings.userEmail&&this.settings.syncAccountsOnStartup){let n=new Date().toISOString().split("T")[0];this.settings.lastAccountRefreshDate!==n&&setTimeout(async()=>{try{console.log("[Eudia] Startup account sync - checking for changes...");let i=await this.syncAccountFolders();if(i.success){if(this.settings.lastAccountRefreshDate=n,await this.saveSettings(),i.added>0||i.archived>0){let s=[];i.added>0&&s.push(`${i.added} added`),i.archived>0&&s.push(`${i.archived} archived`),new p.Notice(`Account folders synced: ${s.join(", ")}`)}}else console.log("[Eudia] Sync failed:",i.error)}catch{console.log("[Eudia] Startup sync skipped (server unreachable), will retry tomorrow")}},2e3)}this.settings.showCalendarView&&this.settings.userEmail&&await this.activateCalendarView(),this.settings.userEmail&&this.settings.cachedAccounts.length>0&&setTimeout(async()=>{try{await this.checkAndAutoEnrich()}catch{console.log("[Eudia] Auto-enrich skipped (server unreachable)")}},5e3),this.settings.userEmail&&this.telemetry?setTimeout(async()=>{try{let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),a=0;n&&n instanceof p.TFolder&&(a=n.children.filter(l=>l instanceof p.TFolder&&!l.name.startsWith("_")).length);let i={salesforce:this.settings.salesforceConnected?"connected":"not_configured",calendar:this.settings.calendarConfigured?"connected":"not_configured"},s=await this.telemetry.sendHeartbeat(a,i);if(s?.latestVersion){let l=s.latestVersion.split(".").map(Number),c=(this.manifest?.version||"0.0.0").split(".").map(Number),d=!1;for(let u=0;u<3;u++){if((l[u]||0)>(c[u]||0)){d=!0;break}if((l[u]||0)<(c[u]||0))break}if(d){console.log(`[Eudia Update] Heartbeat detected update: v${this.manifest?.version} \u2192 v${s.latestVersion}`);let u=this.settings.serverUrl||"https://gtm-wizard.onrender.com";await this.performAutoUpdate(u,s.latestVersion,this.manifest?.version||"0.0.0")}}let o=await this.telemetry.checkForPushedConfig();if(o.length>0){let l=!1;for(let c of o)c.key&&this.settings.hasOwnProperty(c.key)&&(this.settings[c.key]=c.value,l=!0,console.log(`[Eudia] Applied pushed config: ${c.key} = ${c.value}`));l&&(await this.saveSettings(),new p.Notice("Settings updated by admin"))}await this.checkAndConsumeSyncFlags(),this.startSalesforceSyncScanner()}catch{console.log("[Eudia] Heartbeat/config check skipped"),this.startSalesforceSyncScanner()}},3e3):this.settings.sfAutoSyncEnabled&&this.settings.salesforceConnected&&setTimeout(()=>this.startSalesforceSyncScanner(),5e3)}}else{await new Promise(a=>setTimeout(a,100));let n=document.querySelector(".modal-container .modal");if(n){let a=n.querySelector(".modal-close-button");a&&a.click()}await this.activateSetupView()}this.app.workspace.on("file-open",async n=>{if(n&&(n.path.includes("_Analytics/")||n.path.includes("_Customer Health/")))try{let a=await this.app.vault.read(n);if(a.includes("type: analytics_dashboard")){let s=a.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/)?.[1],o=new Date().toISOString().split("T")[0];s!==o&&(console.log(`[Eudia] Auto-refreshing analytics: ${n.name}`),await this.refreshAnalyticsDashboard(n))}}catch{}})})}async onunload(){this.app.workspace.detachLeavesOfType(z),this.app.workspace.detachLeavesOfType(_)}static{this.MAX_UPDATE_RETRIES=5}static{this.UPDATE_RETRY_DELAYS=[1e4,2e4,4e4,6e4,9e4]}static{this.UPDATE_COOLDOWN_MS=3e5}_showUpdateStatus(t){this._updateStatusEl||(this._updateStatusEl=this.addStatusBarItem(),this._updateStatusEl.addClass("eudia-update-status")),this._updateStatusEl.setText(t),this._updateStatusEl.style.display=""}_hideUpdateStatus(){this._updateStatusEl&&(this._updateStatusEl.style.display="none")}_showUpdateBanner(t){if(this._updateBannerEl)return;let e=document.createElement("div");e.className="eudia-update-banner",e.innerHTML=`<span>Eudia v${t} downloaded \u2014 restart to apply</span>`;let n=document.createElement("button");n.textContent="Restart Plugin",n.onclick=async()=>{n.textContent="Restarting\u2026",n.disabled=!0;try{let i=this.app.plugins;await i.disablePlugin(this.manifest.id),await i.enablePlugin(this.manifest.id)}catch{n.textContent="Restart Plugin",n.disabled=!1,new p.Notice("Auto-restart failed. Please quit and reopen Obsidian (Cmd+Q).",1e4)}},e.appendChild(n);let a=document.createElement("button");a.className="eudia-banner-dismiss",a.textContent="\xD7",a.onclick=()=>{e.remove(),this._updateBannerEl=null},e.appendChild(a),document.body.appendChild(e),this._updateBannerEl=e}_removeUpdateBanner(){this._updateBannerEl&&(this._updateBannerEl.remove(),this._updateBannerEl=null)}async checkForPluginUpdate(){if(this._updateInProgress){console.log("[Eudia Update] Skipping \u2014 update already in progress");return}let t=this.settings.lastUpdateTimestamp?Date.now()-new Date(this.settings.lastUpdateTimestamp).getTime():1/0;if(t<O.UPDATE_COOLDOWN_MS){console.log(`[Eudia Update] Skipping \u2014 updated ${Math.round(t/1e3)}s ago (cooldown: ${O.UPDATE_COOLDOWN_MS/1e3}s)`);return}let e=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=this.manifest?.version||"0.0.0";for(let a=0;a<=O.MAX_UPDATE_RETRIES;a++)try{if(a>0){let d=O.UPDATE_RETRY_DELAYS[a-1]||9e4;console.log(`[Eudia Update] Retry ${a}/${O.MAX_UPDATE_RETRIES} in ${d/1e3}s...`),await new Promise(u=>setTimeout(u,d))}let i=await(0,p.requestUrl)({url:`${e}/api/plugin/version`,method:"GET",headers:{"Content-Type":"application/json"}});if(!i.json?.success||!i.json?.currentVersion){console.log("[Eudia Update] Version endpoint returned unexpected data:",i.json);continue}let s=i.json.currentVersion,o=s.split(".").map(Number),l=n.split(".").map(Number),c=!1;for(let d=0;d<3;d++){if((o[d]||0)>(l[d]||0)){c=!0;break}if((o[d]||0)<(l[d]||0))break}!c&&i.json.forceUpdate&&s!==n&&(c=!0,console.log(`[Eudia Update] Server flagged forceUpdate for v${s}`)),c?(console.log(`[Eudia Update] v${s} available (current: v${n})`),await this.performAutoUpdate(e,s,n)):console.log(`[Eudia Update] Up to date (v${n})`);return}catch(i){console.log(`[Eudia Update] Check failed (attempt ${a+1}):`,i.message||i)}console.log("[Eudia Update] All retry attempts exhausted \u2014 will try again on next cycle")}async sendPeriodicHeartbeat(){if(!(!this.settings.userEmail||!this.telemetry))try{let t=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),e=0;t&&t instanceof p.TFolder&&(e=t.children.filter(a=>a instanceof p.TFolder&&!a.name.startsWith("_")).length);let n={salesforce:this.settings.salesforceConnected?"connected":"not_configured",calendar:this.settings.calendarConfigured?"connected":"not_configured"};await this.telemetry.sendHeartbeat(e,n),console.log(`[Eudia] Periodic heartbeat sent (${e} accounts)`)}catch{}}async pollVaultOperations(){if(!(!this.settings.deviceId||!this.settings.userEmail))try{let t=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=(await(0,p.requestUrl)({url:`${t}/api/plugin/operations?deviceId=${this.settings.deviceId}&email=${encodeURIComponent(this.settings.userEmail)}`,method:"GET",headers:{"Content-Type":"application/json"}})).json?.operations;if(!n||n.length===0)return;console.log(`[Eudia Ops] Received ${n.length} vault operation(s)`);for(let a of n)await this.executeVaultOperation(a)}catch{}}async executeVaultOperation(t){let e=this.settings.serverUrl||"https://gtm-wizard.onrender.com";try{switch(console.log(`[Eudia Ops] Executing: ${t.operation_type} (id: ${t.id})`),t.operation_type){case"create_file":{let n=this.app.vault.getAbstractFileByPath(t.data.path);if(n&&!t.data.overwrite){console.log(`[Eudia Ops] File exists, skipping: ${t.data.path}`);break}let a=t.data.path.split("/").slice(0,-1).join("/");if(a)try{await this.app.vault.createFolder(a)}catch{}n?await this.app.vault.modify(n,t.data.content||""):await this.app.vault.create(t.data.path,t.data.content||""),console.log(`[Eudia Ops] Created: ${t.data.path}`);break}case"modify_file":{let n=this.app.vault.getAbstractFileByPath(t.data.path);if(!n){console.log(`[Eudia Ops] File not found: ${t.data.path}`);break}if(t.data.appendContent){let a=await this.app.vault.read(n);await this.app.vault.modify(n,a+`
`+t.data.appendContent)}else t.data.content&&await this.app.vault.modify(n,t.data.content);break}case"create_folder":{try{await this.app.vault.createFolder(t.data.path)}catch{}break}case"delete_file":{let n=this.app.vault.getAbstractFileByPath(t.data.path);n&&await this.app.vault.delete(n);break}case"push_template":{let n=t.data.targetFolder||"_Templates";try{await this.app.vault.createFolder(n)}catch{}let a=`${n}/${t.data.templateName}.md`,i=this.app.vault.getAbstractFileByPath(a);i?await this.app.vault.modify(i,t.data.content||""):await this.app.vault.create(a,t.data.content||"");break}case"force_update":{await this.checkForPluginUpdate();break}case"push_config":{t.data.settings&&(Object.assign(this.settings,t.data.settings),await this.saveSettings());break}case"notify":{new p.Notice(t.data.message||"Admin notification",t.data.duration||8e3);break}default:console.log(`[Eudia Ops] Unknown operation type: ${t.operation_type}`)}try{await(0,p.requestUrl)({url:`${e}/api/plugin/operations/ack`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operationId:t.id,status:"executed",result:{success:!0}})})}catch{}}catch(n){console.error(`[Eudia Ops] Failed: ${t.operation_type}:`,n.message);try{await(0,p.requestUrl)({url:`${e}/api/plugin/operations/ack`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operationId:t.id,status:"failed",error:n.message})})}catch{}}}async sha256(t){let n=new TextEncoder().encode(t),a=await crypto.subtle.digest("SHA-256",n);return Array.from(new Uint8Array(a)).map(s=>s.toString(16).padStart(2,"0")).join("")}async ensureLightTheme(){if(!this.settings.themeFixApplied)try{let t=this.app.vault.adapter,e=".obsidian/appearance.json",n={};try{let a=await t.read(e);n=JSON.parse(a)}catch{}(n.theme==="obsidian"||!n.theme)&&(n.theme="moonstone",n.accentColor="#8e99e1",n.cssTheme="",await t.write(e,JSON.stringify(n,null,2)),console.log("[Eudia] Fixed vault theme: obsidian (dark) \u2192 moonstone (light)")),this.settings.themeFixApplied=!0,await this.saveSettings()}catch(t){console.warn("[Eudia] Theme fix failed:",t.message)}}async ensureEditableMode(){if(!this.settings.editModeFixApplied)try{let t=this.app.vault.adapter,e=".obsidian/app.json",n={};try{let i=await t.read(e);n=JSON.parse(i)}catch{}let a=!1;(!n.defaultViewMode||n.defaultViewMode==="preview")&&(n.defaultViewMode="source",a=!0),n.livePreview!==!0&&(n.livePreview=!0,a=!0),a&&(await t.write(e,JSON.stringify(n,null,2)),console.log("[Eudia] Fixed vault editing mode: enabled Live Preview (editable)")),this.settings.editModeFixApplied=!0,await this.saveSettings()}catch(t){console.warn("[Eudia] Edit mode fix failed:",t.message)}}async checkForUpdateRollback(){if(!this.settings.lastUpdateTimestamp||!this.settings.lastUpdateVersion)return;let t=Date.now()-new Date(this.settings.lastUpdateTimestamp).getTime(),e=this.manifest?.version||"0.0.0";if(e===this.settings.lastUpdateVersion){this.settings.pendingUpdateVersion=null,await this.saveSettings(),console.log(`[Eudia Update] Update to v${e} confirmed successful`);return}if(t<12e4){let n=this.manifest.dir;if(!n)return;let a=this.app.vault.adapter;try{if(await a.exists(`${n}/main.js.bak`)){let s=await a.read(`${n}/main.js.bak`);await a.write(`${n}/main.js`,s),console.log(`[Eudia Update] Rolled back to previous version (v${this.settings.lastUpdateVersion} may have failed)`),this.telemetry.reportUpdateCheck({localVersion:e,remoteVersion:this.settings.lastUpdateVersion||"unknown",updateNeeded:!1,updateResult:"failed"})}}catch(i){console.warn("[Eudia Update] Rollback check failed:",i.message)}this.settings.lastUpdateTimestamp=null,this.settings.lastUpdateVersion=null,this.settings.pendingUpdateVersion=null,await this.saveSettings()}}async performAutoUpdate(t,e,n){if(this._updateInProgress){console.log("[Eudia Update] Skipping \u2014 update already in progress");return}this._updateInProgress=!0;try{if(this.audioRecorder?.isRecording()){this.settings.pendingUpdateVersion=e,await this.saveSettings(),new p.Notice(`Eudia v${e} available \u2014 will update after your recording.`,8e3);try{this.telemetry?.reportUpdateCheck({localVersion:n,remoteVersion:e,updateNeeded:!0,updateResult:"deferred"})}catch{}return}let a=this.manifest.dir;if(!a){console.log("[Eudia Update] Cannot determine plugin directory");return}this._showUpdateStatus(`\u27F3 Updating to v${e}\u2026`);let i=this.app.vault.adapter;console.log(`[Eudia Update] Downloading v${e}...`);let[s,o,l]=await Promise.all([(0,p.requestUrl)({url:`${t}/api/plugin/main.js`}),(0,p.requestUrl)({url:`${t}/api/plugin/manifest.json`}),(0,p.requestUrl)({url:`${t}/api/plugin/styles.css`})]),c=s.text,d=o.text,u=l.text;this._showUpdateStatus(`\u27F3 Validating v${e}\u2026`);let h=[["main.js",c,1e4,5*1024*1024],["manifest.json",d,50,1e4],["styles.css",u,100,5e5]];for(let[m,g,v,C]of h)if(!g||g.length<v||g.length>C){console.log(`[Eudia Update] ${m} validation failed (${g?.length??0} bytes, need ${v}-${C})`),this._showUpdateStatus("Update failed \u2014 file validation error"),setTimeout(()=>this._hideUpdateStatus(),5e3);try{this.telemetry?.reportUpdateCheck({localVersion:n,remoteVersion:e,updateNeeded:!0,updateResult:"failed"})}catch{}return}try{let m=JSON.parse(d);if(m.version!==e){console.log(`[Eudia Update] Version mismatch: expected ${e}, got ${m.version}`),this._hideUpdateStatus();return}}catch{console.log("[Eudia Update] Downloaded manifest is not valid JSON"),this._hideUpdateStatus();return}this._showUpdateStatus(`\u27F3 Installing v${e}\u2026`);try{let m=await i.read(`${a}/main.js`);await i.write(`${a}/main.js.bak`,m)}catch{}try{let m=await i.read(`${a}/styles.css`);await i.write(`${a}/styles.css.bak`,m)}catch{}await i.write(`${a}/main.js`,c),await i.write(`${a}/manifest.json`,d),await i.write(`${a}/styles.css`,u),console.log(`[Eudia Update] Files written: v${n} \u2192 v${e}`),this.settings.lastUpdateVersion=e,this.settings.lastUpdateTimestamp=new Date().toISOString(),this.settings.pendingUpdateVersion=null,await this.saveSettings();try{this.telemetry?.reportUpdateCheck({localVersion:n,remoteVersion:e,updateNeeded:!0,updateResult:"success"})}catch{}if(this.audioRecorder?.isRecording())this._showUpdateStatus(`\u2713 v${e} downloaded \u2014 restart to apply`),this.settings.pendingReloadVersion=e,await this.saveSettings(),setTimeout(()=>this._hideUpdateStatus(),1e4);else{this._showUpdateStatus(`\u2713 v${e} installed \u2014 reloading\u2026`),new p.Notice(`Eudia Lite v${e} installed. Reloading in 3 seconds.`,5e3),console.log(`[Eudia Update] Files written: v${n} \u2192 v${e}. Reloading page.`),setTimeout(()=>{window.location.reload()},3e3);return}}catch(a){console.log("[Eudia Update] Update failed:",a.message||a),this._showUpdateStatus("Update failed"),setTimeout(()=>this._hideUpdateStatus(),5e3);try{this.telemetry?.reportUpdateCheck({localVersion:n,remoteVersion:e,updateNeeded:!0,updateResult:"failed"})}catch{}}finally{this._hotReloadPending||(this._updateInProgress=!1)}}resolveRecordingForNote(t,e,n){let a=e.match(/recording_path:\s*"?([^"\n]+)"?/);if(a){let c=this.app.vault.getAbstractFileByPath(a[1].trim());if(c&&c instanceof p.TFile)return c}let i=e.match(/saved to \*\*([^*]+)\*\*/);if(i){let c=this.app.vault.getAbstractFileByPath(i[1]);if(c&&c instanceof p.TFile)return c}let s=t.stat?.mtime||0,o=null,l=1/0;for(let c of n){if(!c.timestamp)continue;let d=Math.abs(s-c.timestamp.getTime());d<30*60*1e3&&d<l&&(l=d,o=c.file)}return o}async healSingleNote(t,e,n){let a=await this.app.vault.readBinary(n),i=n.extension==="mp4"||n.extension==="m4a"?"audio/mp4":"audio/webm",s=new Blob([a],{type:i}),o={},l=t.path.split("/"),c=this.settings.accountsFolder||"Accounts";l[0]===c&&l.length>=2&&(o.accountName=l[1]);let d=l[0]==="Pipeline Meetings"||/meeting_type:\s*pipeline_review/.test(e),u=await this.transcriptionService.transcribeAudio(s,{...o,captureMode:"full_call",meetingTemplate:this.settings.meetingTemplate||"meddic",meetingType:d?"pipeline_review":void 0}),h=S=>S?!!(S.summary?.trim()||S.nextSteps?.trim()):!1,m=u.sections;if(!h(m)&&u.text?.trim()&&(m=await this.transcriptionService.processTranscription(u.text,o)),!h(m)&&!u.text?.trim())return!1;let g=e.replace(/\n\n---\n\*\*Processing your recording\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,"").replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,"").replace(/\n\n\*\*Transcription failed:\*\*[^\n]*(\nYour recording was saved to[^\n]*)?\n/g,"").trim(),v;d?v=this.buildPipelineNoteContent(m,u,t.path):v=this.buildNoteContent(m,u);let C=g.indexOf("---",g.indexOf("---")+3);if(C>0){let S=g.substring(0,C+3);await this.app.vault.modify(t,S+`

`+v)}else await this.app.vault.modify(t,v);return!0}collectRecordingFiles(){let t=i=>i.children.filter(s=>s instanceof p.TFile&&/\.(webm|mp4|m4a|ogg)$/i.test(s.name)).map(s=>{let o=s.name.match(/recording-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/),l=o?new Date(`${o[1]}-${o[2]}-${o[3]}T${o[4]}:${o[5]}:${o[6]}Z`):null;return{file:s,timestamp:l}}).filter(s=>s.timestamp!==null),e=[],n=this.app.vault.getAbstractFileByPath(this.settings.recordingsFolder||"Recordings");n&&n instanceof p.TFolder&&e.push(...t(n));let a=this.app.vault.getAbstractFileByPath("_backups");return a&&a instanceof p.TFolder&&e.push(...t(a)),e.sort((i,s)=>s.timestamp.getTime()-i.timestamp.getTime()),e}async healFailedTranscriptions(){if(!this.audioRecorder?.isRecording())try{await this.processHealQueue();let t=this.app.vault.getMarkdownFiles(),e=[];for(let i of t)try{let s=await this.app.vault.read(i);s.includes("**Transcription failed:**")&&e.push({file:i,content:s})}catch{}if(e.length===0)return;console.log(`[Eudia AutoHeal] Found ${e.length} note(s) with failed transcriptions`);let n=this.collectRecordingFiles();if(n.length===0){console.log("[Eudia AutoHeal] No recordings found in Recordings or _backups");return}let a=0;for(let{file:i,content:s}of e)try{if(!s.includes("**Transcription failed:**")&&(s.includes("## Summary")||s.includes(`## Next Steps
-`)))continue;let l=this.resolveRecordingForNote(i,s,n);if(!l){console.log(`[Eudia AutoHeal] No matching recording for "${i.path}"`);continue}if(console.log(`[Eudia AutoHeal] Healing "${i.path}" with recording "${l.path}"`),!await this.healSingleNote(i,s,l)){console.log(`[Eudia AutoHeal] Re-transcription returned no content for "${i.path}" \u2014 adding to heal queue`),this.addToHealQueue(i.path,l.path,"Re-transcription returned no content");continue}this.removeFromHealQueue(i.path),a++,console.log(`[Eudia AutoHeal] Successfully healed "${i.path}"`)}catch(o){let l=o.message;console.error(`[Eudia AutoHeal] Failed to heal "${i.path}":`,l);let c=this.resolveRecordingForNote(i,s,n);c&&this.addToHealQueue(i.path,c.path,l)}this.telemetry.reportAutoHealScan({totalNotes:t.length,failedNotes:e.length,recordings:n.length,healed:a,failed:e.length-a,queueSize:this.settings.healQueue.length}),a>0&&(console.log(`[Eudia AutoHeal] Healed ${a}/${e.length} failed transcription(s)`),new p.Notice(`Recovered ${a} previously failed transcription${a>1?"s":""}.`,8e3))}catch(t){console.error("[Eudia AutoHeal] Error:",t.message)}}static{this.HEAL_BACKOFF_MS=[6e4,3e5,18e5,72e5,288e5]}addToHealQueue(t,e,n){let a=this.settings.healQueue.find(i=>i.notePath===t);a?(a.attemptCount++,a.lastAttempt=new Date().toISOString(),a.error=n):this.settings.healQueue.push({notePath:t,recordingPath:e,attemptCount:1,lastAttempt:new Date().toISOString(),error:n}),this.saveSettings()}removeFromHealQueue(t){this.settings.healQueue=this.settings.healQueue.filter(e=>e.notePath!==t),this.saveSettings()}async processHealQueue(){if(this.settings.healQueue.length===0)return;let t=Date.now(),e=0;for(let n of[...this.settings.healQueue]){let a=Math.min(n.attemptCount-1,O.HEAL_BACKOFF_MS.length-1),i=O.HEAL_BACKOFF_MS[a],s=new Date(n.lastAttempt).getTime();if(t-s<i)continue;let o=this.app.vault.getAbstractFileByPath(n.notePath),l=this.app.vault.getAbstractFileByPath(n.recordingPath);if(!o||!(o instanceof p.TFile)){this.removeFromHealQueue(n.notePath);continue}if(!l||!(l instanceof p.TFile)){console.log(`[Eudia AutoHeal Queue] Recording "${n.recordingPath}" no longer exists \u2014 removing from queue`),this.removeFromHealQueue(n.notePath);continue}console.log(`[Eudia AutoHeal Queue] Retry #${n.attemptCount+1} for "${n.notePath}"`);try{let c=await this.app.vault.read(o);await this.healSingleNote(o,c,l)?(this.removeFromHealQueue(n.notePath),e++,console.log(`[Eudia AutoHeal Queue] Successfully healed "${n.notePath}" on retry #${n.attemptCount+1}`)):this.addToHealQueue(n.notePath,n.recordingPath,"Re-transcription returned no content")}catch(c){this.addToHealQueue(n.notePath,n.recordingPath,c.message),console.error(`[Eudia AutoHeal Queue] Retry failed for "${n.notePath}":`,c.message)}}e>0&&new p.Notice(`Recovered ${e} previously failed transcription${e>1?"s":""} from retry queue.`,8e3)}async retryTranscriptionForCurrentNote(){let t=this.app.workspace.getActiveFile();if(!t){new p.Notice("No active note. Open the note you want to retry.");return}let e=await this.app.vault.read(t),n=this.collectRecordingFiles(),a=this.resolveRecordingForNote(t,e,n);if(!a){new p.Notice("No matching recording found for this note. Check Recordings or _backups folder.");return}new p.Notice(`Retrying transcription using ${a.name}...`,5e3);try{await this.healSingleNote(t,e,a)?(this.removeFromHealQueue(t.path),new p.Notice("Transcription recovered successfully.",8e3)):new p.Notice("Retry produced no content. The recording may be silent or corrupted.",1e4)}catch(i){let s=i.message;new p.Notice(`Retry failed: ${s}`,1e4),this.addToHealQueue(t.path,a.path,s)}}async loadSettings(){this.settings=Object.assign({},ze,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}async activateCalendarView(){let t=this.app.workspace,e=t.getLeavesOfType(z);if(e.length>0)t.revealLeaf(e[0]);else{let n=t.getRightLeaf(!1);n&&(await n.setViewState({type:z,active:!0}),t.revealLeaf(n))}}async openLiveQuerySidebar(){try{let t=this.app.workspace,e=t.getLeavesOfType(_);if(e.length>0){t.revealLeaf(e[0]);return}let n=t.getRightLeaf(!1);n&&(await n.setViewState({type:_,active:!0}),t.revealLeaf(n))}catch(t){console.log("[Eudia] Could not open live query sidebar:",t)}}closeLiveQuerySidebar(){try{this.app.workspace.detachLeavesOfType(_)}catch{}}async activateSetupView(){let t=this.app.workspace,e=t.getLeavesOfType(B);if(e.length>0)t.revealLeaf(e[0]);else{let n=t.getLeaf(!0);n&&(await n.setViewState({type:B,active:!0}),t.revealLeaf(n))}}async createTailoredAccountFolders(t,e){let n=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);let i=0,s=new Date().toISOString().split("T")[0],o=async c=>{let d=c.name.replace(/[<>:"/\\|?*]/g,"_").trim(),u=`${n}/${d}`;if(this.app.vault.getAbstractFileByPath(u)instanceof p.TFolder)return console.log(`[Eudia] Account folder already exists: ${d}`),!1;try{await this.app.vault.createFolder(u);let m=e?.[c.id],g=!!m,v=this.buildContactsContent(c,m,s),C=this.buildIntelligenceContent(c,m,s),S=this.buildMeetingNotesContent(c,m),b=this.buildNextStepsContent(c,m,s),f=[{name:"Note 1.md",content:`---
account: "${c.name}"
account_id: "${c.id}"
type: meeting_note
sync_to_salesforce: false
created: ${s}
---

# ${c.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 2.md",content:`---
account: "${c.name}"
account_id: "${c.id}"
type: meeting_note
sync_to_salesforce: false
created: ${s}
---

# ${c.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Note 3.md",content:`---
account: "${c.name}"
account_id: "${c.id}"
type: meeting_note
sync_to_salesforce: false
created: ${s}
---

# ${c.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`},{name:"Meeting Notes.md",content:S},{name:"Contacts.md",content:v},{name:"Intelligence.md",content:C},{name:"Next Steps.md",content:b}];for(let w of f){let A=`${u}/${w.name}`;await this.app.vault.create(A,w.content)}return console.log(`[Eudia] Created account folder with subnotes${g?" (enriched)":""}: ${d}`),!0}catch(m){return console.error(`[Eudia] Failed to create folder for ${d}:`,m),!1}},l=5;for(let c=0;c<t.length;c+=l){let d=t.slice(c,c+l),u=await Promise.allSettled(d.map(h=>o(h)));i+=u.filter(h=>h.status==="fulfilled"&&h.value===!0).length}i>0?(this.settings.cachedAccounts=t.map(c=>({id:c.id,name:c.name})),await this.saveSettings(),new p.Notice(`Created ${i} account folders`)):console.warn(`[Eudia] createTailoredAccountFolders: 0 folders created out of ${t.length} accounts \u2014 not updating cachedAccounts`),await this.ensureNextStepsFolderExists()}buildContactsContent(t,e,n){let a=e?`
enriched_at: "${new Date().toISOString()}"`:"",i=`---
account: "${t.name}"
account_id: "${t.id}"
type: contacts
sync_to_salesforce: false${a}
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
`}buildIntelligenceContent(t,e,n){let a=e?`
enriched_at: "${new Date().toISOString()}"`:"",i=`---
account: "${t.name}"
account_id: "${t.id}"
type: intelligence
sync_to_salesforce: false${a}
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
enriched_at: "${new Date().toISOString()}"`:"",a=`---
account: "${t.name}"
account_id: "${t.id}"
type: meetings_index
sync_to_salesforce: false${n}
---`,i=[];return e?.opportunities&&i.push(e.opportunities),e?.recentActivity&&i.push(e.recentActivity),i.length>0?`${a}

# ${t.name} - Meeting Notes

${i.join(`

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
`}buildNextStepsContent(t,e,n){let a=n||new Date().toISOString().split("T")[0],i=e?`
enriched_at: "${new Date().toISOString()}"`:"",s=`---
account: "${t.name}"
account_id: "${t.id}"
type: next_steps
auto_updated: true
last_updated: ${a}
sync_to_salesforce: false${i}
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
`}async fetchEnrichmentData(t){let e=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=t.filter(s=>s.id&&s.id.startsWith("001"));if(n.length===0)return{};let a={},i=20;console.log(`[Eudia Enrich] Fetching enrichment data for ${n.length} accounts`);for(let s=0;s<n.length;s+=i){let l=n.slice(s,s+i).map(c=>c.id);try{let c=await(0,p.requestUrl)({url:`${e}/api/accounts/enrich-batch`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountIds:l,userEmail:this.settings.userEmail})});c.json?.success&&c.json?.enrichments&&Object.assign(a,c.json.enrichments)}catch(c){console.error(`[Eudia Enrich] Batch fetch failed (batch ${s/i+1}):`,c)}s+i<n.length&&await new Promise(c=>setTimeout(c,100))}return console.log(`[Eudia Enrich] Got enrichment data for ${Object.keys(a).length}/${n.length} accounts`),a}async createProspectAccountFiles(t){if(!t||t.length===0)return 0;let e=this.settings.accountsFolder||"Accounts";if(!this.app.vault.getAbstractFileByPath(e))try{await this.app.vault.createFolder(e)}catch{}let a=0;for(let i of t){let s=i.name.replace(/[<>:"/\\|?*]/g,"_").trim(),o=`${e}/${s}`;if(this.app.vault.getAbstractFileByPath(o)instanceof p.TFolder)continue;let c=`${e}/_Prospects/${s}.md`,d=this.app.vault.getAbstractFileByPath(c);if(d instanceof p.TFile)try{await this.app.vault.delete(d)}catch{}try{await this.app.vault.createFolder(o);let u=new Date().toISOString().split("T")[0],h=[{name:"Note 1.md",content:`---
account: "${i.name}"
account_id: "${i.id}"
type: meeting_note
tier: prospect
sync_to_salesforce: false
created: ${u}
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
created: ${u}
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
created: ${u}
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
last_updated: ${u}
sync_to_salesforce: false
---

# ${i.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}];for(let m of h){let g=`${o}/${m.name}`;await this.app.vault.create(g,m.content)}a++}catch(u){console.log(`[Eudia] Failed to create prospect folder for ${i.name}:`,u)}}if(a>0){console.log(`[Eudia] Created ${a} prospect account folders in Accounts/`);let i=new Set((this.settings.cachedAccounts||[]).map(s=>s.id));for(let s of t)s.id&&!i.has(s.id)&&this.settings.cachedAccounts.push({id:s.id,name:s.name});await this.saveSettings()}return a}async migrateAccountStructure(){if(this._migrationInProgress)return;this._migrationInProgress=!0;let t=this.app.workspace.leftSplit,e=t?.collapsed;t&&!e&&t.collapse(),new p.Notice("Organizing your account folders\u2026",8e3);try{let n=this.settings.accountsFolder||"Accounts",a=`${n}/_Prospects`,i=this.app.vault.getAbstractFileByPath(a);if(i instanceof p.TFolder){let l=[...i.children],c=0;for(let u of l){if(!(u instanceof p.TFolder))continue;let h=`${n}/${u.name}`;if(this.app.vault.getAbstractFileByPath(h)instanceof p.TFolder){let g=[...u.children];for(let v of g){let C=`${h}/${v.name}`;if(!this.app.vault.getAbstractFileByPath(C))try{await this.app.fileManager.renameFile(v,C)}catch{}}try{await this.app.vault.delete(u,!0)}catch{}}else try{await this.app.fileManager.renameFile(u,h),c++}catch(g){console.warn(`[Eudia Migration] Failed to move ${u.name}:`,g)}}let d=this.app.vault.getAbstractFileByPath(a);if(d instanceof p.TFolder&&d.children.length===0)try{await this.app.vault.delete(d,!0)}catch{}c>0&&console.log(`[Eudia Migration] Moved ${c} prospect folders to Accounts/`)}let s=this.settings.userEmail;if(s&&!M(s)&&!H(s))try{let c=await new L(this.settings.serverUrl).getAccountsWithProspects(s),d=new Set([...c.accounts,...c.prospects].map(h=>h.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase())),u=this.app.vault.getAbstractFileByPath(n);if(u instanceof p.TFolder){let h=`${n}/_Other_Accounts`,m=0;for(let g of[...u.children]){if(!(g instanceof p.TFolder)||g.name.startsWith("_")||g.name.startsWith(".")||d.has(g.name.toLowerCase()))continue;if(!this.app.vault.getAbstractFileByPath(h))try{await this.app.vault.createFolder(h)}catch{}let v=`${h}/${g.name}`;if(!this.app.vault.getAbstractFileByPath(v))try{await this.app.fileManager.renameFile(g,v),m++}catch{}}m>0&&console.log(`[Eudia Migration] Archived ${m} non-owned accounts to _Other_Accounts/`)}this.settings.cachedAccounts=[...c.accounts,...c.prospects].map(h=>({id:h.id,name:h.name}))}catch(l){console.warn("[Eudia Migration] Could not fetch ownership \u2014 skipping archive step:",l)}let o=this.app.vault.getAbstractFileByPath(n);if(o instanceof p.TFolder){let l=new Set(o.children.filter(d=>d instanceof p.TFolder&&!d.name.startsWith("_")&&!d.name.startsWith(".")).map(d=>d.name.toLowerCase())),c=this.settings.cachedAccounts.length;this.settings.cachedAccounts=this.settings.cachedAccounts.filter(d=>{let u=d.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();return l.has(u)}),c!==this.settings.cachedAccounts.length&&console.log(`[Eudia Migration] Pruned cachedAccounts: ${c} \u2192 ${this.settings.cachedAccounts.length}`)}this.settings.prospectsMigrated=!0,await this.saveSettings(),console.log("[Eudia Migration] Account structure migration complete")}finally{t&&!e&&t.expand(),this._migrationInProgress=!1}}async createCSManagerDashboard(t,e){let n="CS Manager",a=new Date().toISOString().split("T")[0],i=fe(t);if(!this.app.vault.getAbstractFileByPath(n))try{await this.app.vault.createFolder(n)}catch{}let s={};for(let u of e){let h=u.ownerName||"Unassigned";s[h]||(s[h]=[]),s[h].push(u)}let o=`---
role: cs_manager
manager: "${t}"
direct_reports: ${i.length}
total_accounts: ${e.length}
created: ${a}
auto_refresh: true
---

# CS Manager Overview

**Manager:** ${t}
**Direct Reports:** ${i.join(", ")||"None configured"}
**Total CS Accounts:** ${e.length}
**Last Refreshed:** ${a}

---

## Account Distribution by Sales Rep

`,l=Object.keys(s).sort();for(let u of l){let h=s[u];o+=`### ${u} (${h.length} accounts)
`;for(let m of h.slice(0,10))o+=`- **${m.name}** \u2014 ${m.type||"Account"}
`;h.length>10&&(o+=`- _...and ${h.length-10} more_
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
1. **Rep records a meeting** in Eudia Notetaker and clicks "Sync to Salesforce"
2. **Notes sync to Salesforce** \`Customer_Brain__c\` field on the Account
3. **Your Notetaker refreshes** \u2014 account Intelligence and Meeting Notes sub-notes pull the latest activity from Salesforce each time Eudia opens or you click "Connect to Salesforce" in Setup

> To see the latest notes from Jon and Farah, ensure they are syncing their meeting notes to Salesforce. Eudia Notetaker will automatically pull their activity on the next enrichment cycle.

---

*This dashboard auto-updates when Eudia syncs. New Stage 4/5 and Existing accounts will appear automatically.*
`;let c=`${n}/CS Manager Overview.md`,d=this.app.vault.getAbstractFileByPath(c);d instanceof p.TFile?await this.app.vault.modify(d,o):await this.app.vault.create(c,o);for(let u of i){let h=u.split("@")[0].replace("."," ").replace(/\b\w/g,y=>y.toUpperCase()),m=u.split("@")[0].replace("."," ").toLowerCase(),g=m.split(" ")[0],v=m.split(" ").pop()||"",C=e.filter(y=>{let w=(y.csmName||"").toLowerCase();if(w&&(w.includes(g)||w.includes(v)))return!0;let A=(y.ownerName||"").toLowerCase();return A.includes(g)||A.includes(v)}),S=`---
rep: "${u}"
rep_name: "${h}"
role: cs_rep_summary
account_count: ${C.length}
created: ${a}
---

# ${h} \u2014 CS Account Summary

**Email:** ${u}
**CS Accounts:** ${C.length}

---

## Assigned Accounts

`;if(C.length>0){S+=`| Account | Type | Owner | Folder |
|---------|------|-------|--------|
`;for(let y of C){let w=y.name.replace(/[<>:"/\\|?*]/g,"_").trim();S+=`| ${y.name} | ${y.type||""} | ${y.ownerName||""} | [[Accounts/${w}/Contacts\\|View]] |
`}}else S+=`*No accounts currently matched to this rep. Accounts will populate after connecting to Salesforce (Step 2).*
`;S+=`
---

## Recent Activity

Meeting notes and activity for ${h}'s accounts sync through Salesforce:
- Notes appear in each account's **Meeting Notes** and **Intelligence** sub-notes
- Activity updates when Eudia enriches (on open or Salesforce connect)
- Ensure ${h} is syncing their meeting notes to Salesforce for latest data

---

*Updates automatically as new CS-relevant accounts sync.*
`;let b=`${n}/${h}.md`,f=this.app.vault.getAbstractFileByPath(b);f instanceof p.TFile?await this.app.vault.modify(f,S):await this.app.vault.create(b,S)}console.log(`[Eudia] Created CS Manager dashboard for ${t} with ${e.length} accounts across ${l.length} reps`)}async createAdminAccountFolders(t){let e=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e),await this.ensurePipelineFolderExists();let a=0,i=0,s=new Date().toISOString().split("T")[0],o=async c=>{let d=c.name.replace(/[<>:"/\\|?*]/g,"_").trim(),u=`${e}/${d}`;if(this.app.vault.getAbstractFileByPath(u)instanceof p.TFolder)return!1;try{return await this.app.vault.createFolder(u),await this.createExecAccountSubnotes(u,c,s),c.isOwned?a++:i++,console.log(`[Eudia Admin] Created ${c.isOwned?"owned":"view-only"} folder: ${d}`),!0}catch(m){return console.error(`[Eudia Admin] Failed to create folder for ${d}:`,m),!1}},l=5;for(let c=0;c<t.length;c+=l){let d=t.slice(c,c+l);await Promise.allSettled(d.map(u=>o(u)))}this.settings.cachedAccounts=t.map(c=>({id:c.id,name:c.name})),await this.saveSettings(),a+i>0&&new p.Notice(`Created ${a} owned + ${i} view-only account folders`),await this.ensureNextStepsFolderExists()}async createExecAccountSubnotes(t,e,n){let a=e.ownerName||"Unknown",i=[{name:"Note 1.md",content:`---
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
`}];for(let s of i){let o=`${t}/${s.name}`;await this.app.vault.create(o,s.content)}}async createFullAccountSubnotes(t,e,n){let a=[{name:"Note 1.md",content:`---
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
`}];for(let i of a){let s=`${t}/${i.name}`;await this.app.vault.create(s,i.content)}}async ensurePipelineFolderExists(){let t="Pipeline",e=`${t}/Pipeline Review Notes.md`;if(this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t),!this.app.vault.getAbstractFileByPath(e)){let s=`---
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
`;await this.app.vault.create(e,s)}}async ensureNextStepsFolderExists(){let t="Next Steps",e=`${t}/All Next Steps.md`;if(this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t),!this.app.vault.getAbstractFileByPath(e)){let i=new Date().toISOString().split("T")[0],s=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${i}
---

# All Next Steps Dashboard

*Last updated: ${i} ${s}*

---

## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;await this.app.vault.create(e,o)}}async updateAccountNextSteps(t,e,n){try{console.log(`[Eudia] updateAccountNextSteps called for: ${t}`),console.log(`[Eudia] Content length: ${e?.length||0} chars`);let a=t.replace(/[<>:"/\\|?*]/g,"_").trim(),i=`${this.settings.accountsFolder}/${a}/Next Steps.md`;console.log(`[Eudia] Looking for Next Steps file at: ${i}`);let s=this.app.vault.getAbstractFileByPath(i);if(!s||!(s instanceof p.TFile)){console.log(`[Eudia] \u274C Next Steps file NOT FOUND at: ${i}`);let S=this.app.vault.getAbstractFileByPath(`${this.settings.accountsFolder}/${a}`);S&&S instanceof p.TFolder?console.log(`[Eudia] Files in ${a} folder:`,S.children.map(b=>b.name)):console.log(`[Eudia] Account folder also not found: ${this.settings.accountsFolder}/${a}`);return}console.log("[Eudia] Found Next Steps file, updating...");let o=new Date().toISOString().split("T")[0],l=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),c=n.split("/").pop()?.replace(".md","")||"Meeting",d=e;!e.includes("- [ ]")&&!e.includes("- [x]")&&(d=e.split(`
`).filter(S=>S.trim()).map(S=>{let b=S.replace(/^[-•*]\s*/,"").trim();return b?`- [ ] ${b}`:""}).filter(Boolean).join(`
`));let u=await this.app.vault.read(s),h="",m=u.match(/## History\n\n\*Previous next steps are archived below\.\*\n\n([\s\S]*?)$/);m&&m[1]&&(h=m[1].trim());let g=`### ${o} - ${c}
${d||"*None*"}`,v=h?`${g}

---

${h}`:g,C=`---
account: "${t}"
account_id: "${this.settings.cachedAccounts.find(S=>S.name===t)?.id||""}"
type: next_steps
auto_updated: true
last_updated: ${o}
sync_to_salesforce: false
---

# ${t} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*Last updated: ${o} ${l} from ${c}*

${d||"*No next steps identified*"}

---

## History

*Previous next steps are archived below.*

${v}
`;await this.app.vault.modify(s,C),console.log(`[Eudia] Updated Next Steps for ${t} (history preserved)`),await this.regenerateNextStepsDashboard()}catch(a){console.error(`[Eudia] Failed to update Next Steps for ${t}:`,a)}}async regenerateNextStepsDashboard(){try{let e=this.app.vault.getAbstractFileByPath("Next Steps/All Next Steps.md");if(!e||!(e instanceof p.TFile)){await this.ensureNextStepsFolderExists();return}let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!n||!(n instanceof p.TFolder))return;let a=[];for(let l of n.children)if(l instanceof p.TFolder){let c=`${l.path}/Next Steps.md`,d=this.app.vault.getAbstractFileByPath(c);if(d instanceof p.TFile){let u=await this.app.vault.read(d),h=u.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/),m=h?h[1]:"Unknown",g=u.split(`
`).filter(v=>v.match(/^- \[[ x]\]/)).slice(0,5);(g.length>0||m!=="Unknown")&&a.push({account:l.name,lastUpdated:m,nextSteps:g})}}a.sort((l,c)=>c.lastUpdated.localeCompare(l.lastUpdated));let i=new Date().toISOString().split("T")[0],s=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${i}
---

# All Next Steps Dashboard

*Last updated: ${i} ${s}*

---

`;if(a.length===0)o+=`## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;else{for(let l of a)o+=`## ${l.account}

`,l.nextSteps.length>0?o+=l.nextSteps.join(`
`)+`
`:o+=`*No current next steps*
`,o+=`
*Updated: ${l.lastUpdated}*

---

`;o+=`## Summary

`,o+=`| Account | Last Updated | Open Items |
`,o+=`|---------|--------------|------------|
`;for(let l of a){let c=l.nextSteps.filter(d=>d.includes("- [ ]")).length;o+=`| ${l.account} | ${l.lastUpdated} | ${c} |
`}}await this.app.vault.modify(e,o),console.log("[Eudia] Regenerated All Next Steps dashboard")}catch(t){console.error("[Eudia] Failed to regenerate Next Steps dashboard:",t)}}async startRecording(){if(!I.isSupported()){new p.Notice("Audio transcription is not supported in this environment.");return}let t=await this.showTemplatePicker();if(!t)return;this.settings.meetingTemplate=t;try{(await navigator.mediaDevices.getUserMedia({audio:!0})).getTracks().forEach(s=>s.stop())}catch(i){this.showPermissionGuide(i);return}let e=this.settings.audioCaptureMode||"full_call",n=null;try{let s=(await I.getAvailableDevices()).find(o=>I.isHeadphoneDevice(o.label));s&&(n=s.label,console.log(`[Eudia] Headphones detected (${n}) \u2014 will still attempt system audio capture`),new p.Notice(`${n} detected \u2014 attempting full call capture...`,4e3))}catch{}if(!this.settings.audioSystemDeviceId)try{let i=await I.detectVirtualAudioDevice();i&&(this.settings.audioSystemDeviceId=i.deviceId,await this.saveSettings(),console.log(`[Eudia] Virtual audio device found: ${i.label}`))}catch{}let a=this.app.workspace.getActiveFile();if(a||(await this.createMeetingNote(),a=this.app.workspace.getActiveFile()),!a){new p.Notice("Please open or create a note first");return}await this.applyRecordingTemplate(a,t),this.audioRecorder=new I,this.recordingStatusBar=new ae(()=>this.audioRecorder?.pause(),()=>this.audioRecorder?.resume(),()=>this.stopRecording(),()=>this.cancelRecording());try{this.audioRecorder.onEvent(c=>{switch(c.type){case"deviceChanged":c.activeDeviceLost?new p.Notice("Recording device disconnected. Recording continues on available mic.",8e3):new p.Notice("Audio device changed. Recording continues.",4e3),console.log("[Eudia Telemetry] device_change",c);break;case"headphoneDetected":console.log("[Eudia Telemetry] headphone_detected",c.deviceLabel);break;case"silenceDetected":{let d=this.settings.audioCaptureMode||"full_call",u="Check that your microphone is working.";d==="full_call"&&(u="Ensure your call audio is playing through speakers, not headphones."),new p.Notice(`No audio detected for ${c.durationSeconds}s. ${u}`,1e4),console.log("[Eudia Telemetry] silence_detected",c.durationSeconds);break}case"audioRestored":new p.Notice("Audio signal restored.",3e3),console.log("[Eudia Telemetry] audio_restored");break}});let i=e,s={captureMode:i,micDeviceId:this.settings.audioMicDeviceId||void 0,systemAudioDeviceId:this.settings.audioSystemDeviceId||void 0};if(await this.audioRecorder.start(s),console.log("[Eudia Telemetry] recording_start",{captureMode:i,systemAudio:this.audioRecorder.getSystemAudioMethod()}),this.telemetry.reportRecordingStart({captureMode:i,systemAudioMethod:this.audioRecorder.getSystemAudioMethod(),hasMicPermission:!0}),i==="full_call"&&this.audioRecorder.getState().isRecording){let c=this.audioRecorder.getSystemAudioMethod();if(c==="electron"||c==="display_media"||c==="virtual_device"){let d=c==="virtual_device"?" (Virtual Device)":"";new p.Notice(`Recording \u2014 capturing both sides of the call${d}.`,5e3)}else{let d=n?`System audio capture unavailable with ${n}.
Recording your voice only. Switch to laptop speakers for both sides.`:`Recording (Mic only) \u2014 system audio capture unavailable.
Use laptop speakers, or try Settings > Audio Capture > Test System Audio.`;new p.Notice(d,1e4)}}else i==="mic_only"&&new p.Notice("Recording (Mic Only \u2014 your voice only)",3e3);this.recordingStatusBar.show(),this.micRibbonIcon?.addClass("eudia-ribbon-recording");try{let c=await this.calendarService.getCurrentMeeting();if(c.isNow&&c.meeting?.end){let d=new Date(c.meeting.end),u=new Date,h=d.getTime()-u.getTime();if(h>6e4&&h<54e5){let m=Math.round(h/6e4);new p.Notice(`Recording aligned to meeting (~${m} min remaining)`,5e3);let g=this;setTimeout(()=>{if(!g.audioRecorder?.isRecording())return;let v=null,C=new class extends p.Modal{constructor(){super(...arguments);this.dismissed=!1}onOpen(){let{contentEl:b}=this;b.createEl("h2",{text:"Meeting ended"}),b.createEl("p",{text:"Your calendar meeting has ended. Recording will auto-stop in 5 minutes."}),b.createEl("p",{text:"Need more time? Keep recording to continue.",cls:"setting-item-description"});let f=b.createDiv({cls:"modal-button-container"});f.createEl("button",{text:"Keep Recording",cls:"mod-cta"}).onclick=()=>{this.dismissed=!0,this.close()},f.createEl("button",{text:"Stop Now"}).onclick=()=>{this.close()}}onClose(){this.dismissed?(v&&clearTimeout(v),new p.Notice("Recording will continue. Stop manually when done.",4e3)):(v&&clearTimeout(v),g.audioRecorder?.isRecording()&&(new p.Notice("Generating summary\u2026"),g.stopRecording()))}}(this.app);C.open(),v=setTimeout(()=>{!C.dismissed&&g.audioRecorder?.isRecording()&&C.close()},5*60*1e3)},h)}}}catch(c){console.log("[Eudia] Could not detect meeting duration for auto-stop:",c)}let o=!1,l=setInterval(()=>{if(this.audioRecorder?.isRecording()){let c=this.audioRecorder.getState();if(this.recordingStatusBar?.updateState(c),c.duration>=2700&&!o){o=!0;let d=new class extends p.Modal{constructor(){super(...arguments);this.result=!0}onOpen(){let{contentEl:m}=this;m.createEl("h2",{text:"Still recording?"}),m.createEl("p",{text:"You have been recording for 45 minutes. Are you still in this meeting?"}),m.createEl("p",{text:"Recording will auto-stop at 90 minutes.",cls:"mod-warning"});let g=m.createDiv({cls:"modal-button-container"});g.createEl("button",{text:"Keep Recording",cls:"mod-cta"}).onclick=()=>{this.close()},g.createEl("button",{text:"Stop Recording"}).onclick=()=>{this.result=!1,this.close()}}onClose(){this.result||u.stopRecording()}}(this.app),u=this;d.open()}c.duration>=5400&&(new p.Notice("Recording stopped \u2014 maximum 90 minutes reached."),this.stopRecording(),clearInterval(l))}else clearInterval(l)},100);this.liveTranscript=""}catch(i){this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null;let s=i.message||"Failed to start recording";console.error("[Eudia Telemetry] recording_start_error",s),s.includes("Permission")||s.includes("NotAllowed")||s.includes("permission")?this.showPermissionGuide(i):new p.Notice(`Recording failed: ${s}`,1e4)}}showPermissionGuide(t){let e=a=>{let i=`x-apple.systempreferences:com.apple.preference.security?${a}`;try{let s=window.require?.("electron");s?.shell?.openExternal?s.shell.openExternal(i):window.open(i)}catch{window.open(i)}};new class extends p.Modal{onOpen(){this.renderInitial()}renderInitial(){let{contentEl:a}=this;a.empty(),a.createEl("h2",{text:"Microphone Access Required"}),a.createEl("p",{text:"Obsidian needs microphone permission to transcribe meetings."});let i=a.createDiv();i.style.cssText="margin:16px 0;padding:12px;background:var(--background-secondary);border-radius:8px;",i.createEl("p",{text:'1. Click "Open Microphone Settings" below'}),i.createEl("p",{text:"2. Find Obsidian in the list and toggle it ON"}),i.createEl("p",{text:'3. Click "Verify Permission" to confirm'});let s=a.createDiv({cls:"modal-button-container"});s.style.cssText="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;";let o=s.createEl("button",{text:"Open Microphone Settings",cls:"mod-cta"});o.onclick=()=>e("Privacy_Microphone");let l=s.createEl("button",{text:"Screen Recording Settings"});l.style.cssText="font-size:12px;",l.onclick=()=>e("Privacy_ScreenCapture");let c=s.createEl("button",{text:"Verify Permission"});c.onclick=async()=>{try{(await navigator.mediaDevices.getUserMedia({audio:!0})).getTracks().forEach(u=>u.stop()),new p.Notice("Microphone access confirmed!"),this.close()}catch{this.renderFailed()}},s.createEl("button",{text:"Close"}).onclick=()=>this.close()}renderFailed(){let{contentEl:a}=this;a.empty(),a.createEl("h2",{text:"Microphone Permission Not Detected"});let i=a.createDiv();i.style.cssText="margin:16px 0;padding:16px;background:var(--background-secondary);border-radius:8px;line-height:1.8;",i.createEl("p",{text:"Follow these exact steps:"}).style.fontWeight="600",i.createEl("p",{text:"1. Click the Apple menu () \u2192 System Settings"}),i.createEl("p",{text:'2. Click "Privacy & Security" in the left sidebar'}),i.createEl("p",{text:'3. Scroll down and click "Microphone"'}),i.createEl("p",{text:'4. Find "Obsidian" and toggle the switch ON'}),i.createEl("p",{text:"5. Quit and reopen Obsidian (Cmd+Q, then relaunch)"});let s=a.createDiv({cls:"modal-button-container"});s.style.cssText="display:flex;gap:8px;margin-top:16px;",s.createEl("button",{text:"Try Again",cls:"mod-cta"}).onclick=()=>this.renderInitial(),s.createEl("button",{text:"Close"}).onclick=()=>this.close()}onClose(){this.contentEl.empty()}}(this.app).open()}async stopRecording(){if(!this.audioRecorder?.isRecording())return;let t=this.app.workspace.getActiveFile();if(!t){new p.Notice("No active file to save transcription"),this.cancelRecording();return}this.recordingStatusBar?.showProcessing();try{let e=await this.audioRecorder.stop(),n={hasAudio:!0,averageLevel:0,silentPercent:0};try{let a=await I.analyzeAudioBlob(e.audioBlob);if(n=a,!a.hasAudio){let i;e.systemAudioMethod==="electron"||e.systemAudioMethod==="display_media"?i="System audio capture was active but no sound was detected. Check that the call app is playing audio.":e.captureMode==="full_call"?i="Make sure your call audio is playing through laptop speakers (not headphones).":i="Check that your microphone is working and has permission.",new p.Notice(`Recording appears silent. ${i} Open Settings > Audio Capture to test your setup.`,12e3)}}catch(a){console.warn("[Eudia] Pre-transcription audio check failed:",a)}this.telemetry.reportRecordingStop({durationSec:e.duration,blobSizeMB:Math.round(e.audioBlob.size/1024/1024*100)/100,avgAudioLevel:n.averageLevel,silentPercent:n.silentPercent,hasAudio:n.hasAudio,captureMode:e.captureMode,systemAudioMethod:e.systemAudioMethod}),await this.processRecording(e,t)}catch(e){new p.Notice(`Transcription failed: ${e.message}`)}finally{this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.closeLiveQuerySidebar(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null}}showTemplatePicker(){return new Promise(t=>{new class extends p.Modal{constructor(){super(...arguments);this.result=null}onOpen(){let{contentEl:a}=this;a.empty(),a.createEl("h3",{text:"Meeting Type"}),a.createEl("p",{text:"Select the template for this recording:",cls:"setting-item-description"});let i=a.createDiv();i.style.cssText="display:flex;flex-direction:column;gap:8px;margin-top:12px;";let s=[{key:"meddic",label:"Sales Discovery (MEDDIC)",desc:"Pain points, decision process, metrics, champions, budget signals"},{key:"demo",label:"Demo / Presentation",desc:"Feature reactions, questions, objections, interest signals"},{key:"cs",label:"Customer Success",desc:"Health signals, feature requests, adoption, renewal/expansion"},{key:"general",label:"General Check-In",desc:"Relationship updates, action items, sentiment"},{key:"internal",label:"Internal Call",desc:"Team sync, pipeline review, strategy discussion"}];for(let o of s){let l=i.createEl("button",{text:o.label});l.style.cssText="padding:10px 16px;text-align:left;cursor:pointer;border-radius:6px;border:1px solid var(--background-modifier-border);";let c=i.createEl("div",{text:o.desc});c.style.cssText="font-size:11px;color:var(--text-muted);margin-top:-4px;margin-bottom:4px;padding-left:4px;",l.onclick=()=>{this.result=o.key,this.close()}}}onClose(){t(this.result)}}(this.app).open()})}async applyRecordingTemplate(t,e){let a=(await this.app.vault.read(t)).replace(/^---[\s\S]*?---\s*/,"").trim(),i=/Add meeting notes here|^\s*#[^#].*Meeting Note/i.test(a);if(a.length>100&&!i)return;let s=new Date,o=s.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),l=s.toISOString().split("T")[0],c=t.path.split("/"),d=c.length>=2?c[c.length-2]:"",u=`---
type: meeting_note
template: ${e}
created: ${l}
sync_to_salesforce: false
---

`,h={meddic:`# Sales Discovery \u2014 ${d||"Meeting"}

**Date:** ${o}
**Attendees:** 

---

## Metrics
*What are the quantifiable business outcomes the prospect is trying to achieve?*



## Economic Buyer
*Who has the final authority to approve the purchase?*



## Decision Criteria
*What technical and business requirements must be met?*



## Decision Process
*What is the approval process and timeline?*



## Identify Pain
*What is the core problem driving this evaluation?*



## Champion
*Who is our internal advocate? How are they selling internally?*



## Next Steps

- [ ] 
`,demo:`# Demo / Presentation \u2014 ${d||"Meeting"}

**Date:** ${o}
**Attendees:** 

---

## Feature Reactions
*Which features resonated? What generated excitement?*



## Questions Asked
*Key questions from the audience*



## Objections
*Concerns, pushback, or hesitations raised*



## Interest Signals
*Buying signals, follow-up requests, next steps mentioned*



## Next Steps

- [ ] 
`,cs:`# Customer Success \u2014 ${d||"Meeting"}

**Date:** ${o}
**Attendees:** 

---

## Health Signals
*Overall satisfaction, NPS indicators, risk signals*



## Feature Requests
*Product gaps, enhancement requests, workarounds in use*



## Adoption
*Usage patterns, teams onboarded, expansion opportunities*



## Renewal / Expansion
*Contract timeline, upsell signals, budget discussions*



## Next Steps

- [ ] 
`,general:`# General Check-In \u2014 ${d||"Meeting"}

**Date:** ${o}
**Attendees:** 

---

## Discussion



## Action Items

- [ ] 

## Follow-ups

- [ ] 
`,internal:`# Internal Call

**Date:** ${o}
**Attendees:** 

---

## Agenda



## Discussion



## Decisions



## Action Items

- [ ] 
`},m=u+(h[e]||h.general);await this.app.vault.modify(t,m),console.log(`[Eudia] Applied ${e} template to ${t.path}`)}async cancelRecording(){this.audioRecorder?.isRecording()&&this.audioRecorder.cancel(),this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.closeLiveQuerySidebar(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null,new p.Notice("Transcription cancelled")}startLiveTranscription(){this.stopLiveTranscription();let t=12e4;this.liveTranscriptChunkInterval=setInterval(async()=>{await this.transcribeCurrentChunk()},t),setTimeout(async()=>{this.audioRecorder?.isRecording()&&await this.transcribeCurrentChunk()},3e4),console.log("[Eudia] Live transcription started")}stopLiveTranscription(){this.liveTranscriptChunkInterval&&(clearInterval(this.liveTranscriptChunkInterval),this.liveTranscriptChunkInterval=null),console.log("[Eudia] Live transcription stopped")}async transcribeCurrentChunk(){if(!this.audioRecorder?.isRecording()||this.isTranscribingChunk)return;let t=this.audioRecorder.extractNewChunks();if(!(!t||t.size<5e3)){this.isTranscribingChunk=!0,console.log(`[Eudia] Transcribing chunk: ${t.size} bytes`);try{let e=new FileReader,a=await new Promise((o,l)=>{e.onload=()=>{let d=e.result.split(",")[1];o(d)},e.onerror=l,e.readAsDataURL(t)}),i=this.audioRecorder.getMimeType(),s=await this.transcriptionService.transcribeChunk(a,i);s.success&&s.text&&(this.liveTranscript+=(this.liveTranscript?`

`:"")+s.text,console.log(`[Eudia] Chunk transcribed, total transcript length: ${this.liveTranscript.length}`))}catch(e){console.error("[Eudia] Chunk transcription error:",e)}finally{this.isTranscribingChunk=!1}}}openLiveQueryModal(){let t=new p.Modal(this.app);t.titleEl.setText("Query Live Transcript");let e=t.contentEl;e.addClass("eudia-live-query-modal"),e.createDiv({cls:"eudia-live-query-instructions"}).setText(`Ask a question about what has been discussed so far (${Math.round(this.liveTranscript.length/4)} words captured):`);let a=e.createEl("textarea",{cls:"eudia-live-query-input",attr:{placeholder:'e.g., "What did Tom say about pricing?" or "What were the main concerns raised?"',rows:"3"}}),i=e.createDiv({cls:"eudia-live-query-response"});i.style.display="none";let s=e.createEl("button",{text:"Ask",cls:"eudia-btn-primary"});s.addEventListener("click",async()=>{let o=a.value.trim();if(!o){new p.Notice("Please enter a question");return}s.disabled=!0,s.setText("Searching..."),i.style.display="block",i.setText("Searching transcript..."),i.addClass("eudia-loading");try{let l=await this.transcriptionService.liveQueryTranscript(o,this.liveTranscript,this.getAccountNameFromActiveFile());i.removeClass("eudia-loading"),l.success?i.setText(l.answer):(i.setText(l.error||"Failed to query transcript"),i.addClass("eudia-error"))}catch(l){i.removeClass("eudia-loading"),i.setText(`Error: ${l.message}`),i.addClass("eudia-error")}finally{s.disabled=!1,s.setText("Ask")}}),a.addEventListener("keydown",o=>{o.key==="Enter"&&!o.shiftKey&&(o.preventDefault(),s.click())}),t.open(),a.focus()}getAccountNameFromActiveFile(){let t=this.app.workspace.getActiveFile();if(!t)return;let e=t.path.match(/Accounts\/([^\/]+)\//i);if(e)return e[1]}async processRecording(t,e){let n=t.audioBlob?.size||0;if(console.log(`[Eudia] Audio blob size: ${n} bytes, duration: ${t.duration}s`),n<1e3){new p.Notice("Recording too short or no audio captured. Please try again.");return}try{let y=await I.analyzeAudioBlob(t.audioBlob);console.log(`[Eudia] Audio diagnostic: hasAudio=${y.hasAudio}, peak=${y.peakLevel}, silent=${y.silentPercent}%`),y.warning&&(console.warn(`[Eudia] Audio warning: ${y.warning}`),y.hasAudio?new p.Notice(`Warning: ${y.warning.split(":")[0]}`,5e3):new p.Notice("Warning: Audio appears to be silent. Transcription may not work correctly. Check your microphone settings.",8e3))}catch(y){console.warn("[Eudia] Audio diagnostic failed, continuing anyway:",y)}let a=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19),i=t.audioBlob.type?.includes("mp4")?"mp4":"webm",s=await t.audioBlob.arrayBuffer(),o=n/1024/1024,l=this.settings.recordingsFolder||"Recordings",c="_backups",d=`${l}/recording-${a}.${i}`,u=`${c}/recording-${a}.${i}`,h=!1,m=!1;for(let y of[l,c])if(!this.app.vault.getAbstractFileByPath(y))try{await this.app.vault.createFolder(y)}catch{}for(let y=0;y<3;y++)try{await this.app.vault.createBinary(d,s),h=!0,console.log(`[Eudia] Audio saved: ${d} (${o.toFixed(1)}MB)`);break}catch(w){console.warn(`[Eudia] Primary save attempt ${y+1}/3 failed: ${w.message}`),y<2&&await new Promise(A=>setTimeout(A,5e3))}try{await this.app.vault.createBinary(u,s),m=!0,console.log(`[Eudia] Backup audio saved: ${u}`)}catch(y){console.warn(`[Eudia] Backup save failed: ${y.message}`)}if(h||m){let y=h?d:u;t._savedAudioPath=y,new p.Notice(`Audio saved to ${y}`);try{let w=await this.app.vault.read(e),A=w.indexOf("---",w.indexOf("---")+3);if(A>0){let x=w.substring(0,A);if(!x.includes("recording_path:")){let k=x+`recording_path: "${y}"
`;await this.app.vault.modify(e,k+w.substring(A))}}}catch(w){console.warn("[Eudia] Failed to write recording_path to frontmatter:",w.message)}}else console.error("[Eudia] CRITICAL: All audio save attempts failed \u2014 recording may be lost"),new p.Notice("WARNING: Could not save recording to disk. Audio exists only in memory for this transcription attempt.",15e3),this.telemetry.reportSafetyNetFailure({blobSizeMB:Math.round(o*100)/100,error:"Both primary and backup save failed",retryAttempt:3});let g=t.duration||0,C=Math.max(1,Math.ceil(g/600))*30+30,S=C<60?`~${C} seconds`:`~${Math.ceil(C/60)} minute${Math.ceil(C/60)>1?"s":""}`;new p.Notice(`Processing ${Math.ceil(g/60)} min recording. Should take ${S}.`);let b=await this.app.vault.read(e),f=`

---
**Processing your recording...**
Started: ${new Date().toLocaleTimeString()}
Estimated: ${S}

*You can navigate away \u2014 the summary will appear here when ready.*
---
`;await this.app.vault.modify(e,b+f),this.processTranscriptionAsync(t,e).catch(y=>{console.error("Background transcription failed:",y),new p.Notice(`Transcription failed: ${y.message}`)})}async processTranscriptionAsync(t,e){try{let n={},a=e.path.split("/");console.log(`[Eudia] Processing transcription for: ${e.path}`),console.log(`[Eudia] Path parts: ${JSON.stringify(a)}, accountsFolder: ${this.settings.accountsFolder}`);let i=a[0]==="Pipeline Meetings",s=!1;try{let y=(await this.app.vault.read(e)).match(/^---\n([\s\S]*?)\n---/);y&&(s=/meeting_type:\s*pipeline_review/.test(y[1]))}catch{}if(!s&&i&&(s=!0),s){console.log("[Eudia Pipeline] Detected pipeline review meeting, using pipeline prompt");let f="";try{let y=await(0,p.requestUrl)({url:`${this.settings.serverUrl||"https://gtm-brain.onrender.com"}/api/pipeline-context`,method:"GET",headers:{"Content-Type":"application/json"}});y.json?.success&&y.json?.context&&(f=y.json.context,console.log(`[Eudia Pipeline] Loaded Salesforce pipeline context (${f.length} chars)`))}catch(y){console.warn("[Eudia Pipeline] Could not fetch pipeline context:",y)}n={meetingType:"pipeline_review",pipelineContext:f}}else if(a.length>=2&&a[0]===this.settings.accountsFolder){let f=a[1];console.log(`[Eudia] Detected account folder: ${f}`);let y=this.settings.cachedAccounts.find(w=>w.name.toLowerCase()===f.toLowerCase());y?(n={accountName:y.name,accountId:y.id,userEmail:this.settings.userEmail},console.log(`[Eudia] Found cached account: ${y.name} (${y.id})`)):(n={accountName:f,accountId:"",userEmail:this.settings.userEmail},console.log(`[Eudia] Account not in cache, using folder name: ${f}`))}else console.log("[Eudia] File not in Accounts folder, skipping account context");let o=[];try{let f=await this.calendarService.getCurrentMeeting();f.meeting?.attendees&&(o=f.meeting.attendees.map(y=>y.name||y.email.split("@")[0]).filter(Boolean).slice(0,10))}catch{}let l=Date.now(),c=await this.transcriptionService.transcribeAudio(t.audioBlob,{...n,speakerHints:o,captureMode:t.captureMode,hasVirtualDevice:t.hasVirtualDevice,meetingTemplate:this.settings.meetingTemplate||"meddic"}),d=Math.round(t.audioBlob.size/1024/1024*100)/100,u=d>15;this.telemetry.reportTranscriptionResult({success:!!c.text?.trim(),isChunked:u,totalSizeMB:d,transcriptLength:c.text?.length||0,processingTimeSec:Math.round((Date.now()-l)/1e3),error:c.error});let h=f=>f?!!(f.summary?.trim()||f.nextSteps?.trim()):!1,m=c.sections;if(h(m)||c.text?.trim()&&(m=await this.transcriptionService.processTranscription(c.text,n)),!h(m)&&!c.text?.trim()){let y=(await this.app.vault.read(e)).replace(/\n\n---\n\*\*Processing your recording\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,"").replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,""),w=c.error,x=!w||w.includes("audio")||w.includes("microphone")?"No audio detected. Check your microphone settings.":w,k=t._savedAudioPath,j=k?`
Your recording was saved to **${k}** \u2014 you can retry transcription from there.`:"";await this.app.vault.modify(e,y+`

**Transcription failed:** ${x}${j}
`),new p.Notice(`Transcription failed: ${x}`,1e4);return}let g=await this.app.vault.read(e),v="",C=Math.max(g.indexOf(`---
**Processing your recording`),g.indexOf(`---
**Transcription in progress`));if(C>0){let f=g.indexOf("---"),y=f>=0?g.indexOf("---",f+3):-1;y>0&&y+3<C&&(v=g.substring(y+3,C).trim())}else{let f=g.indexOf("---"),y=f>=0?g.indexOf("---",f+3):-1;if(y>0){let w=g.substring(y+3).trim();w.replace(/^#.*$/gm,"").replace(/Date:\s*\nAttendees:\s*/g,"").replace(/Add meeting notes here\.\.\./g,"").replace(/---/g,"").trim().length>10&&(v=w)}}try{let f="_backups";this.app.vault.getAbstractFileByPath(f)||await this.app.vault.createFolder(f);let y=new Date().toISOString().replace(/[:.]/g,"-").substring(0,19),w=`${f}/${e.name}_${y}.md`;await this.app.vault.create(w,g),console.log(`[Eudia] Backed up note to ${w}`)}catch(f){console.warn("[Eudia] Backup failed (non-critical):",f.message)}let S;if(s?S=this.buildPipelineNoteContent(m,c,e.path):S=this.buildNoteContent(m,c),v&&v.length>5){let f=S.indexOf("---",S.indexOf("---")+3);if(f>0){let y=S.substring(0,f+3),w=S.substring(f+3);S=y+`

## My Notes (captured during call)

`+v+`

---
`+w}}await this.app.vault.modify(e,S);let b=Math.floor(t.duration/60);new p.Notice(`Transcription complete (${b} min recording)`);try{if(!s){let f=m.nextSteps||m.actionItems;f&&n?.accountName&&await this.updateAccountNextSteps(n.accountName,f,e.path)}}catch(f){console.warn("[Eudia] Next Steps extraction failed (non-critical):",f.message)}try{this.settings.autoSyncAfterTranscription&&e&&await this._executeSyncToSalesforce(e)}catch(f){console.warn("[Eudia] Auto-sync failed (non-critical):",f.message)}}catch(n){try{let a=await this.app.vault.read(e);if(a.includes("## Summary")||a.includes(`## Next Steps
-`)||a.includes("## Key Discussion Points"))console.warn("[Eudia] Post-transcription step failed but content is intact:",n.message);else{let s=a.replace(/\n\n---\n\*\*Processing your recording\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,"").replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,""),o=t?._savedAudioPath,l=o?`
Your recording was saved to **${o}** \u2014 you can retry transcription from there.`:"";await this.app.vault.modify(e,s+`

**Transcription failed:** ${n.message}${l}
`),new p.Notice(`Transcription failed: ${n.message}`,1e4)}}catch{}}}buildPipelineNoteContent(t,e,n){let a=new Date,i=String(a.getMonth()+1).padStart(2,"0"),s=String(a.getDate()).padStart(2,"0"),o=String(a.getFullYear()).slice(-2),l=a.toISOString().split("T")[0],c=`${i}.${s}.${o}`,d=g=>g==null?"":Array.isArray(g)?g.map(String).join(`
`):typeof g=="object"?JSON.stringify(g,null,2):String(g),u=d(t.summary),h=e.transcript||e.text||"",m=`---
title: "Team Pipeline Meeting - ${c}"
date: ${l}
meeting_type: pipeline_review
transcribed: true
---

# Weekly Pipeline Review | ${a.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"})}

`;if(u)m+=u;else{let g=[t.painPoints,t.productInterest,t.nextSteps,t.actionItems].filter(Boolean).map(d).join(`

`);g?m+=g:m+="*Pipeline summary could not be generated. See transcript below.*"}return h&&(m+=`

---

<details>
<summary><strong>Full Transcript</strong> (${Math.ceil(h.length/1e3)}k chars)</summary>

${h}

</details>
`),m}buildNoteContent(t,e){let n=w=>w==null?"":Array.isArray(w)?w.map(A=>typeof A=="object"?A.category?`**${A.category}**: ${A.signal||A.insight||""}`:JSON.stringify(A):String(A)).join(`
`):typeof w=="object"?JSON.stringify(w):String(w),a=n(t.title)||"Meeting Notes",i=n(t.summary),s=n(t.discussionContext),o=n(t.keyQuotes),l=n(t.painPoints),c=n(t.productInterest),d=n(t.meddiccSignals),u=n(t.nextSteps),h=n(t.actionItems),m=n(t.keyDates),g=n(t.dealSignals),v=n(t.risksObjections),C=n(t.attendees||t.keyStakeholders),S=n(t.emailDraft),b=`---
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

${i||"*AI summary will appear here*"}

`;s&&!s.includes("Not discussed")&&(b+=`## Discussion Context

${s}

`),o&&!o.includes("No significant quotes")&&!o.includes("Not discussed")&&(b+=`## Key Quotes

${o}

`),l&&!l.includes("None explicitly")&&!l.includes("Not discussed")&&(b+=`## Pain Points

${l}

`),c&&!c.includes("None identified")&&!c.includes("No specific products")&&(b+=`## Product Interest

${c}

`),d&&(b+=`## MEDDICC Signals

${d}

`),u&&(b+=`## Next Steps

${u}

`),h&&(b+=`## Action Items

${h}

`),m&&!m.includes("No specific dates")&&!m.includes("Not discussed")&&(b+=`## Key Dates

${m}

`),g&&!g.includes("No significant deal signals")&&!g.includes("Not discussed")&&(b+=`## Deal Signals

${g}

`),v&&!v.includes("None raised")&&!v.includes("No objections")&&!v.includes("Not discussed")&&(b+=`## Risks and Objections

${v}

`),C&&(b+=`## Attendees

${C}

`),S&&(b+=`---

## Draft Follow-Up Email

${S}

> *Edit this draft to match your voice, then send.*

`);let f=e.text||e.transcript||"",y=e.diarizedTranscript||"";return this.settings.appendTranscript&&(y||f)&&(b+=`---

## ${y?"Full Transcript (Speaker-Labeled)":"Full Transcript"}

${y||f}
`),b}openIntelligenceQuery(){new K(this.app,this).open()}openIntelligenceQueryForCurrentNote(){let t=this.app.workspace.getActiveFile(),e;if(t){let n=this.app.metadataCache.getFileCache(t)?.frontmatter;if(n?.account_id&&n?.account)e={id:n.account_id,name:n.account};else if(n?.account){let a=this.settings.cachedAccounts.find(i=>i.name.toLowerCase()===n.account.toLowerCase());a?e={id:a.id,name:a.name}:e={id:"",name:n.account}}else{let a=t.path.split("/");if(a.length>=2&&a[0]===this.settings.accountsFolder){let i=a[1],s=this.settings.cachedAccounts.find(o=>o.name.replace(/[<>:"/\\|?*]/g,"_").trim()===i);s?e={id:s.id,name:s.name}:e={id:"",name:i}}}}new K(this.app,this,e).open()}async syncAccounts(t=!1){t||new p.Notice("Syncing Salesforce accounts...");try{let n=(await(0,p.requestUrl)({url:`${this.settings.serverUrl}/api/accounts/obsidian`,method:"GET",headers:{Accept:"application/json"}})).json;if(!n.success||!n.accounts){t||new p.Notice("Failed to fetch accounts from server");return}this.settings.cachedAccounts=n.accounts.map(a=>({id:a.id,name:a.name})),this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings(),t||new p.Notice(`Synced ${n.accounts.length} accounts for matching`)}catch(e){t||new p.Notice(`Failed to sync accounts: ${e.message}`)}}async scanLocalAccountFolders(){try{let t=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!t||!(t instanceof p.TFolder))return;let e=[];for(let n of t.children)if(n instanceof p.TFolder)if(n.name==="_Prospects")for(let a of n.children)a instanceof p.TFolder&&e.push({id:`local-${a.name.replace(/\s+/g,"-").toLowerCase()}`,name:a.name});else n.name.startsWith("_")||e.push({id:`local-${n.name.replace(/\s+/g,"-").toLowerCase()}`,name:n.name});this.settings.cachedAccounts=e,this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings()}catch(t){console.error("Failed to scan local account folders:",t)}}async refreshAccountFolders(){if(!this.settings.userEmail)throw new Error("Please configure your email first");let t=new L(this.settings.serverUrl);if((await t.getAccountsForUser(this.settings.userEmail)).length===0)return console.log("[Eudia] No accounts found for user"),0;let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),a=[];if(n&&n instanceof p.TFolder)for(let o of n.children)o instanceof p.TFolder&&a.push(o.name);let i=await t.getNewAccounts(this.settings.userEmail,a);if(i.length===0)return console.log("[Eudia] All account folders exist"),0;console.log(`[Eudia] Creating ${i.length} new account folders`);let s=await this.fetchEnrichmentData(i);return await this.createTailoredAccountFolders(i,s),i.length}async checkAndConsumeSyncFlags(){if(!this.settings.userEmail)return;let t=encodeURIComponent(this.settings.userEmail.toLowerCase().trim()),e=this.settings.serverUrl||"https://gtm-wizard.onrender.com";try{let i=((await(0,p.requestUrl)({url:`${e}/api/admin/users/${t}/sync-flags`,method:"GET"})).json?.flags||[]).filter(o=>!o.consumed_at);if(i.length===0)return;console.log(`[Eudia] Found ${i.length} pending sync flag(s)`);let s=!1;for(let o of i)if(o.flag==="resync_accounts"){s=!0;let l=o.payload||{},c=l.added?.length||0,d=l.removed?.length||0;console.log(`[Eudia] Sync flag: resync_accounts (+${c} / -${d})`)}else o.flag==="update_plugin"?new p.Notice("A plugin update is available. Please visit gtm-wizard.onrender.com/fresh-install"):o.flag==="reset_setup"&&(console.log("[Eudia] Sync flag: reset_setup received"),this.settings.setupCompleted=!1,await this.saveSettings(),new p.Notice("Setup has been reset by admin. Please re-run the setup wizard."));if(s){console.log("[Eudia] Triggering account folder resync from sync flag..."),new p.Notice("Syncing account updates...");let o=await this.syncAccountFolders();o.success?new p.Notice(`Account sync complete: ${o.added} new, ${o.archived} archived`):console.log(`[Eudia] Account resync error: ${o.error}`)}try{await(0,p.requestUrl)({url:`${e}/api/admin/users/${t}/sync-flags/consume`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagIds:i.map(o=>o.id)})}),console.log(`[Eudia] Consumed ${i.length} sync flag(s)`)}catch{console.log("[Eudia] Failed to consume sync flags (will retry next startup)")}}catch{console.log("[Eudia] Sync flag check skipped (endpoint not available)")}}async syncAccountFolders(){if(!this.settings.userEmail)return{success:!1,added:0,archived:0,error:"No email configured"};let t=this.settings.userEmail.toLowerCase().trim();console.log(`[Eudia] Syncing account folders for: ${t}`);try{let e=await fetch(`${this.settings.serverUrl}/api/bl-accounts/${encodeURIComponent(t)}`);if(!e.ok){let E=await e.json().catch(()=>({}));throw new Error(E.error||`Server returned ${e.status}`)}let n=await e.json();if(!n.success||!n.accounts)throw new Error(n.error||"Invalid response from server");let a=n.meta?.userGroup||"bl",i=n.meta?.queryDescription||"accounts",s=n.meta?.region||null;console.log(`[Eudia] User group: ${a}, accounts: ${n.accounts.length} (${i})`),s&&console.log(`[Eudia] Sales Leader region: ${s}`);let o=n.accounts||[],l=n.prospectAccounts||[],c=o.length+l.length;console.log(`[Eudia] Server returned: ${o.length} active + ${l.length} prospects = ${c} total`);let d=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),u=new Map,h=`${this.settings.accountsFolder}/_Prospects`,m=this.app.vault.getAbstractFileByPath(h),g=new Map,v=new Map;if(d&&d instanceof p.TFolder)for(let E of d.children)E instanceof p.TFolder&&!E.name.startsWith("_")&&u.set(E.name.toLowerCase().trim(),E);if(m&&m instanceof p.TFolder)for(let E of m.children)E instanceof p.TFolder?g.set(E.name.toLowerCase().trim(),E):E instanceof p.TFile&&E.extension==="md"&&v.set(E.basename.toLowerCase().trim(),E);let C=new Set(o.map(E=>E.name.toLowerCase().trim())),S=o.filter(E=>{let T=E.name.toLowerCase().trim();return!u.has(T)}),b=l.filter(E=>{let T=E.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();return!g.has(T)&&!v.has(T)&&!u.has(E.name.toLowerCase().trim())}),f=[];for(let E of o){let T=E.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();(g.has(T)||v.has(T))&&!u.has(E.name.toLowerCase().trim())&&f.push(E)}let y=new Set([...o.map(E=>E.name.toLowerCase().trim()),...l.map(E=>E.name.toLowerCase().trim())]),w=[];if(a==="bl")for(let[E,T]of u.entries())y.has(E)||w.push(T);let A=0,x=0,k=0,j=0;if(f.length>0){console.log(`[Eudia] Promoting ${f.length} accounts from prospect to active`);for(let E of f){let T=E.name.replace(/[<>:"/\\|?*]/g,"_").trim(),W=g.get(T.toLowerCase()),$=v.get(T.toLowerCase());try{if(W){let P=`${this.settings.accountsFolder}/${T}`;await this.app.vault.rename(W,P),k++,new p.Notice(`${E.name} promoted to active`)}else if($){await this.app.vault.delete($);let P=[{id:E.id,name:E.name,type:E.customerType,isOwned:!0,hadOpportunity:!0}],we=await this.fetchEnrichmentData(P);await this.createTailoredAccountFolders(P,we),k++,new p.Notice(`${E.name} promoted to active -- full account folder created`)}}catch(P){console.error(`[Eudia] Failed to promote ${E.name}:`,P)}}}if(S.length>0){console.log(`[Eudia] Creating ${S.length} new active account folders for ${a}`);let E=new Set(f.map(W=>W.name.toLowerCase().trim())),T=S.filter(W=>!E.has(W.name.toLowerCase().trim()));if(T.length>0){let W=T.map($=>({id:$.id,name:$.name,type:$.customerType,isOwned:a==="bl",ownerName:$.ownerName,hadOpportunity:!0}));if(a==="admin"||a==="exec")await this.createAdminAccountFolders(W);else{let $=await this.fetchEnrichmentData(W);await this.createTailoredAccountFolders(W,$)}A=T.length}this.telemetry&&this.telemetry.reportInfo("Accounts synced - added",{count:A,userGroup:a,region:s||void 0})}return b.length>0&&a==="bl"&&(console.log(`[Eudia] Creating ${b.length} new prospect files`),j=await this.createProspectAccountFiles(b.map(E=>({id:E.id,name:E.name,type:"Prospect",hadOpportunity:!1,website:E.website,industry:E.industry})))),this.settings.archiveRemovedAccounts&&w.length>0&&(console.log(`[Eudia] Archiving ${w.length} removed account folders`),x=await this.archiveAccountFolders(w),this.telemetry&&this.telemetry.reportInfo("Accounts synced - archived",{count:x})),console.log(`[Eudia] Sync complete: ${A} active added, ${j} prospects added, ${k} promoted, ${x} archived (group: ${a})`),{success:!0,added:A+j+k,archived:x,userGroup:a}}catch(e){return console.error("[Eudia] Account sync error:",e),this.telemetry&&this.telemetry.reportError("Account sync failed",{error:e.message}),{success:!1,added:0,archived:0,error:e.message}}}async archiveAccountFolders(t){let e=0,n=`${this.settings.accountsFolder}/_Archived`;this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);for(let i of t)try{let s=`${n}/${i.name}`;if(this.app.vault.getAbstractFileByPath(s)){let d=new Date().toISOString().split("T")[0];await this.app.fileManager.renameFile(i,`${n}/${i.name}_${d}`)}else await this.app.fileManager.renameFile(i,s);let l=`${n}/${i.name}/_archived.md`,c=`---
archived_date: ${new Date().toISOString()}
reason: Account no longer in book of business
---

This account folder was archived because it no longer appears in your Salesforce book of business.

To restore, move this folder back to the Accounts directory.
`;try{await this.app.vault.create(l,c)}catch{}e++,console.log(`[Eudia] Archived: ${i.name}`)}catch(s){console.error(`[Eudia] Failed to archive ${i.name}:`,s)}return e}async syncSpecificNoteToSalesforce(t){let e=await this.app.vault.read(t),n=this.app.metadataCache.getFileCache(t)?.frontmatter;if(!n?.sync_to_salesforce)return{success:!1,error:"sync_to_salesforce not enabled"};let a=n.account_id,i=n.account;if(!a&&i){let s=this.settings.cachedAccounts.find(o=>o.name.toLowerCase()===i.toLowerCase());s&&(a=s.id)}if(!a){let s=t.path.split("/");if(s.length>=2&&s[0]===this.settings.accountsFolder){let o=s[1]==="_Prospects"&&s.length>=3?s[2]:s[1],l=this.settings.cachedAccounts.find(c=>c.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);l&&(a=l.id,i=l.name)}}if(!a)return{success:!1,error:`Could not determine account for ${t.path}`};try{let s=await(0,p.requestUrl)({url:`${this.settings.serverUrl}/api/notes/sync`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:a,accountName:i,noteTitle:t.basename,notePath:t.path,content:e,frontmatter:n,syncedAt:new Date().toISOString(),userEmail:this.settings.userEmail})});return s.json?.success?{success:!0}:{success:!1,error:s.json?.error||"Unknown error",authRequired:s.json?.authRequired}}catch(s){return{success:!1,error:s.message}}}async copyForSlack(){let t=this.app.workspace.getActiveFile();if(!t){new p.Notice("No note open to copy");return}try{let e=await this.app.vault.read(t),a=e.match(/^account:\s*"?([^"\n]+)"?/m)?.[1]||t.parent?.name||"Meeting",s=e.match(/^last_updated:\s*(\S+)/m)?.[1]||new Date().toISOString().split("T")[0],o="",l=e.match(/## Summary\n([\s\S]*?)(?=\n## |\n---|\Z)/);l&&(o=l[1].trim().split(`
`).filter(v=>v.startsWith("-")||v.startsWith("\u2022")).slice(0,3).map(v=>v.replace(/^[-•]\s*/,"").trim()).join(`
`));let c="",d=e.match(/## Next Steps\n([\s\S]*?)(?=\n## |\n---|\Z)/);d&&(c=d[1].trim().split(`
`).filter(v=>v.startsWith("-")||v.startsWith("\u2022")).slice(0,3).map(v=>v.replace(/^[-•\s[\]x]*/,"").trim()).join(`
\u2022 `));let u="",h=e.match(/"([^"]{20,120})"/);h&&(u=h[1]);let m=`*${a} \u2014 ${s}*
`;o&&(m+=`${o}
`),c&&(m+=`
*Next Steps:*
\u2022 ${c}
`),u&&(m+=`
> _"${u}"_
`),await navigator.clipboard.writeText(m),new p.Notice("Copied for Slack \u2713",3e3)}catch(e){new p.Notice("Failed to copy: "+(e.message||""))}}async syncNoteToSalesforce(){let t=this.app.workspace.getActiveFile();if(!t){new p.Notice("No active file to sync");return}let e=this.app.metadataCache.getFileCache(t)?.frontmatter;if(!e?.sync_to_salesforce){new p.Notice("Set sync_to_salesforce: true in frontmatter to enable sync");return}let n=e?.account||"";new class extends p.Modal{constructor(s,o,l){super(s);this.acctName=o;this.onConfirm=l;this.confirmed=!1}onOpen(){let{contentEl:s}=this;s.empty(),s.createEl("h3",{text:"Sync to Salesforce?"});let o=this.acctName?`Push this note to Salesforce under ${this.acctName}?`:"Push this note to Salesforce?";s.createEl("p",{text:o});let l=s.createEl("p",{text:"Only notes you explicitly sync are shared."});l.style.cssText="font-size:12px;color:var(--text-muted);";let c=s.createDiv({cls:"modal-button-container"});c.style.cssText="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;",c.createEl("button",{text:"Cancel"}).onclick=()=>this.close();let d=c.createEl("button",{text:"Sync to Salesforce",cls:"mod-cta"});d.onclick=()=>{this.confirmed=!0,this.close()}}onClose(){this.confirmed&&this.onConfirm()}}(this.app,n,()=>this._executeSyncToSalesforce(t)).open()}async _executeSyncToSalesforce(t){new p.Notice("Syncing to Salesforce...");let e=await this.syncSpecificNoteToSalesforce(t);e.success?new p.Notice("Synced to Salesforce"):e.authRequired?new p.Notice("Salesforce authentication required. Please reconnect."):new p.Notice("Failed to sync: "+(e.error||"Unknown error"))}async checkAndAutoEnrich(){let t=this.settings.accountsFolder||"Accounts",e=this.app.vault.getAbstractFileByPath(t);if(!e||!(e instanceof p.TFolder))return;let n=[],a=i=>{for(let s of i.children){if(!(s instanceof p.TFolder)||s.name==="_Archive")continue;if(s.name==="_Prospects"){a(s);continue}let o=`${s.path}/Contacts.md`,l=this.app.vault.getAbstractFileByPath(o);if(!(!l||!(l instanceof p.TFile))){if(this.app.metadataCache.getFileCache(l)?.frontmatter?.enriched_at)continue}let c=s.name,d=this.settings.cachedAccounts.find(u=>u.name.replace(/[<>:"/\\|?*]/g,"_").trim()===c);d&&d.id&&n.push({id:d.id,name:d.name,owner:"",ownerEmail:""})}};if(a(e),n.length===0){console.log("[Eudia] Auto-enrich: all account folders already enriched");return}console.log(`[Eudia] Auto-enrich: ${n.length} accounts need enrichment (including prospects)`);try{await this.enrichAccountFolders(n)}catch(i){console.error("[Eudia] Auto-enrich failed:",i)}}async enrichAccountFolders(t){if(!t||t.length===0)return;let e=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=this.settings.accountsFolder||"Accounts",a=t.filter(g=>g.id&&g.id.startsWith("001"));if(a.length===0)return;let i=a.length,s=0,o=0;console.log(`[Eudia Enrich] Starting enrichment for ${i} accounts`);let l=document.createElement("div");l.className="eudia-enrich-progress",l.innerHTML=`
      <div style="font-size:13px;font-weight:500;margin-bottom:6px;color:var(--text-normal);">Loading account data...</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;" class="enrich-detail">Syncing contacts, opportunities, and intelligence from Salesforce</div>
      <div style="height:6px;background:var(--background-modifier-border);border-radius:3px;overflow:hidden;">
        <div class="enrich-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#8e99e1,#818cf8);border-radius:3px;transition:width 0.3s ease;"></div>
      </div>
      <div style="font-size:11px;color:var(--text-faint);margin-top:4px;" class="enrich-count">0 / ${i}</div>
    `,l.style.cssText="position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:10px;padding:14px 20px;min-width:300px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:1000;",document.body.appendChild(l);let c=l.querySelector(".enrich-bar"),d=l.querySelector(".enrich-count"),u=l.querySelector(".enrich-detail"),h=10,m=0;for(let g=0;g<a.length;g+=h){let v=a.slice(g,g+h),C=v.map(b=>b.id);try{let b=await(0,p.requestUrl)({url:`${e}/api/accounts/enrich-batch`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountIds:C,userEmail:this.settings.userEmail})});if(b.json?.success&&b.json?.enrichments)for(let f of v){let y=b.json.enrichments[f.id];m++;let w=Math.round(m/i*100);if(c&&(c.style.width=`${w}%`),d&&(d.textContent=`${w}% \u2014 ${m} of ${i}`),u&&(u.textContent=f.name),!!y)try{await this.writeEnrichmentToAccount(f,y,n),s++}catch{o++}}else m+=v.length}catch{o+=v.length,m+=v.length}let S=Math.round(m/i*100);c&&(c.style.width=`${S}%`),d&&(d.textContent=`${S}% \u2014 ${m} of ${i}`),g+h<a.length&&await new Promise(b=>setTimeout(b,50))}u&&(u.textContent=`${s} accounts loaded with contacts and intelligence`),c&&(c.style.width="100%"),d&&(d.textContent="Complete"),setTimeout(()=>l.remove(),3e3),console.log(`[Eudia Enrich] Done: ${s} enriched, ${o} skipped`)}async writeEnrichmentToAccount(t,e,n){let a=t.name.replace(/[<>:"/\\|?*]/g,"_").trim(),i=`${n}/${a}`,s=this.app.vault.getAbstractFileByPath(i);if(s instanceof p.TFolder||(i=`${n}/_Prospects/${a}`,s=this.app.vault.getAbstractFileByPath(i)),!(s instanceof p.TFolder))return;let o=new Date().toISOString(),l=async(c,d)=>{let u=`${i}/${c}`,h=this.app.vault.getAbstractFileByPath(u);if(!(h instanceof p.TFile))return;let m=await this.app.vault.read(h),g="",v=m;if(m.startsWith("---")){let f=m.indexOf("---",3);f!==-1&&(g=m.substring(0,f+3),v=m.substring(f+3),g.includes("enriched_at:")?g=g.replace(/enriched_at:.*/,`enriched_at: "${o}"`):g=g.substring(0,f)+`enriched_at: "${o}"
---`)}let C=v.match(/^(\s*#[^\n]+)/),b=`${C?C[1]:""}

${d}
`;await this.app.vault.modify(h,`${g}
${b}`)};if(e.contacts&&await l("Contacts.md",`${e.contacts}

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*`),e.intelligence&&await l("Intelligence.md",e.intelligence),e.nextSteps&&await l("Next Steps.md",e.nextSteps),e.opportunities||e.recentActivity){let c=`${i}/Meeting Notes.md`,d=this.app.vault.getAbstractFileByPath(c);if(d instanceof p.TFile){let u=await this.app.vault.read(d),h="",m=u;if(u.startsWith("---")){let S=u.indexOf("---",3);S!==-1&&(h=u.substring(0,S+3),m=u.substring(S+3),h.includes("enriched_at:")?h=h.replace(/enriched_at:.*/,`enriched_at: "${o}"`):h=h.substring(0,S)+`enriched_at: "${o}"
---`)}let g=m.match(/^(\s*#[^\n]+)/),C=[g?g[1]:`
# ${t.name} - Meeting Notes`,""];e.opportunities&&C.push(e.opportunities,""),e.recentActivity&&C.push(e.recentActivity,""),C.push("## Quick Start","","1. Open **Note 1** for your next meeting","2. Click the **microphone** to record and transcribe","3. **Next Steps** are auto-extracted after transcription","4. Set `sync_to_salesforce: true` to sync to Salesforce"),await this.app.vault.modify(d,`${h}
${C.join(`
`)}
`)}}}startSalesforceSyncScanner(){if(!this.settings.sfAutoSyncEnabled){console.log("[Eudia SF Sync] Auto-sync is disabled in settings"),this.updateSfSyncStatusBar("SF Sync: Off");return}let t=(this.settings.sfAutoSyncIntervalMinutes||15)*60*1e3;console.log(`[Eudia SF Sync] Starting scanner \u2014 interval: ${this.settings.sfAutoSyncIntervalMinutes}min`),this.updateSfSyncStatusBar("SF Sync: Idle");let e=window.setTimeout(()=>{this.runSalesforceSyncScan()},3e4);this.registerInterval(e),this.sfSyncIntervalId=window.setInterval(()=>{this.runSalesforceSyncScan()},t),this.registerInterval(this.sfSyncIntervalId)}async runSalesforceSyncScan(){if(!(!this.settings.sfAutoSyncEnabled||!this.settings.userEmail)){console.log("[Eudia SF Sync] Running scan...");try{let t=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!(t instanceof p.TFolder)){console.log("[Eudia SF Sync] Accounts folder not found");return}let e=[],n=d=>{for(let u of d.children)u instanceof p.TFile&&u.extension==="md"?e.push(u):u instanceof p.TFolder&&n(u)};n(t);let a=[];for(let d of e){let h=this.app.metadataCache.getFileCache(d)?.frontmatter;if(!h?.sync_to_salesforce)continue;let m=h.last_sf_sync?new Date(h.last_sf_sync).getTime():0;d.stat.mtime>m&&a.push(d)}if(a.length===0){console.log("[Eudia SF Sync] No flagged notes need syncing"),this.updateSfSyncStatusBar("SF Sync: Idle");return}console.log(`[Eudia SF Sync] ${a.length} note(s) queued for sync`),this.updateSfSyncStatusBar(`SF Sync: Syncing ${a.length}...`);let i=0,s=0;for(let d of a){let u=await this.syncSpecificNoteToSalesforce(d);if(u.success)i++,await this.updateNoteSyncTimestamp(d);else if(s++,console.log(`[Eudia SF Sync] Failed to sync ${d.path}: ${u.error}`),u.authRequired){new p.Notice("Salesforce authentication expired. Please reconnect to resume auto-sync."),this.updateSfSyncStatusBar("SF Sync: Auth required");return}}let l=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}),c=s>0?`SF Sync: ${i} synced, ${s} failed at ${l}`:`SF Sync: ${i} note${i!==1?"s":""} synced at ${l}`;console.log(`[Eudia SF Sync] ${c}`),this.updateSfSyncStatusBar(c),i>0&&new p.Notice(c)}catch(t){console.error("[Eudia SF Sync] Scan error:",t),this.updateSfSyncStatusBar("SF Sync: Error")}}}async updateNoteSyncTimestamp(t){try{let e=await this.app.vault.read(t),n=new Date().toISOString();if(e.startsWith("---")){let a=e.indexOf("---",3);if(a!==-1){let i=e.substring(0,a),s=e.substring(a);if(i.includes("last_sf_sync:")){let o=i.replace(/last_sf_sync:.*/,`last_sf_sync: "${n}"`)+s;await this.app.vault.modify(t,o)}else{let o=i+`last_sf_sync: "${n}"
`+s;await this.app.vault.modify(t,o)}}}}catch(e){console.error(`[Eudia SF Sync] Failed to update sync timestamp for ${t.path}:`,e)}}updateSfSyncStatusBar(t){this.sfSyncStatusBarEl&&this.sfSyncStatusBarEl.setText(t)}async createMeetingNote(){return new Promise(t=>{new ie(this.app,this,async n=>{if(!n){t();return}let a=new Date().toISOString().split("T")[0],i=n.name.replace(/[<>:"/\\|?*]/g,"_").trim(),s=`${this.settings.accountsFolder}/${i}`,o=`${a} Meeting.md`,l=`${s}/${o}`;this.app.vault.getAbstractFileByPath(s)||await this.app.vault.createFolder(s);let c=`---
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

`,d=await this.app.vault.create(l,c);await this.app.workspace.getLeaf().openFile(d),new p.Notice(`Created meeting note for ${n.name}`),t()}).open()})}async fetchAndInsertContext(){new p.Notice("Fetching pre-call context...")}async refreshAnalyticsDashboard(t){if(!this.settings.userEmail){console.log("[Eudia] Cannot refresh analytics - no email configured");return}let n=(await this.app.vault.read(t)).match(/^---\n([\s\S]*?)\n---/);if(!n)return;let a=n[1];if(!a.includes("type: analytics_dashboard"))return;let i=a.match(/category:\s*(\w+)/)?.[1]||"team";console.log(`[Eudia] Refreshing analytics dashboard: ${t.name} (${i})`);try{let s=null,o=this.settings.serverUrl,l=encodeURIComponent(this.settings.userEmail);switch(i){case"pain_points":s=(await(0,p.requestUrl)({url:`${o}/api/analytics/pain-points?days=30`,method:"GET"})).json,s.success&&await this.updatePainPointNote(t,s.painPoints);break;case"objections":s=(await(0,p.requestUrl)({url:`${o}/api/analytics/objection-playbook?days=90`,method:"GET"})).json,s.success&&await this.updateObjectionNote(t,s);break;case"coaching":case"team":default:s=(await(0,p.requestUrl)({url:`${o}/api/analytics/team-trends?managerId=${l}`,method:"GET"})).json,s.success&&await this.updateTeamPerformanceNote(t,s.trends);break}s?.success&&new p.Notice(`Analytics refreshed: ${t.name}`)}catch(s){console.error("[Eudia] Analytics refresh error:",s)}}async updatePainPointNote(t,e){if(!e||e.length===0)return;let n=new Date().toISOString().split("T")[0],a=e.slice(0,10).map(c=>`| ${c.painPoint||"--"} | ${c.count||0} | ${c.category||"--"} | ${c.averageSeverity||"medium"} |`).join(`
`),i={};for(let c of e){let d=c.category||"other";i[d]||(i[d]=[]),i[d].push(c)}let s="";for(let[c,d]of Object.entries(i)){s+=`
### ${c.charAt(0).toUpperCase()+c.slice(1)}
`;for(let u of d.slice(0,3))s+=`- ${u.painPoint}
`}let o=e.filter(c=>c.exampleQuotes&&c.exampleQuotes.length>0).slice(0,5).map(c=>`> "${c.exampleQuotes[0]}" - on ${c.painPoint}`).join(`

`),l=`---
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
`;await this.app.vault.modify(t,l)}async updateObjectionNote(t,e){if(!e.objections||e.objections.length===0)return;let n=new Date().toISOString().split("T")[0],a=e.objections.slice(0,10).map(o=>{let l=o.handleRatePercent>=75?"\u2705 Strong":o.handleRatePercent>=50?"\u26A0\uFE0F Moderate":"\u274C Needs Work";return`| ${o.objection?.substring(0,40)||"--"}... | ${o.count||0} | ${o.handleRatePercent||0}% | ${l} |`}).join(`
`),i="";for(let o of e.objections.slice(0,5))if(o.bestResponses&&o.bestResponses.length>0){i+=`
### Objection: "${o.objection?.substring(0,50)}..."

`,i+=`**Frequency:** ${o.count} times  
`,i+=`**Handle Rate:** ${o.handleRatePercent}%

`,i+=`**Best Responses:**
`;for(let l of o.bestResponses.slice(0,2))i+=`1. *"${l.response}"* - ${l.rep||"Team member"}
`;i+=`
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
${i||"*No best practices available yet*"}

---

## Coaching Notes

*Objections with <50% handle rate need training focus*

Average handle rate: ${e.avgHandleRate||0}%

---

> **Tip:** Review this playbook before important calls.
`;await this.app.vault.modify(t,s)}async updateTeamPerformanceNote(t,e){if(!e)return;let n=new Date().toISOString().split("T")[0],a=s=>s>0?`\u2191 ${Math.abs(s).toFixed(1)}%`:s<0?`\u2193 ${Math.abs(s).toFixed(1)}%`:"--",i=`---
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
`;await this.app.vault.modify(t,i)}};var ce=class extends p.PluginSettingTab{constructor(r,t){super(r,t),this.plugin=t}display(){let{containerEl:r}=this;r.empty(),r.createEl("h2",{text:"Eudia Sync & Scribe"}),r.createEl("h3",{text:"Your Profile"});let t=r.createDiv();t.style.cssText="padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px; margin-top: 16px;";let e=t.createDiv();e.style.cssText="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";let n=e.createSpan(),a=e.createSpan(),i=t.createDiv();i.style.cssText="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;",i.setText("Connect with Salesforce to sync notes with your user attribution.");let s=t.createEl("button");s.style.cssText="padding: 10px 20px; cursor: pointer; border-radius: 6px;";let o=null,l=async()=>{if(!this.plugin.settings.userEmail)return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);",a.setText("Enter email above first"),s.setText("Setup Required"),s.disabled=!0,s.style.opacity="0.5",s.style.cursor="not-allowed",!1;s.disabled=!1,s.style.opacity="1",s.style.cursor="pointer";try{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); animation: pulse 1s infinite;",a.setText("Checking..."),(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;",a.setText("Connected to Salesforce"),s.setText("Reconnect"),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),!0):(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;",a.setText("Not connected"),s.setText("Connect to Salesforce"),!1)}catch{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;",a.setText("Status unavailable"),s.setText("Connect to Salesforce"),!1}};new p.Setting(r).setName("Eudia Email").setDesc("Your @eudia.com email address for calendar and Salesforce sync").addText(y=>y.setPlaceholder("yourname@eudia.com").setValue(this.plugin.settings.userEmail).onChange(async w=>{let A=w.trim().toLowerCase();this.plugin.settings.userEmail=A,await this.plugin.saveSettings(),await l()})),new p.Setting(r).setName("Timezone").setDesc("Your local timezone for calendar event display").addDropdown(y=>{ve.forEach(w=>{y.addOption(w.value,w.label)}),y.setValue(this.plugin.settings.timezone),y.onChange(async w=>{this.plugin.settings.timezone=w,await this.plugin.saveSettings(),this.plugin.calendarService?.setTimezone(w),new p.Notice(`Timezone set to ${ve.find(A=>A.value===w)?.label||w}`)})}),r.createEl("h3",{text:"Salesforce Connection"}),r.appendChild(t);let c=()=>{o&&window.clearInterval(o);let y=0,w=30;o=window.setInterval(async()=>{y++,await l()?(o&&(window.clearInterval(o),o=null),new p.Notice("Salesforce connected successfully!")):y>=w&&o&&(window.clearInterval(o),o=null)},5e3)};s.onclick=async()=>{if(!this.plugin.settings.userEmail){new p.Notice("Please enter your email first");return}let y=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(y,"_blank"),new p.Notice("Complete the Salesforce login in the popup window",5e3),c()},l(),r.createEl("h3",{text:"Server"}),new p.Setting(r).setName("GTM Brain Server").setDesc("Server URL for calendar, accounts, and sync").addText(y=>y.setValue(this.plugin.settings.serverUrl).onChange(async w=>{this.plugin.settings.serverUrl=w,await this.plugin.saveSettings()}));let d=r.createDiv({cls:"settings-advanced-collapsed"}),u=d.createDiv({cls:"eudia-transcription-status"});u.style.cssText="padding: 12px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;",u.innerHTML='<span style="color: var(--text-muted);">Checking server transcription status...</span>',(async()=>{try{(await(0,p.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/plugin/config`,method:"GET"})).json?.capabilities?.serverTranscription?u.innerHTML='<span class="eudia-check-icon"></span> Server transcription is available. No local API key needed.':u.innerHTML='<span class="eudia-warn-icon"></span> Server transcription unavailable. Add a local API key below.'}catch{u.innerHTML='<span style="color: #f59e0b;">\u26A0</span> Could not check server status. Local API key recommended as backup.'}})();let h=new p.Setting(r).setName("Advanced Options").setDesc("Show fallback API key (usually not needed)").addToggle(y=>y.setValue(!1).onChange(w=>{d.style.display=w?"block":"none"}));d.style.display="none",r.createEl("h3",{text:"Audio Capture"});let m=r.createDiv();m.style.cssText="font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5;",m.setText(`Full Call mode automatically captures both sides of the call (your mic + the other person's audio). No extra software needed \u2014 the plugin uses native system audio capture. Run "Test System Audio Capture" from the command palette (Cmd+P) to verify your setup.`),new p.Setting(r).setName("Capture Mode").setDesc("Full Call captures both sides; Mic Only captures your voice only.").addDropdown(y=>{y.addOption("full_call","Full Call (Both Sides)"),y.addOption("mic_only","Mic Only"),y.setValue(this.plugin.settings.audioCaptureMode||"full_call"),y.onChange(async w=>{this.plugin.settings.audioCaptureMode=w,await this.plugin.saveSettings()})});let g=r.createDiv();g.style.cssText="padding: 10px 14px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;",g.setText("Checking system audio capabilities...");let v=new p.Setting(r).setName("Microphone").setDesc("Select your physical microphone"),C=new p.Setting(r).setName("System Audio Device").setDesc("Override for system audio source (auto-detected \u2014 most users should leave this on Auto)"),S=r.createDiv();S.style.cssText="margin-bottom: 16px;";let b=S.createEl("button",{text:"Test Audio (3 seconds)"});b.style.cssText="padding: 8px 16px; cursor: pointer; border-radius: 6px;";let f=S.createDiv();f.style.cssText="font-size: 12px; margin-top: 6px; color: var(--text-muted);",(async()=>{try{try{(await navigator.mediaDevices.getUserMedia({audio:!0})).getTracks().forEach(k=>k.stop())}catch{}let y=await I.getAvailableDevices(),w=y.find(x=>x.isVirtual);if(w)g.innerHTML=`<span style="color:#22c55e;">&#10003;</span> System audio device detected: <strong>${w.label}</strong>`,this.plugin.settings.audioSystemDeviceId||(this.plugin.settings.audioSystemDeviceId=w.deviceId,await this.plugin.saveSettings());else{let x=await I.probeSystemAudioCapabilities();x.desktopCapturerAvailable||I.isHandlerReady()?g.innerHTML='<span style="color:#22c55e;">&#10003;</span> Native system audio capture available. Both sides of calls will be recorded automatically.':x.getDisplayMediaAvailable?g.innerHTML=`<span style="color:#3b82f6;">&#8505;</span> System audio capture ready. On first recording, macOS may ask for Screen Recording permission \u2014 this is how the plugin captures the other person's audio.`:g.innerHTML=`<span style="color:#f59e0b;">&#9888;</span> System audio not available (Electron ${x.electronVersion||"?"}). Run "Test System Audio Capture" from Cmd+P for details.`}let A=y.filter(x=>!x.isVirtual);v.addDropdown(x=>{x.addOption("","Default Microphone"),A.forEach(k=>x.addOption(k.deviceId,k.label)),x.setValue(this.plugin.settings.audioMicDeviceId||""),x.onChange(async k=>{this.plugin.settings.audioMicDeviceId=k,await this.plugin.saveSettings()})}),C.addDropdown(x=>{x.addOption("","Auto-detect / None"),y.filter(k=>k.isVirtual).forEach(k=>x.addOption(k.deviceId,k.label)),y.filter(k=>!k.isVirtual).forEach(k=>x.addOption(k.deviceId,`(mic) ${k.label}`)),x.setValue(this.plugin.settings.audioSystemDeviceId||""),x.onChange(async k=>{this.plugin.settings.audioSystemDeviceId=k,await this.plugin.saveSettings()})})}catch(y){g.setText("Could not enumerate audio devices."),console.warn("[Eudia Settings] Device enumeration failed:",y)}})(),b.onclick=async()=>{b.disabled=!0,b.setText("Recording..."),f.setText("");try{let y=new I;await y.start({captureMode:this.plugin.settings.audioCaptureMode||"full_call",micDeviceId:this.plugin.settings.audioMicDeviceId||void 0,systemAudioDeviceId:this.plugin.settings.audioSystemDeviceId||void 0}),await new Promise(j=>setTimeout(j,3e3));let w=await y.stop(),A=await I.analyzeAudioBlob(w.audioBlob),x={electron:"System Audio (Electron)",display_media:"System Audio (Screen Share)",virtual_device:"Virtual Device + Mic"},k=w.systemAudioMethod?x[w.systemAudioMethod]||"System Audio":w.captureMode==="full_call"?"Speaker Mode":"Mic Only";f.innerHTML=`<strong>${k}</strong> | Peak: ${A.peakLevel}% | Avg: ${A.averageLevel}% | Silent: ${A.silentPercent}%`+(A.warning?`<br><span style="color:#ef4444;">${A.warning}</span>`:'<br><span style="color:#22c55e;">Audio detected \u2014 recording should work.</span>')}catch(y){f.innerHTML=`<span style="color:#ef4444;">Test failed: ${y.message}</span>`}finally{b.disabled=!1,b.setText("Test Audio (3 seconds)")}},r.createEl("h3",{text:"Transcription"}),new p.Setting(r).setName("Save Audio Files").setDesc("Keep original audio recordings").addToggle(y=>y.setValue(this.plugin.settings.saveAudioFiles).onChange(async w=>{this.plugin.settings.saveAudioFiles=w,await this.plugin.saveSettings()})),new p.Setting(r).setName("Append Full Transcript").setDesc("Include complete transcript in notes").addToggle(y=>y.setValue(this.plugin.settings.appendTranscript).onChange(async w=>{this.plugin.settings.appendTranscript=w,await this.plugin.saveSettings()})),r.createEl("h3",{text:"Sync"}),new p.Setting(r).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle(y=>y.setValue(this.plugin.settings.syncOnStartup).onChange(async w=>{this.plugin.settings.syncOnStartup=w,await this.plugin.saveSettings()})),new p.Setting(r).setName("Auto-Sync After Transcription").setDesc("Push notes to Salesforce after transcription").addToggle(y=>y.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async w=>{this.plugin.settings.autoSyncAfterTranscription=w,await this.plugin.saveSettings()})),new p.Setting(r).setName("Auto-Sync Flagged Notes").setDesc("Periodically push notes with sync_to_salesforce: true to Salesforce").addToggle(y=>y.setValue(this.plugin.settings.sfAutoSyncEnabled).onChange(async w=>{this.plugin.settings.sfAutoSyncEnabled=w,await this.plugin.saveSettings(),w?this.plugin.startSalesforceSyncScanner():this.plugin.updateSfSyncStatusBar("SF Sync: Off")})),new p.Setting(r).setName("Auto-Sync Interval").setDesc("How often to scan for flagged notes (in minutes)").addDropdown(y=>{y.addOption("5","Every 5 minutes"),y.addOption("15","Every 15 minutes"),y.addOption("30","Every 30 minutes"),y.setValue(String(this.plugin.settings.sfAutoSyncIntervalMinutes)),y.onChange(async w=>{this.plugin.settings.sfAutoSyncIntervalMinutes=parseInt(w),await this.plugin.saveSettings(),new p.Notice(`SF auto-sync interval set to ${w} minutes. Restart Obsidian for changes to take effect.`)})}),r.createEl("h3",{text:"Folders"}),new p.Setting(r).setName("Accounts Folder").setDesc("Where account folders are stored").addText(y=>y.setValue(this.plugin.settings.accountsFolder).onChange(async w=>{this.plugin.settings.accountsFolder=w||"Accounts",await this.plugin.saveSettings()})),new p.Setting(r).setName("Recordings Folder").setDesc("Where audio files are saved").addText(y=>y.setValue(this.plugin.settings.recordingsFolder).onChange(async w=>{this.plugin.settings.recordingsFolder=w||"Recordings",await this.plugin.saveSettings()})),r.createEl("h3",{text:"Actions"}),new p.Setting(r).setName("Sync Accounts Now").setDesc(`${this.plugin.settings.cachedAccounts.length} accounts available for matching`).addButton(y=>y.setButtonText("Sync").setCta().onClick(async()=>{await this.plugin.syncAccounts(),this.display()})),new p.Setting(r).setName("Refresh Account Folders").setDesc("Check for new account assignments and create folders for them").addButton(y=>y.setButtonText("Refresh Folders").onClick(async()=>{y.setButtonText("Checking..."),y.setDisabled(!0);try{let w=await this.plugin.refreshAccountFolders();w>0?new p.Notice(`Created ${w} new account folder${w>1?"s":""}`):new p.Notice("All account folders are up to date")}catch(w){new p.Notice("Failed to refresh folders: "+w.message)}y.setButtonText("Refresh Folders"),y.setDisabled(!1),this.display()})),this.plugin.settings.lastSyncTime&&r.createEl("p",{text:`Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()}`,cls:"setting-item-description"}),r.createEl("p",{text:`Audio transcription: ${I.isSupported()?"Supported":"Not supported"}`,cls:"setting-item-description"})}};
