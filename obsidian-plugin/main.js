var we=Object.create;var z=Object.defineProperty;var Se=Object.getOwnPropertyDescriptor;var Oe=Object.getOwnPropertyNames;var be=Object.getPrototypeOf,Ce=Object.prototype.hasOwnProperty;var Ae=(b,a)=>{for(var e in a)z(b,e,{get:a[e],enumerable:!0})},le=(b,a,e,t)=>{if(a&&typeof a=="object"||typeof a=="function")for(let n of Oe(a))!Ce.call(b,n)&&n!==e&&z(b,n,{get:()=>a[n],enumerable:!(t=Se(a,n))||t.enumerable});return b};var V=(b,a,e)=>(e=b!=null?we(be(b)):{},le(a||!b||!b.__esModule?z(e,"default",{value:b,enumerable:!0}):e,b)),xe=b=>le(z({},"__esModule",{value:!0}),b);var Ve={};Ae(Ve,{default:()=>Q});module.exports=xe(Ve);var u=require("obsidian");var X=[/blackhole/i,/vb-cable/i,/vb cable/i,/loopback/i,/soundflower/i,/virtual audio/i,/screen ?capture/i],W=class b{constructor(){this.mediaRecorder=null;this.audioChunks=[];this.stream=null;this.secondaryStream=null;this.startTime=0;this.pausedDuration=0;this.pauseStartTime=0;this.durationInterval=null;this.audioContext=null;this.analyser=null;this.levelInterval=null;this.lastExtractedChunkIndex=0;this.mimeTypeCache="audio/webm";this.activeCaptureMode="full_call";this.activeHasVirtualDevice=!1;this.activeSystemAudioMethod=null;this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0};this.stateCallback=null;this.eventCallback=null;this.deviceChangeHandler=null;this.activeDeviceLabel="";this.silenceCheckInterval=null;this.consecutiveSilentChecks=0;this.silenceAlerted=!1;this.levelHistory=[];this.trackingLevels=!1}static{this.SILENCE_THRESHOLD=5}static{this.SILENCE_ALERT_AFTER=6}static{this.HEADPHONE_PATTERNS=[/airpods/i,/beats/i,/headphone/i,/headset/i,/earbuds/i,/bluetooth/i,/bose/i,/sony wh/i,/jabra/i,/galaxy buds/i]}onStateChange(a){this.stateCallback=a}onEvent(a){this.eventCallback=a}emitEvent(a){if(this.eventCallback)try{this.eventCallback(a)}catch(e){console.error("[AudioRecorder] Event handler error:",e)}}static isHeadphoneDevice(a){return a?b.HEADPHONE_PATTERNS.some(e=>e.test(a)):!1}static isIOSOrSafari(){let a=navigator.userAgent,e=/iPad|iPhone|iPod/.test(a)&&!window.MSStream,t=/^((?!chrome|android).)*safari/i.test(a);return e||t}getSupportedMimeType(){let a=b.isIOSOrSafari(),e=a?["audio/mp4","audio/mp4;codecs=aac","audio/aac","audio/webm;codecs=opus","audio/webm"]:["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];for(let t of e)if(MediaRecorder.isTypeSupported(t))return console.log(`[AudioRecorder] Using MIME type: ${t} (iOS/Safari: ${a})`),t;return a?"audio/mp4":"audio/webm"}async startRecording(a){if(this.state.isRecording)throw new Error("Already recording");let e=a?.captureMode??"full_call";this.activeCaptureMode=e,this.activeHasVirtualDevice=!1,this.activeSystemAudioMethod=null;try{let t=b.isIOSOrSafari(),n;t?n={echoCancellation:!0,noiseSuppression:!0}:e==="full_call"?n={echoCancellation:!1,noiseSuppression:!1,autoGainControl:!0,sampleRate:48e3,channelCount:1}:n={echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0,sampleRate:48e3,channelCount:1},a?.micDeviceId&&(n.deviceId={exact:a.micDeviceId});let i=await navigator.mediaDevices.getUserMedia({audio:n});console.log(`[AudioRecorder] Mic granted | mode=${e} | echoCancellation=${e!=="full_call"}`);let r=i,s=a?.systemAudioDeviceId||(await b.detectVirtualAudioDevice())?.deviceId;if(s&&!t)try{let l=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:s},echoCancellation:!1,noiseSuppression:!1,autoGainControl:!1}});this.audioContext=new AudioContext;let c=this.audioContext.createMediaStreamSource(i),d=this.audioContext.createMediaStreamSource(l),p=this.audioContext.createMediaStreamDestination();c.connect(p),d.connect(p),r=p.stream,this.secondaryStream=l,this.activeHasVirtualDevice=!0,this.activeSystemAudioMethod="virtual_device",console.log("[AudioRecorder] Virtual device detected \u2014 dual-stream capture active")}catch(l){console.log(`[AudioRecorder] Virtual device open failed (${l.message}), continuing with mic only`)}if(!this.activeHasVirtualDevice&&e==="full_call"&&!t)try{console.log("[AudioRecorder] No virtual device \u2014 attempting native system audio capture");let l=await b.captureSystemAudio();if(l){this.audioContext=this.audioContext||new AudioContext;let c=this.audioContext.createMediaStreamSource(i),d=this.audioContext.createMediaStreamSource(l.stream),p=this.audioContext.createMediaStreamDestination();c.connect(p),d.connect(p),r=p.stream,this.secondaryStream=l.stream,this.activeHasVirtualDevice=!0,this.activeSystemAudioMethod=l.method,console.log(`[AudioRecorder] Native system audio via ${l.method} \u2014 dual-stream active`)}}catch(l){console.log(`[AudioRecorder] Native system audio failed (${l.message}), continuing with mic only`)}this.stream=r,this.setupAudioAnalysis();let o=this.getSupportedMimeType();this.mimeTypeCache=o,this.mediaRecorder=new MediaRecorder(this.stream,{mimeType:o,audioBitsPerSecond:128e3}),this.audioChunks=[],this.lastExtractedChunkIndex=0,this.mediaRecorder.ondataavailable=l=>{l.data.size>0&&this.audioChunks.push(l.data)},this.mediaRecorder.start(1e3),this.startTime=Date.now(),this.pausedDuration=0,this.state={isRecording:!0,isPaused:!1,duration:0,audioLevel:0},this.startDurationTracking(),this.startLevelTracking(),this.startLevelHistoryTracking(),this.captureActiveDeviceLabel(r),this.startDeviceMonitoring(),this.startSilenceWatchdog(),this.notifyStateChange()}catch(t){throw this.cleanup(),new Error(`Failed to start recording: ${t.message}`)}}static async detectVirtualAudioDevice(){try{let a=await navigator.mediaDevices.enumerateDevices();for(let e of a)if(e.kind==="audioinput"){for(let t of X)if(t.test(e.label))return{deviceId:e.deviceId,label:e.label,isVirtual:!0}}}catch(a){console.warn("[AudioRecorder] enumerateDevices failed:",a)}return null}static async getAvailableDevices(){try{return(await navigator.mediaDevices.enumerateDevices()).filter(e=>e.kind==="audioinput").map(e=>{let t=X.some(n=>n.test(e.label));return{deviceId:e.deviceId,label:e.label||"Unknown Microphone",isVirtual:t}})}catch(a){return console.warn("[AudioRecorder] enumerateDevices failed:",a),[]}}static{this._displayMediaHandlerReady=!1}static async setupDisplayMediaHandler(){if(b._displayMediaHandlerReady)return!0;let a=window.require;if(!a)return!1;try{let e=a("@electron/remote");if(e?.session?.defaultSession?.setDisplayMediaRequestHandler&&e?.desktopCapturer?.getSources)return e.session.defaultSession.setDisplayMediaRequestHandler(async(t,n)=>{try{let i=await e.desktopCapturer.getSources({types:["screen"],thumbnailSize:{width:0,height:0}});n(i?.length?{video:i[0],audio:"loopback"}:null)}catch{n(null)}}),b._displayMediaHandlerReady=!0,console.log("[AudioRecorder] Display media handler installed via @electron/remote \u2014 loopback audio enabled"),!0}catch(e){console.log(`[AudioRecorder] @electron/remote handler setup failed: ${e.message}`)}try{let t=a("electron")?.remote;if(t?.session?.defaultSession?.setDisplayMediaRequestHandler&&t?.desktopCapturer?.getSources)return t.session.defaultSession.setDisplayMediaRequestHandler(async(n,i)=>{try{let r=await t.desktopCapturer.getSources({types:["screen"],thumbnailSize:{width:0,height:0}});i(r?.length?{video:r[0],audio:"loopback"}:null)}catch{i(null)}}),b._displayMediaHandlerReady=!0,console.log("[AudioRecorder] Display media handler installed via electron.remote \u2014 loopback audio enabled"),!0}catch(e){console.log(`[AudioRecorder] electron.remote handler setup failed: ${e.message}`)}return console.log("[AudioRecorder] Could not set up display media handler \u2014 remote module not accessible"),!1}static async tryDesktopCapturerWithSource(){let a=window.require;if(!a)return null;let e=null;try{let t=a("electron")?.desktopCapturer;t?.getSources&&(e=await t.getSources({types:["screen"],thumbnailSize:{width:0,height:0}}),e?.length&&console.log(`[AudioRecorder] desktopCapturer.getSources: ${e.length} screen(s)`))}catch(t){console.log(`[AudioRecorder] direct desktopCapturer failed: ${t.message}`)}if(!e?.length)try{let t=a("@electron/remote")?.desktopCapturer;t?.getSources&&(e=await t.getSources({types:["screen"],thumbnailSize:{width:0,height:0}}),e?.length&&console.log(`[AudioRecorder] @electron/remote desktopCapturer: ${e.length} screen(s)`))}catch{}if(!e?.length)try{let t=a("electron")?.remote?.desktopCapturer;t?.getSources&&(e=await t.getSources({types:["screen"],thumbnailSize:{width:0,height:0}}),e?.length&&console.log(`[AudioRecorder] electron.remote desktopCapturer: ${e.length} screen(s)`))}catch{}if(!e?.length)try{let t=a("electron")?.ipcRenderer;t?.invoke&&(e=await t.invoke("DESKTOP_CAPTURER_GET_SOURCES",{types:["screen"]}),e?.length&&console.log(`[AudioRecorder] IPC desktopCapturer: ${e.length} screen(s)`))}catch{}if(!e?.length)return console.log("[AudioRecorder] No desktopCapturer path yielded sources"),null;try{let t=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:"desktop",chromeMediaSourceId:e[0].id}},video:{mandatory:{chromeMediaSource:"desktop",chromeMediaSourceId:e[0].id,maxWidth:1,maxHeight:1,maxFrameRate:1}}});t.getVideoTracks().forEach(i=>i.stop());let n=t.getAudioTracks();if(n.length>0)return console.log("[AudioRecorder] desktopCapturer + getUserMedia audio capture active"),new MediaStream(n)}catch(t){console.log(`[AudioRecorder] getUserMedia with chromeMediaSource failed: ${t.message}`)}return null}static async tryDesktopCapturerNoSourceId(){try{let a=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:"desktop"}},video:{mandatory:{chromeMediaSource:"desktop",maxWidth:1,maxHeight:1,maxFrameRate:1}}});a.getVideoTracks().forEach(t=>t.stop());let e=a.getAudioTracks();if(e.length>0)return console.log("[AudioRecorder] getUserMedia chromeMediaSource:desktop (no source ID) audio active"),new MediaStream(e)}catch(a){console.log(`[AudioRecorder] chromeMediaSource:desktop (no source) failed: ${a.message}`)}return null}static async tryGetDisplayMedia(){if(!navigator.mediaDevices?.getDisplayMedia)return null;try{let a=await navigator.mediaDevices.getDisplayMedia({audio:{suppressLocalAudioPlayback:!1},video:{width:{ideal:1},height:{ideal:1},frameRate:{ideal:1}},systemAudio:"include"});a.getVideoTracks().forEach(t=>t.stop());let e=a.getAudioTracks();if(e.length>0)return console.log(`[AudioRecorder] getDisplayMedia audio capture active (handler=${b._displayMediaHandlerReady})`),new MediaStream(e);console.log("[AudioRecorder] getDisplayMedia returned no audio tracks")}catch(a){a.name==="NotAllowedError"?console.log("[AudioRecorder] getDisplayMedia: not allowed (no handler set or user denied)"):console.log(`[AudioRecorder] getDisplayMedia failed: ${a.name}: ${a.message}`)}return null}static async captureSystemAudio(){let a=await b.tryDesktopCapturerWithSource();if(a)return{stream:a,method:"electron"};let e=await b.tryDesktopCapturerNoSourceId();if(e)return{stream:e,method:"electron"};let t=await b.tryGetDisplayMedia();return t?{stream:t,method:"display_media"}:(console.log("[AudioRecorder] All system audio strategies exhausted \u2014 mic only"),null)}static async probeSystemAudioCapabilities(){let a={electronAvailable:!1,desktopCapturerAvailable:!1,desktopCapturerSources:0,remoteAvailable:!1,remoteSessionAvailable:!1,ipcRendererAvailable:!1,getDisplayMediaAvailable:!1,electronVersion:null,chromiumVersion:null,platform:window.process?.platform||navigator.platform||"unknown",handlerSetupResult:"not attempted",bestPath:"mic_only"},e=window.require;if(!e)return a.bestPath="mic_only (require not available)",a;try{let t=e("electron");if(a.electronAvailable=!!t,a.ipcRendererAvailable=!!t?.ipcRenderer?.invoke,t?.desktopCapturer?.getSources){a.desktopCapturerAvailable=!0;try{let n=await t.desktopCapturer.getSources({types:["screen"],thumbnailSize:{width:0,height:0}});a.desktopCapturerSources=n?.length||0}catch{}}}catch{}try{let t=e("@electron/remote");a.remoteAvailable=!!t,a.remoteSessionAvailable=!!t?.session?.defaultSession?.setDisplayMediaRequestHandler}catch{}if(!a.remoteAvailable)try{let t=e("electron")?.remote;a.remoteAvailable=!!t,a.remoteSessionAvailable=!!t?.session?.defaultSession?.setDisplayMediaRequestHandler}catch{}try{let t=window.process?.versions;a.electronVersion=t?.electron||null,a.chromiumVersion=t?.chrome||null}catch{}if(a.getDisplayMediaAvailable=!!navigator.mediaDevices?.getDisplayMedia,a.remoteSessionAvailable){let t=await b.setupDisplayMediaHandler();a.handlerSetupResult=t?"SUCCESS":"failed"}else a.handlerSetupResult="remote not available";return a.desktopCapturerAvailable&&a.desktopCapturerSources>0?a.bestPath="electron_desktopCapturer (zero-click)":b._displayMediaHandlerReady?a.bestPath="getDisplayMedia + loopback handler (zero-click)":a.getDisplayMediaAvailable?a.bestPath="getDisplayMedia (may show system picker)":a.bestPath="mic_only",a}getSystemAudioMethod(){return this.activeSystemAudioMethod}static isHandlerReady(){return b._displayMediaHandlerReady}setupAudioAnalysis(){if(this.stream)try{this.audioContext=new AudioContext;let a=this.audioContext.createMediaStreamSource(this.stream);this.analyser=this.audioContext.createAnalyser(),this.analyser.fftSize=256,a.connect(this.analyser)}catch(a){console.warn("Failed to set up audio analysis:",a)}}startDurationTracking(){this.durationInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused){let a=Date.now()-this.startTime-this.pausedDuration;this.state.duration=Math.floor(a/1e3),this.notifyStateChange(),this.state.duration>=5400&&(console.log("[Eudia] Maximum recording duration reached (90 minutes) \u2014 auto-stopping"),this.stop())}},100)}startLevelTracking(){if(!this.analyser)return;let a=new Uint8Array(this.analyser.frequencyBinCount);this.levelInterval=setInterval(()=>{if(this.state.isRecording&&!this.state.isPaused&&this.analyser){this.analyser.getByteFrequencyData(a);let e=0;for(let n=0;n<a.length;n++)e+=a[n];let t=e/a.length;this.state.audioLevel=Math.min(100,Math.round(t/255*100*2)),this.notifyStateChange()}},50)}startDeviceMonitoring(){this.deviceChangeHandler=async()=>{if(this.state.isRecording)try{let e=(await navigator.mediaDevices.enumerateDevices()).filter(r=>r.kind==="audioinput"),t=e.map(r=>r.label),n=this.activeDeviceLabel&&!t.some(r=>r===this.activeDeviceLabel);this.emitEvent({type:"deviceChanged",newDevices:e.map(r=>({deviceId:r.deviceId,label:r.label,isVirtual:X.some(s=>s.test(r.label))})),activeDeviceLost:!!n});let i=e.find(r=>b.isHeadphoneDevice(r.label)&&r.label!==this.activeDeviceLabel);i&&this.emitEvent({type:"headphoneDetected",deviceLabel:i.label})}catch(a){console.warn("[AudioRecorder] Device change detection failed:",a)}},navigator.mediaDevices.addEventListener("devicechange",this.deviceChangeHandler)}stopDeviceMonitoring(){this.deviceChangeHandler&&(navigator.mediaDevices.removeEventListener("devicechange",this.deviceChangeHandler),this.deviceChangeHandler=null)}startSilenceWatchdog(){this.consecutiveSilentChecks=0,this.silenceAlerted=!1,this.silenceCheckInterval=setInterval(()=>{!this.state.isRecording||this.state.isPaused||(this.state.audioLevel<b.SILENCE_THRESHOLD?(this.consecutiveSilentChecks++,this.consecutiveSilentChecks>=b.SILENCE_ALERT_AFTER&&!this.silenceAlerted&&(this.silenceAlerted=!0,this.emitEvent({type:"silenceDetected",durationSeconds:this.consecutiveSilentChecks*5}))):(this.silenceAlerted&&this.emitEvent({type:"audioRestored"}),this.consecutiveSilentChecks=0,this.silenceAlerted=!1))},5e3)}stopSilenceWatchdog(){this.silenceCheckInterval&&(clearInterval(this.silenceCheckInterval),this.silenceCheckInterval=null)}captureActiveDeviceLabel(a){let e=a.getAudioTracks()[0];this.activeDeviceLabel=e?.label||"",b.isHeadphoneDevice(this.activeDeviceLabel)&&this.emitEvent({type:"headphoneDetected",deviceLabel:this.activeDeviceLabel})}pauseRecording(){!this.state.isRecording||this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="recording"&&(this.mediaRecorder.pause(),this.pauseStartTime=Date.now(),this.state.isPaused=!0,this.notifyStateChange())}resumeRecording(){!this.state.isRecording||!this.state.isPaused||this.mediaRecorder&&this.mediaRecorder.state==="paused"&&(this.mediaRecorder.resume(),this.pausedDuration+=Date.now()-this.pauseStartTime,this.state.isPaused=!1,this.notifyStateChange())}async stopRecording(){return new Promise((a,e)=>{if(!this.mediaRecorder||!this.state.isRecording){e(new Error("Not currently recording"));return}let t=this.mediaRecorder.mimeType,n=this.state.duration,i=this.activeCaptureMode,r=this.activeHasVirtualDevice,s=this.activeSystemAudioMethod,o=!1,l=d=>{let p=new Date,g=p.toISOString().split("T")[0],y=p.toTimeString().split(" ")[0].replace(/:/g,"-"),m=t.includes("webm")?"webm":t.includes("mp4")?"m4a":t.includes("ogg")?"ogg":"webm";return{audioBlob:d,duration:n,mimeType:t,filename:`recording-${g}-${y}.${m}`,captureMode:i,hasVirtualDevice:r,systemAudioMethod:s}},c=setTimeout(()=>{if(!o){o=!0,console.warn("AudioRecorder: onstop timeout, forcing completion");try{let d=new Blob(this.audioChunks,{type:t});this.cleanup(),a(l(d))}catch{this.cleanup(),e(new Error("Failed to process recording after timeout"))}}},1e4);this.mediaRecorder.onstop=()=>{if(!o){o=!0,clearTimeout(c);try{console.log(`[AudioRecorder] Chunks collected: ${this.audioChunks.length}`);let d=new Blob(this.audioChunks,{type:t});console.log(`[AudioRecorder] Blob size: ${d.size} bytes`),this.cleanup(),a(l(d))}catch(d){this.cleanup(),e(d)}}},this.mediaRecorder.onerror=d=>{o||(o=!0,clearTimeout(c),this.cleanup(),e(new Error("Recording error occurred")))},this.mediaRecorder.state==="recording"&&this.mediaRecorder.requestData(),setTimeout(()=>{this.mediaRecorder&&this.mediaRecorder.state!=="inactive"&&this.mediaRecorder.stop()},100)})}cancelRecording(){this.cleanup()}cleanup(){this.durationInterval&&(clearInterval(this.durationInterval),this.durationInterval=null),this.levelInterval&&(clearInterval(this.levelInterval),this.levelInterval=null),this.stopDeviceMonitoring(),this.stopSilenceWatchdog(),this.audioContext&&(this.audioContext.close().catch(()=>{}),this.audioContext=null,this.analyser=null),this.stream&&(this.stream.getTracks().forEach(a=>a.stop()),this.stream=null),this.secondaryStream&&(this.secondaryStream.getTracks().forEach(a=>a.stop()),this.secondaryStream=null),this.mediaRecorder=null,this.audioChunks=[],this.activeDeviceLabel="",this.state={isRecording:!1,isPaused:!1,duration:0,audioLevel:0},this.notifyStateChange()}getState(){return{...this.state}}static isSupported(){if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder)return!1;let e=["audio/webm","audio/mp4","audio/ogg","audio/webm;codecs=opus"].some(t=>MediaRecorder.isTypeSupported(t));return e||console.warn("[AudioRecorder] No supported audio formats found"),e}static getMobileInstructions(){return this.isIOSOrSafari()?"For best results on iOS, ensure you have granted microphone permissions in Settings > Privacy > Microphone.":null}notifyStateChange(){this.stateCallback&&this.stateCallback({...this.state})}static formatDuration(a){let e=Math.floor(a/60),t=a%60;return`${e.toString().padStart(2,"0")}:${t.toString().padStart(2,"0")}`}static async blobToBase64(a){return new Promise((e,t)=>{let n=new FileReader;n.onload=()=>{let r=n.result.split(",")[1];e(r)},n.onerror=t,n.readAsDataURL(a)})}static async blobToArrayBuffer(a){return a.arrayBuffer()}async start(a){return this.startRecording(a)}async stop(){return this.stopRecording()}pause(){return this.pauseRecording()}resume(){return this.resumeRecording()}cancel(){return this.cancelRecording()}isRecording(){return this.state.isRecording}extractNewChunks(){if(!this.state.isRecording||this.audioChunks.length===0)return null;let a=this.audioChunks.slice(this.lastExtractedChunkIndex);return a.length===0?null:(this.lastExtractedChunkIndex=this.audioChunks.length,new Blob(a,{type:this.mimeTypeCache}))}getAllChunksAsBlob(){return this.audioChunks.length===0?null:new Blob(this.audioChunks,{type:this.mimeTypeCache})}getDuration(){return this.state.duration}getMimeType(){return this.mimeTypeCache}startLevelHistoryTracking(){this.levelHistory=[],this.trackingLevels=!0}recordLevelSample(){this.trackingLevels&&this.levelHistory.push(this.state.audioLevel)}getAudioDiagnostic(){if(this.levelHistory.length===0)return{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:100,warning:"Unable to analyze audio levels - recording may be too short"};let a=this.levelHistory.reduce((r,s)=>r+s,0)/this.levelHistory.length,e=Math.max(...this.levelHistory),t=this.levelHistory.filter(r=>r<5).length,n=Math.round(t/this.levelHistory.length*100),i=null;return e<5?i="SILENT AUDIO: No audio was detected during recording. Check your microphone settings and ensure Obsidian has microphone permission.":a<10&&n>80?i="VERY LOW AUDIO: Audio levels were extremely low. The transcription may not be accurate. Check your microphone or move closer to it.":n>90&&(i="MOSTLY SILENT: Over 90% of the recording had no audio. Make sure you're capturing the meeting audio, not just silence."),{hasAudio:e>=5,averageLevel:Math.round(a),peakLevel:e,silentPercent:n,warning:i}}static async analyzeAudioBlob(a){try{let e=new AudioContext,t=await a.arrayBuffer(),n;try{n=await e.decodeAudioData(t)}catch{return await e.close(),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:"Could not analyze audio format. Proceeding with transcription."}}let i=n.getChannelData(0),r=0,s=0,o=0,l=.01,c=100,d=0;for(let O=0;O<i.length;O+=c){let f=Math.abs(i[O]);r+=f,f>s&&(s=f),f<l&&o++,d++}await e.close();let p=r/d,g=Math.round(o/d*100),y=Math.round(p*100*10),m=Math.round(s*100),w=null;return s<.01?w='SILENT AUDIO DETECTED: The recording appears to contain only silence. This typically causes Whisper to hallucinate random text like "Yes. Yes. Yes." Check your audio input source.':p<.005&&g>95?w="NEAR-SILENT AUDIO: The recording is almost entirely silent. The transcription will likely be inaccurate.":g>90&&(w="MOSTLY SILENT: Over 90% of the recording is silent. Consider checking your audio setup."),{hasAudio:s>=.01,averageLevel:y,peakLevel:m,silentPercent:g,warning:w}}catch(e){return console.error("Audio analysis failed:",e),{hasAudio:!0,averageLevel:0,peakLevel:0,silentPercent:0,warning:null}}}};var P=require("obsidian");var Z=class{constructor(){this.salesforceAccounts=[]}setAccounts(a){this.salesforceAccounts=a}detectAccount(a,e,t){if(a){let n=this.detectFromTitle(a);if(n.confidence>=70)return n}if(t){let n=this.detectFromFilePath(t);if(n.confidence>=70)return n}if(e&&e.length>0){let n=this.detectFromAttendees(e);if(n.confidence>=50)return n}return{account:null,accountId:null,confidence:0,source:"none",evidence:"No account detected from available context"}}detectFromTitle(a){if(!a)return{account:null,accountId:null,confidence:0,source:"title",evidence:"No title"};let e=[{regex:/^([A-Za-z0-9][^-–—]+?)\s*[-–—]\s*(?:[A-Z][a-z]+|[A-Za-z]{2,})/,confidence:85},{regex:/(?:call|meeting|sync|check-in|demo|discovery)\s+(?:with|re:?|@)\s+([^-–—]+?)(?:\s*[-–—]|$)/i,confidence:80},{regex:/^([A-Za-z][^-–—]+?)\s+(?:discovery|demo|review|kickoff|intro|onboarding|sync)\s*(?:call)?$/i,confidence:75},{regex:/^([^:]+?):\s+/i,confidence:70},{regex:/^\[([^\]]+)\]/,confidence:75}],t=["weekly","daily","monthly","internal","team","1:1","one on one","standup","sync","meeting","call","notes","monday","tuesday","wednesday","thursday","friday","untitled","new","test"];for(let n of e){let i=a.match(n.regex);if(i&&i[1]){let r=i[1].trim();if(t.some(o=>r.toLowerCase()===o)||r.length<2)continue;let s=this.fuzzyMatchSalesforce(r);return s?{account:s.name,accountId:s.id,confidence:Math.min(n.confidence+10,100),source:"salesforce_match",evidence:`Matched "${r}" from title to Salesforce account "${s.name}"`}:{account:r,accountId:null,confidence:n.confidence,source:"title",evidence:"Extracted from meeting title pattern"}}}return{account:null,accountId:null,confidence:0,source:"title",evidence:"No pattern matched"}}detectFromFilePath(a){let e=a.match(/Accounts\/([^\/]+)\//i);if(e&&e[1]){let t=e[1].trim(),n=this.fuzzyMatchSalesforce(t);return n?{account:n.name,accountId:n.id,confidence:95,source:"salesforce_match",evidence:`File in account folder "${t}" matched to "${n.name}"`}:{account:t,accountId:null,confidence:85,source:"title",evidence:`File located in Accounts/${t} folder`}}return{account:null,accountId:null,confidence:0,source:"none",evidence:"Not in Accounts folder"}}detectFromAttendees(a){let e=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com"],t=new Set;for(let s of a){let l=s.toLowerCase().match(/@([a-z0-9.-]+)/);if(l){let c=l[1];!c.includes("eudia.com")&&!e.includes(c)&&t.add(c)}}if(t.size===0)return{account:null,accountId:null,confidence:0,source:"attendee_domain",evidence:"No external domains"};for(let s of t){let o=s.split(".")[0],l=o.charAt(0).toUpperCase()+o.slice(1),c=this.fuzzyMatchSalesforce(l);if(c)return{account:c.name,accountId:c.id,confidence:75,source:"salesforce_match",evidence:`Matched attendee domain ${s} to "${c.name}"`}}let n=Array.from(t)[0],i=n.split(".")[0];return{account:i.charAt(0).toUpperCase()+i.slice(1),accountId:null,confidence:50,source:"attendee_domain",evidence:`Guessed from external attendee domain: ${n}`}}fuzzyMatchSalesforce(a){if(!a||this.salesforceAccounts.length===0)return null;let e=a.toLowerCase().trim();for(let t of this.salesforceAccounts)if(t.name?.toLowerCase()===e)return t;for(let t of this.salesforceAccounts)if(t.name?.toLowerCase().startsWith(e))return t;for(let t of this.salesforceAccounts)if(t.name?.toLowerCase().includes(e))return t;for(let t of this.salesforceAccounts)if(e.includes(t.name?.toLowerCase()))return t;return null}suggestAccounts(a,e=10){if(!a||a.length<2)return this.salesforceAccounts.slice(0,e).map(i=>({...i,score:0}));let t=a.toLowerCase(),n=[];for(let i of this.salesforceAccounts){let r=i.name?.toLowerCase()||"",s=0;r===t?s=100:r.startsWith(t)?s=90:r.includes(t)?s=70:t.includes(r)&&(s=50),s>0&&n.push({...i,score:s})}return n.sort((i,r)=>r.score-i.score).slice(0,e)}},Je=new Z,Ee=["pipeline review","pipeline call","weekly pipeline","forecast call","forecast review","deal review","opportunity review","sales review","pipeline sync","forecast sync","deal sync","pipeline update","forecast meeting"];function de(b,a){if(b){let e=b.toLowerCase();for(let t of Ee)if(e.includes(t))return{isPipelineMeeting:!0,confidence:95,evidence:`Title contains "${t}"`}}if(a&&a.length>=2){let e=["eudia.com","johnsonhana.com"];if(a.every(n=>{let i=n.toLowerCase().split("@")[1]||"";return e.some(r=>i.includes(r))})&&a.length>=3){if(b){let n=b.toLowerCase();if(["sync","review","update","weekly","team","forecast"].some(s=>n.includes(s)))return{isPipelineMeeting:!0,confidence:70,evidence:`All internal attendees (${a.length}) with team meeting signal`}}return{isPipelineMeeting:!1,confidence:40,evidence:"All internal attendees but no clear pipeline signal"}}}return{isPipelineMeeting:!1,confidence:0,evidence:"No pipeline meeting indicators found"}}function ke(b,a){let e="";return(a?.account||a?.opportunities?.length)&&(e=`
ACCOUNT CONTEXT (use to inform your analysis):
${a.account?`- Account: ${a.account.name}`:""}
${a.account?.owner?`- Account Owner: ${a.account.owner}`:""}
${a.opportunities?.length?`- Open Opportunities: ${a.opportunities.map(t=>`${t.name} (${t.stage}, $${(t.acv/1e3).toFixed(0)}k)`).join("; ")}`:""}
${a.contacts?.length?`- Known Contacts: ${a.contacts.slice(0,5).map(t=>`${t.name} - ${t.title}`).join("; ")}`:""}
`),`You are a senior sales intelligence analyst for Eudia, an AI-powered legal technology company. Your role is to extract precise, actionable intelligence from sales meeting transcripts.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies. Our products help in-house legal teams work faster on contracting, compliance, and M&A due diligence. We sell to CLOs, General Counsels, VP Legal, Legal Ops Directors, and Deputy GCs.

${b?`CURRENT ACCOUNT: ${b}`:""}
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
- Action items have clear owners`}function We(b,a){let e="";return a?.account&&(e=`
ACCOUNT CONTEXT:
- Account: ${a.account.name}
${a.account.owner?`- Owner: ${a.account.owner}`:""}
`),`You are a sales intelligence analyst for Eudia, an AI-powered legal technology company. You are analyzing a DEMO or PRESENTATION call.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies \u2014 contracting, compliance, and M&A due diligence.

${b?`CURRENT ACCOUNT: ${b}`:""}
${e}

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
`}function Ie(b,a){let e="";return a?.account&&(e=`
ACCOUNT CONTEXT:
- Account: ${a.account.name}
${a.account.owner?`- Owner: ${a.account.owner}`:""}
`),`You are a business meeting analyst. You are analyzing a GENERAL CHECK-IN or relationship meeting \u2014 not a sales discovery or demo.

${b?`ACCOUNT: ${b}`:""}
${e}

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
`}function Te(b,a){let e="";return a?.account&&(e=`
ACCOUNT CONTEXT:
- Account: ${a.account.name}
${a.account.owner?`- Owner: ${a.account.owner}`:""}
`),`You are a Customer Success analyst for Eudia, an AI-powered legal technology company. You are analyzing a CUSTOMER SUCCESS call \u2014 not a sales discovery or demo.

Focus on the customer's experience, adoption, satisfaction, feature needs, and relationship health. This is NOT a sales qualification call.

${b?`ACCOUNT: ${b}`:""}
${e}

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
6. For strategic takeaways, only include implications that were actually discussed or clearly implied \u2014 do not speculate.`}function $e(b){return`You are a sales operations analyst producing the weekly pipeline review summary for Eudia, an AI-powered legal technology company. You are processing the transcript of an internal team pipeline review meeting.
${b?`

SALESFORCE PIPELINE DATA (current as of today):
${b}

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
10. If the meeting discussed general topics like demo stability, growth motion, enablement, or hiring \u2014 capture these in the Growth & Cross-Team section, not mixed into account tables.`}var q=class b{constructor(a){this.serverUrl=a}setServerUrl(a){this.serverUrl=a}async transcribeAndSummarize(a,e,t,n,i,r,s){try{let o=i?.meetingType==="pipeline_review",l;o?l=$e(i?.pipelineContext):s==="demo"?l=We(t,i):s==="general"?l=Ie(t,i):s==="internal"?l=je():s==="cs"?l=Te(t,i):l=ke(t,i);let c=await(0,P.requestUrl)({url:`${this.serverUrl}/api/transcribe-and-summarize`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:a,mimeType:e,accountName:o?"Pipeline Review":t,accountId:n,meetingType:i?.meetingType||"discovery",userEmail:i?.userEmail||"",captureMode:r?.captureMode||"mic_only",hasVirtualDevice:r?.hasVirtualDevice||!1,context:i?{customerBrain:i.account?.customerBrain,opportunities:i.opportunities,contacts:i.contacts,userEmail:i.userEmail}:void 0,systemPrompt:l})});return c.json.success?{success:!0,transcript:c.json.transcript||"",sections:this.normalizeSections(c.json.sections),duration:c.json.duration||0,diarizedTranscript:c.json.diarization?.formattedTranscript||void 0}:{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:c.json.error||"Transcription failed"}}catch(o){console.error("Server transcription error:",o),o.response&&console.error("Server response:",o.response);let l="";try{o.response?.json?.error?l=o.response.json.error:typeof o.response=="string"&&(l=JSON.parse(o.response).error||"")}catch{}let c=l||`Transcription failed: ${o.message}`;return o.message?.includes("413")?c="Audio file too large for server. Try a shorter recording.":o.message?.includes("500")?c=l||"Server error during transcription. Please try again.":(o.message?.includes("Failed to fetch")||o.message?.includes("NetworkError"))&&(c="Could not reach transcription server. Check your internet connection."),console.error("Final error message:",c),{success:!1,transcript:"",sections:this.getEmptySections(),duration:0,error:c}}}parseSections(a){let e=this.getEmptySections(),t={summary:"summary",attendees:"attendees","key stakeholders":"attendees","discussion context":"discussionContext","key quotes":"keyQuotes","quotable moments":"keyQuotes","meddicc signals":"meddiccSignals","product interest":"productInterest","pain points":"painPoints","customer feedback":"painPoints","buying triggers":"buyingTriggers","key dates":"keyDates","next steps":"nextSteps","action items":"actionItems","action items (internal)":"actionItems","deal signals":"dealSignals","risks & objections":"risksObjections","risks and objections":"risksObjections","competitive intelligence":"competitiveIntel","draft follow-up email":"emailDraft","follow-up email":"emailDraft"},n=/## ([^\n]+)\n([\s\S]*?)(?=## |$)/g,i;for(;(i=n.exec(a))!==null;){let r=i[1].trim().toLowerCase(),s=i[2].trim(),o=t[r];o&&(e[o]=s)}return e}normalizeSections(a){let e=this.getEmptySections();return a?{...e,...a}:e}async getMeetingContext(a){try{let e=await(0,P.requestUrl)({url:`${this.serverUrl}/api/meeting-context/${a}`,method:"GET",headers:{Accept:"application/json"}});return e.json.success?{success:!0,account:e.json.account,opportunities:e.json.opportunities,contacts:e.json.contacts,lastMeeting:e.json.lastMeeting}:{success:!1,error:e.json.error||"Failed to fetch context"}}catch(e){return console.error("Meeting context error:",e),{success:!1,error:e.message||"Network error"}}}async syncToSalesforce(a,e,t,n,i,r){try{let s=await(0,P.requestUrl)({url:`${this.serverUrl}/api/transcription/sync-to-salesforce`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:a,accountName:e,noteTitle:t,sections:n,transcript:i,meetingDate:r||new Date().toISOString(),syncedAt:new Date().toISOString()})});return s.json.success?{success:!0,customerBrainUpdated:s.json.customerBrainUpdated,eventCreated:s.json.eventCreated,eventId:s.json.eventId,contactsCreated:s.json.contactsCreated,tasksCreated:s.json.tasksCreated}:{success:!1,error:s.json.error||"Sync failed"}}catch(s){return console.error("Salesforce sync error:",s),{success:!1,error:s.message||"Network error"}}}getEmptySections(){return{summary:"",attendees:"",discussionContext:"",keyQuotes:"",meddiccSignals:"",productInterest:"",painPoints:"",buyingTriggers:"",keyDates:"",nextSteps:"",actionItems:"",dealSignals:"",risksObjections:"",competitiveIntel:"",emailDraft:""}}async liveQueryTranscript(a,e,t){if(!e||e.trim().length<50)return{success:!1,answer:"",error:"Not enough transcript captured yet. Keep recording for a few more minutes."};try{let n=await(0,P.requestUrl)({url:`${this.serverUrl}/api/live-query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:a,transcript:e,accountName:t,systemPrompt:this.buildLiveQueryPrompt()})});return n.json.success?{success:!0,answer:n.json.answer||"No relevant information found in the transcript."}:{success:!1,answer:"",error:n.json.error||"Query failed"}}catch(n){return console.error("Live query error:",n),{success:!1,answer:"",error:n.message||"Failed to query transcript"}}}async transcribeChunk(a,e){try{let t=await(0,P.requestUrl)({url:`${this.serverUrl}/api/transcribe-chunk`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:a,mimeType:e})});return t.json.success?{success:!0,text:t.json.text||""}:{success:!1,text:"",error:t.json.error||"Chunk transcription failed"}}catch(t){return console.error("Chunk transcription error:",t),{success:!1,text:"",error:t.message||"Failed to transcribe chunk"}}}buildLiveQueryPrompt(){return`You are an AI assistant helping a salesperson during an active customer call. 
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

`;let r=t.talkTime.repPercent,s=t.talkTime.customerPercent,o=t.talkTime.isHealthyRatio?"\u2705":"\u26A0\uFE0F";n+=`**Talk Time:** Rep ${r}% / Customer ${s}% ${o}
`;let l=Math.round(r/5),c=Math.round(s/5);if(n+=`\`${"\u2588".repeat(l)}${"\u2591".repeat(20-l)}\` Rep
`,n+=`\`${"\u2588".repeat(c)}${"\u2591".repeat(20-c)}\` Customer

`,t.coaching){let d=t.coaching;if(d.totalQuestions>0){let p=Math.round(d.openQuestions/d.totalQuestions*100);n+=`**Questions:** ${d.totalQuestions} total (${d.openQuestions} open, ${d.closedQuestions} closed - ${p}% open)
`}if(d.objections&&d.objections.length>0){let p=d.objections.filter(g=>g.handled).length;n+=`**Objections:** ${d.objections.length} raised, ${p} handled
`}d.valueScore!==void 0&&(n+=`**Value Articulation:** ${d.valueScore}/10
`),d.nextStepClear!==void 0&&(n+=`**Next Step Clarity:** ${d.nextStepClear?"\u2705 Clear":"\u26A0\uFE0F Unclear"}
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

`);let i=t?.enabled&&t?.formattedTranscript?t.formattedTranscript:e;if(i){let r=t?.enabled?"Full Transcript (Speaker-Attributed)":"Full Transcript";n+=`---

<details>
<summary><strong>${r}</strong></summary>

${i}

</details>
`}return n}static formatSectionsWithAudio(a,e,t,n){let i=this.formatSectionsForNote(a,e,n);return t&&(i+=`
---

## Recording

![[${t}]]
`),i}static formatContextForNote(a){if(!a.success)return"";let e=`## Pre-Call Context

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

`,e}async blobToBase64(a){return new Promise((e,t)=>{let n=new FileReader;n.onload=()=>{let r=n.result.split(",")[1];e(r)},n.onerror=t,n.readAsDataURL(a)})}async transcribeAudio(a,e){let t=a.size/1024/1024,n=a.type||"audio/webm";if(t>15)return console.log(`[Eudia] Large recording (${t.toFixed(1)}MB) \u2014 using chunked transcription`),this.transcribeAudioChunked(a,n,e);try{let i=await this.blobToBase64(a),r=e?.meetingType==="pipeline_review"?{success:!0,meetingType:"pipeline_review",pipelineContext:e.pipelineContext}:void 0,s=await this.transcribeAndSummarize(i,n,e?.accountName,e?.accountId,r,{captureMode:e?.captureMode,hasVirtualDevice:e?.hasVirtualDevice},e?.meetingTemplate);return{text:s.transcript,confidence:s.success?.95:0,duration:s.duration,sections:s.sections,diarizedTranscript:s.diarizedTranscript,error:s.error}}catch(i){return console.error("transcribeAudio error:",i),{text:"",confidence:0,duration:0,sections:this.getEmptySections(),error:i.message||"Transcription request failed"}}}static{this.CHUNK_MAX_RETRIES=3}static{this.CHUNK_RETRY_DELAYS=[5e3,15e3,3e4]}async transcribeChunkWithRetry(a,e,t,n){for(let i=0;i<=b.CHUNK_MAX_RETRIES;i++){if(i>0){let r=b.CHUNK_RETRY_DELAYS[i-1]||3e4;console.log(`[Eudia] Chunk ${t+1}/${n} retry ${i}/${b.CHUNK_MAX_RETRIES} in ${r/1e3}s...`),await new Promise(s=>setTimeout(s,r))}try{let r=await(0,P.requestUrl)({url:`${this.serverUrl}/api/transcribe-chunk`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({audio:a,mimeType:e})}),s=r.json?.text||r.json?.transcript||"";if(r.json?.success&&s)return i>0&&console.log(`[Eudia] Chunk ${t+1}/${n} succeeded on retry ${i}`),{text:s,duration:r.json.duration||0};console.warn(`[Eudia] Chunk ${t+1}/${n} attempt ${i+1} returned no text: ${r.json?.error||"unknown"}`)}catch(r){console.warn(`[Eudia] Chunk ${t+1}/${n} attempt ${i+1} failed: ${r.message}`)}}return null}async transcribeAudioChunked(a,e,t){let i=await a.arrayBuffer(),r=i.byteLength,s=Math.ceil(r/8388608);console.log(`[Eudia] Chunked transcription: ${(r/1024/1024).toFixed(1)}MB \u2192 ${s} chunks`);let o=16*1024,l=r/o,c=[],d=0,p=0;for(let m=0;m<s;m++){let w=m*8388608,O=Math.min(w+8388608,r),f=i.slice(w,O),C=new Blob([f],{type:e});console.log(`[Eudia] Transcribing chunk ${m+1}/${s} (${((O-w)/1024/1024).toFixed(1)}MB)`);let v=await this.blobToBase64(C),h=await this.transcribeChunkWithRetry(v,e,m,s);if(h)c.push(h.text),d+=h.duration,console.log(`[Eudia] Chunk ${m+1}/${s} OK: ${h.text.length} chars`);else{p++;let S=Math.round(w/r*l),x=Math.round(O/r*l),E=`${Math.floor(S/60)}:${(S%60).toString().padStart(2,"0")}`,k=`${Math.floor(x/60)}:${(x%60).toString().padStart(2,"0")}`,j=`

[~${E} \u2013 ${k} \u2014 audio not transcribed (chunk ${m+1}/${s} failed after ${b.CHUNK_MAX_RETRIES+1} attempts)]

`;c.push(j),console.error(`[Eudia] Chunk ${m+1}/${s} permanently failed \u2014 gap marker inserted`)}}if(c.filter(m=>!m.includes("\u2014 audio not transcribed")).length===0)return{text:"",confidence:0,duration:0,sections:this.getEmptySections(),error:`All ${s} chunks failed to transcribe after retries. Server may be unavailable.`};p>0&&console.warn(`[Eudia] ${p}/${s} chunks failed after retries \u2014 partial transcript with gap markers`);let y=c.join(`

`);console.log(`[Eudia] Combined transcript: ${y.length} chars from ${s} chunks (${p} gaps)`);try{let m=await this.processTranscription(y,{accountName:t?.accountName,accountId:t?.accountId});return{text:y,confidence:p===0?.9:Math.max(.3,.9-p/s*.6),duration:d,sections:m,...p>0?{error:`${p} of ${s} audio chunks could not be transcribed. Look for [audio not transcribed] markers in the transcript.`}:{}}}catch(m){return console.error("[Eudia] Summarization failed after chunked transcription:",m.message),{text:y,confidence:.5,duration:d,sections:this.getEmptySections(),error:`Transcription succeeded but summarization failed: ${m.message}`}}}async processTranscription(a,e){if(!a||a.trim().length===0)return this.getEmptySections();try{let t=await(0,P.requestUrl)({url:`${this.serverUrl}/api/process-sections`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript:a,accountName:e?.accountName,context:e})});if(t.json?.success&&t.json?.sections){let n=t.json.sections;return{summary:n.summary||"",painPoints:n.painPoints||n.keyPoints||"",productInterest:n.productInterest||"",meddiccSignals:n.meddiccSignals||"",nextSteps:n.nextSteps||"",actionItems:n.actionItems||"",keyDates:n.keyDates||"",buyingTriggers:n.buyingTriggers||"",dealSignals:n.dealSignals||"",risksObjections:n.risksObjections||n.concerns||"",competitiveIntel:n.competitiveIntel||"",attendees:n.attendees||"",transcript:a}}return console.warn("Server process-sections returned no sections, using fallback"),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:a}}catch(t){return console.error("processTranscription server error:",t),{summary:"Meeting transcript captured. Review for key details.",painPoints:"",productInterest:"",meddiccSignals:"",nextSteps:"",actionItems:"",keyDates:"",buyingTriggers:"",dealSignals:"",risksObjections:"",competitiveIntel:"",attendees:"",transcript:a}}}};var Y=require("obsidian"),F=class b{constructor(a,e,t="America/New_York"){this.serverUrl=a,this.userEmail=e.toLowerCase(),this.timezone=t}setUserEmail(a){this.userEmail=a.toLowerCase()}setServerUrl(a){this.serverUrl=a}setTimezone(a){this.timezone=a}async getTodaysMeetings(a=!1){if(!this.userEmail)return{success:!1,date:new Date().toISOString().split("T")[0],email:"",meetingCount:0,meetings:[],error:"User email not configured"};try{let e=encodeURIComponent(this.timezone),t=a?"&forceRefresh=true":"";return(await(0,Y.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/today?timezone=${e}${t}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(e){return console.error("Failed to fetch today's meetings:",e),{success:!1,date:new Date().toISOString().split("T")[0],email:this.userEmail,meetingCount:0,meetings:[],error:e.message||"Failed to fetch calendar"}}}async getWeekMeetings(a=!1){if(!this.userEmail)return{success:!1,startDate:"",endDate:"",email:"",totalMeetings:0,byDay:{},error:"User email not configured"};try{let e=encodeURIComponent(this.timezone),t=a?"&forceRefresh=true":"";return(await(0,Y.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/week?timezone=${e}${t}`,method:"GET",headers:{Accept:"application/json"}})).json}catch(e){return console.error("Failed to fetch week's meetings:",e),{success:!1,startDate:"",endDate:"",email:this.userEmail,totalMeetings:0,byDay:{},error:e.message||"Failed to fetch calendar"}}}async getMeetingsInRange(a,e){if(!this.userEmail)return[];try{let t=a.toISOString().split("T")[0],n=e.toISOString().split("T")[0],i=await(0,Y.requestUrl)({url:`${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${t}&end=${n}`,method:"GET",headers:{Accept:"application/json"}});return i.json.success?i.json.meetings||[]:[]}catch(t){return console.error("Failed to fetch calendar range:",t),[]}}async getCurrentMeeting(){let a=await this.getTodaysMeetings();if(!a.success||a.meetings.length===0)return{meeting:null,isNow:!1};let e=new Date;for(let t of a.meetings){let n=b.safeParseDate(t.start),i=b.safeParseDate(t.end);if(e>=n&&e<=i)return{meeting:t,isNow:!0};let r=(n.getTime()-e.getTime())/(1e3*60);if(r>0&&r<=15)return{meeting:t,isNow:!1,minutesUntilStart:Math.ceil(r)}}return{meeting:null,isNow:!1}}async getMeetingsForAccount(a){let e=await this.getWeekMeetings();if(!e.success)return[];let t=[];Object.values(e.byDay).forEach(i=>{t.push(...i)});let n=a.toLowerCase();return t.filter(i=>i.accountName?.toLowerCase().includes(n)||i.subject.toLowerCase().includes(n)||i.attendees.some(r=>r.email.toLowerCase().includes(n.split(" ")[0])))}static formatMeetingForNote(a){let e=a.attendees.filter(t=>t.isExternal!==!1).map(t=>t.name||t.email.split("@")[0]).slice(0,5).join(", ");return{title:a.subject,attendees:e,meetingStart:a.start,accountName:a.accountName}}static getDayName(a){let e;a.length===10&&a.includes("-")?e=new Date(a+"T00:00:00"):e=new Date(a);let t=new Date;t.setHours(0,0,0,0);let n=new Date(e);n.setHours(0,0,0,0);let i=Math.round((n.getTime()-t.getTime())/(1e3*60*60*24));return i===0?"Today":i===1?"Tomorrow":e.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}static formatTime(a,e){let t=a;t&&!t.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(t)&&(t=t+"Z");let n=new Date(t);if(isNaN(n.getTime()))return a;let i={hour:"numeric",minute:"2-digit",hour12:!0};return e&&(i.timeZone=e),n.toLocaleTimeString("en-US",i)}static safeParseDate(a){if(!a)return new Date(NaN);let e=a;return!e.endsWith("Z")&&!/[+-]\d{2}:\d{2}$/.test(e)&&(e=e+"Z"),new Date(e)}static getMeetingDuration(a,e){let t=b.safeParseDate(a),n=b.safeParseDate(e);return Math.round((n.getTime()-t.getTime())/(1e3*60))}};var Ne=["ai-contracting-tech","ai-contracting-services","ai-compliance-tech","ai-compliance-services","ai-ma-tech","ai-ma-services","sigma"],Pe=["metrics-identified","economic-buyer-identified","decision-criteria-discussed","decision-process-discussed","pain-confirmed","champion-identified","competition-mentioned"],De=["progressing","stalled","at-risk","champion-engaged","early-stage"],Fe=["discovery","demo","negotiation","qbr","implementation","follow-up"],Me=`You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

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
}`,J=class{constructor(a,e){this.openaiApiKey=null;this.serverUrl=a,this.openaiApiKey=e||null}setOpenAIKey(a){this.openaiApiKey=a}setServerUrl(a){this.serverUrl=a}async extractTags(a){let e=this.buildTagContext(a);if(!e.trim())return{success:!1,tags:this.getEmptyTags(),error:"No content to analyze"};try{return await this.extractTagsViaServer(e)}catch(t){return console.warn("Server tag extraction failed, trying local:",t.message),this.openaiApiKey?await this.extractTagsLocal(e):this.extractTagsRuleBased(a)}}buildTagContext(a){let e=[];return a.summary&&e.push(`SUMMARY:
${a.summary}`),a.productInterest&&e.push(`PRODUCT INTEREST:
${a.productInterest}`),a.meddiccSignals&&e.push(`MEDDICC SIGNALS:
${a.meddiccSignals}`),a.dealSignals&&e.push(`DEAL SIGNALS:
${a.dealSignals}`),a.painPoints&&e.push(`PAIN POINTS:
${a.painPoints}`),a.attendees&&e.push(`ATTENDEES:
${a.attendees}`),e.join(`

`)}async extractTagsViaServer(a){let e=await fetch(`${this.serverUrl}/api/extract-tags`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:a,openaiApiKey:this.openaiApiKey})});if(!e.ok)throw new Error(`Server returned ${e.status}`);let t=await e.json();if(!t.success)throw new Error(t.error||"Tag extraction failed");return{success:!0,tags:this.validateAndNormalizeTags(t.tags)}}async extractTagsLocal(a){if(!this.openaiApiKey)return{success:!1,tags:this.getEmptyTags(),error:"No OpenAI API key configured"};try{let e=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${this.openaiApiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:Me},{role:"user",content:`Extract tags from this meeting content:

${a}`}],temperature:.1,response_format:{type:"json_object"}})});if(!e.ok)throw new Error(`OpenAI returned ${e.status}`);let n=(await e.json()).choices?.[0]?.message?.content;if(!n)throw new Error("No content in response");let i=JSON.parse(n);return{success:!0,tags:this.validateAndNormalizeTags(i)}}catch(e){return console.error("Local tag extraction error:",e),{success:!1,tags:this.getEmptyTags(),error:e.message||"Tag extraction failed"}}}extractTagsRuleBased(a){let e=Object.values(a).join(" ").toLowerCase(),t={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:.4};return(e.includes("contract")||e.includes("contracting"))&&(e.includes("service")?t.product_interest.push("ai-contracting-services"):t.product_interest.push("ai-contracting-tech")),e.includes("compliance")&&t.product_interest.push("ai-compliance-tech"),(e.includes("m&a")||e.includes("due diligence")||e.includes("acquisition"))&&t.product_interest.push("ai-ma-tech"),e.includes("sigma")&&t.product_interest.push("sigma"),(e.includes("metric")||e.includes("%")||e.includes("roi")||e.includes("save"))&&t.meddicc_signals.push("metrics-identified"),(e.includes("budget")||e.includes("cfo")||e.includes("economic buyer"))&&t.meddicc_signals.push("economic-buyer-identified"),(e.includes("pain")||e.includes("challenge")||e.includes("problem")||e.includes("struggle"))&&t.meddicc_signals.push("pain-confirmed"),(e.includes("champion")||e.includes("advocate")||e.includes("sponsor"))&&t.meddicc_signals.push("champion-identified"),(e.includes("competitor")||e.includes("alternative")||e.includes("vs")||e.includes("compared to"))&&t.meddicc_signals.push("competition-mentioned"),(e.includes("next step")||e.includes("follow up")||e.includes("schedule"))&&(t.deal_health="progressing"),(e.includes("concern")||e.includes("objection")||e.includes("hesitant")||e.includes("risk"))&&(t.deal_health="at-risk"),e.includes("demo")||e.includes("show you")||e.includes("demonstration")?t.meeting_type="demo":e.includes("pricing")||e.includes("negotiat")||e.includes("contract terms")?t.meeting_type="negotiation":e.includes("quarterly")||e.includes("qbr")||e.includes("review")?t.meeting_type="qbr":(e.includes("implementation")||e.includes("onboard")||e.includes("rollout"))&&(t.meeting_type="implementation"),{success:!0,tags:t}}validateAndNormalizeTags(a){let e={product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:a.confidence||.8};return Array.isArray(a.product_interest)&&(e.product_interest=a.product_interest.filter(t=>Ne.includes(t))),Array.isArray(a.meddicc_signals)&&(e.meddicc_signals=a.meddicc_signals.filter(t=>Pe.includes(t))),De.includes(a.deal_health)&&(e.deal_health=a.deal_health),Fe.includes(a.meeting_type)&&(e.meeting_type=a.meeting_type),Array.isArray(a.key_stakeholders)&&(e.key_stakeholders=a.key_stakeholders.slice(0,10)),e}getEmptyTags(){return{product_interest:[],meddicc_signals:[],deal_health:"early-stage",meeting_type:"discovery",key_stakeholders:[],confidence:0}}static formatTagsForFrontmatter(a){return{product_interest:a.product_interest.length>0?a.product_interest:null,meddicc_signals:a.meddicc_signals.length>0?a.meddicc_signals:null,deal_health:a.deal_health,meeting_type:a.meeting_type,key_stakeholders:a.key_stakeholders.length>0?a.key_stakeholders:null,tag_confidence:Math.round(a.confidence*100)}}static generateTagSummary(a){let e=[];return a.product_interest.length>0&&e.push(`**Products:** ${a.product_interest.join(", ")}`),a.meddicc_signals.length>0&&e.push(`**MEDDICC:** ${a.meddicc_signals.join(", ")}`),e.push(`**Deal Health:** ${a.deal_health}`),e.push(`**Meeting Type:** ${a.meeting_type}`),e.join(" | ")}};var ue=["keigan.pesenti@eudia.com","michael.ayres@eudia.com","michael.ayers@eudia.com","mike.flynn@eudia.com","michael.flynn@eudia.com","zack@eudia.com","zach@eudia.com","ben.brosnahan@eudia.com"],pe=["omar@eudia.com","david@eudia.com","ashish@eudia.com","siddharth.saxena@eudia.com"],me={"mitchell.loquaci@eudia.com":{name:"Mitchell Loquaci",region:"US",role:"RVP Sales"},"stephen.mulholland@eudia.com":{name:"Stephen Mulholland",region:"EMEA",role:"VP Sales"},"riona.mchale@eudia.com":{name:"Riona McHale",region:"IRE_UK",role:"Head of Sales"}},he=["nikhita.godiwala@eudia.com","jon.dedych@eudia.com","farah.haddad@eudia.com"],Re=["nikhita.godiwala@eudia.com"],He={"nikhita.godiwala@eudia.com":["jon.dedych@eudia.com","farah.haddad@eudia.com"]},D=[{id:"001Hp00003kIrQDIA0",name:"Accenture",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"accenture.com",industry:"Information Technology Services",csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrEOIA0",name:"AES",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"alesaei-aes.com",industry:"Utilities: Gas and Electric",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrCyIAK",name:"Airbnb",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"airbnb.com",industry:"Internet Services and Retailing",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFrdIAG",name:"Airship Group Inc",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"airship.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrEeIAK",name:"Amazon",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"amazon.com",industry:"Internet Services and Retailing",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000TUdXwIAL",name:"Anthropic",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"anthropic.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000wvc5aIAA",name:"AppliedAI",type:"New",isOwned:!1,hadOpportunity:!0,website:"https://www.applied-ai.com/",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000mCFsTIAW",name:"Arabic Computer Systems",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"acs.com.sa",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Hp00003kIrEyIAK",name:"Aramark Ireland",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"aramark.ie",industry:"Diversified Outsourcing Services",csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000p1hYbIAI",name:"Army Corps of Engineers",type:"New",isOwned:!1,hadOpportunity:!0,website:"https://www.usace.army.mil/",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Wj00000mCFrgIAG",name:"Aryza",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"aryza.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000Y0g8ZIAR",name:"Asana",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"asana.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mI7NaIAK",name:"Aviva Insurance",type:"New",isOwned:!1,hadOpportunity:!0,website:"aviva.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000fFuFMIA0",name:"Bank of Ireland",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"bankofireland.com",industry:"Banking",csmName:null,ownerName:"Tom Clancy"},{id:"001Hp00003kJ9pXIAS",name:"Bayer",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"bayer.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrFVIA0",name:"Best Buy",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"bestbuy.com",industry:"Specialty Retailers: Other",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000WTMCRIA5",name:"BNY Mellon",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"bny.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kIrE3IAK",name:"Cargill",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"cargill.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrE4IAK",name:"Chevron",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"chevron.com",industry:"Petroleum Refining",csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrGKIA0",name:"CHS",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"chsinc.com",industry:"Food Production",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrE5IAK",name:"Coherent",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"coherent.com",industry:"Semiconductors and Lasers",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFrkIAG",name:"Coillte",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"coillte.ie",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000mHDBoIAO",name:"Coimisiun na Mean",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"cnam.ie",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFtTIAW",name:"Coleman Legal",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"colemanlegalpllc.com",industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"001Wj00000mCFqtIAG",name:"CommScope Technologies",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"commscope.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFsHIAW",name:"Consensys",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:null,industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrGeIAK",name:"Corebridge Financial",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"corebridgefinancial.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000c9oCvIAI",name:"Cox Media Group",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"cmg.com",industry:null,csmName:null,ownerName:"Justin Hills"},{id:"001Wj00000pLPAyIAO",name:"Creed McStay",type:"New",isOwned:!1,hadOpportunity:!0,website:"creedmcstay.ie",industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"001Wj00000mCFsBIAW",name:"Datalex",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"datalex.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000mCFrlIAG",name:"Davy",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"davy.ie",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000Y0jPmIAJ",name:"Delinea",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"delinea.com",industry:null,csmName:null,ownerName:"Justin Hills"},{id:"001Wj00000mCFscIAG",name:"Department of Children, Disability and Equality",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"https://www.gov.ie/en/department-of-children-disability-and-equality/",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Wj00000mCFsNIAW",name:"Department of Climate, Energy and the Environment",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"https://www.gov.ie/en/department-of-climate-energy-and-the-environment/",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Hp00003kIrE6IAK",name:"DHL",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"dhl.com",industry:"Logistics and Shipping",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000aZvt9IAC",name:"Dolby",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"dolbyblaissegee.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrDMIA0",name:"Dropbox",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"dropbox.com",industry:"Cloud Storage and Software",csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrDaIAK",name:"Duracell",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"duracell.com",industry:"Consumer goods",csmName:null,ownerName:"Justin Hills"},{id:"001Hp00003kIrE7IAK",name:"ECMS",type:"Customer - No Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"ecmsglobal-jp.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Hp00003kIrHNIA0",name:"Ecolab",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"ecolab.com",industry:"Chemicals",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFszIAG",name:"Electricity Supply Board",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"esb.ie",industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"001Wj00000mCFsUIAW",name:"ESB NI/Electric Ireland",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"esb.ie",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Wj00000hkk0jIAA",name:"Etsy",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"etsy.com",industry:"information technology & services",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrIAIA0",name:"Fox",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"foxcorporation.com",industry:"Entertainment",csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kJ9oeIAC",name:"Fresh Del Monte",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"freshdelmonte.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kIrIJIA0",name:"GE Vernova",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"gevernova.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Hp00003kIrISIA0",name:"Gilead Sciences",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"gilead.com",industry:"Pharmaceuticals",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000mCFrcIAG",name:"Glanbia",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"glanbia.com",industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"001Wj00000mCFt1IAG",name:"Goodbody Stockbrokers",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"goodbody.ie",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Hp00003kIrE8IAK",name:"Graybar Electric",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"graybar.com",industry:"Wholesalers: Diversified",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000mCFseIAG",name:"Hayes Solicitors LLP",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"hayes-solicitors.ie",industry:null,csmName:null,ownerName:"Keigan Pesenti"},{id:"001Hp00003kIrCnIAK",name:"Home Depot",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"thdroadcompanion.com",industry:"Specialty Retailers: Other",csmName:null,ownerName:"Mitch Loquaci"},{id:"001Wj00000mCFs5IAG",name:"Indeed",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"indeed.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrJ9IAK",name:"Intuit",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"intuit.com",industry:"Computer Software",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrE9IAK",name:"IQVIA",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"onekeydata.com",industry:"Health Care: Pharmacy and Other Services",csmName:null,ownerName:"Sean Boyd"},{id:"001Wj00000mCFtMIAW",name:"Kellanova",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"www.kellanova.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrJOIA0",name:"Keurig Dr Pepper",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"keurigdrpepper.com",industry:"Beverages",csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000hkk0zIAA",name:"Kingspan",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"kingspan.com",industry:"building materials",csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFsoIAG",name:"Mediolanum",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"mediolanum.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrD8IAK",name:"Medtronic",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"medtronic.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kJ9lGIAS",name:"Meta",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"meta.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrDeIAK",name:"National Grid",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"nationalgrid.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000VVJ31IAH",name:"NATO",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"https://www.nato.int/",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Hp00003kIrKmIAK",name:"Northern Trust Management Services",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"northerntrust.com",industry:"Commercial Banks",csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000cpxt0IAA",name:"Novelis",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"novelis.com",industry:null,csmName:null,ownerName:"Mitch Loquaci"},{id:"001Wj00000mCFr6IAG",name:"NTMA",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"ntma.ie",industry:null,csmName:null,ownerName:"Emer Flynn"},{id:"001Wj00000TV1WzIAL",name:"OpenAi",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"openai.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000mCFrIIAW",name:"Orsted",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"orsted.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000bzz9MIAQ",name:"Peregrine Hospitality",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"peregrinehg.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000ZDPUIIA5",name:"Perrigo Pharma",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"perrigo.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrLNIA0",name:"Petsmart",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"petsmart.com",industry:"Retailing",csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000kNp2XIAS",name:"Plusgrade",type:"New",isOwned:!1,hadOpportunity:!0,website:"plusgrade.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Hp00003kKXSIIA4",name:"Pure Storage",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"purestorage.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000u0eJpIAI",name:"Re-Turn",type:"New",isOwned:!1,hadOpportunity:!0,website:"https://re-turn.ie/",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Hp00003kIrD9IAK",name:"Salesforce",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"salesforce.com",industry:"Computer Software",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mI9NmIAK",name:"Sequoia Climate Fund",type:"New",isOwned:!1,hadOpportunity:!0,website:"sequoiaclimate.org",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrMKIA0",name:"ServiceNow",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"servicenow.com",industry:"Computer Software",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000mCFrMIAW",name:"Sisk Group",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"sisk.com",industry:null,csmName:null,ownerName:"Alex Fox"},{id:"001Hp00003kIrECIA0",name:"Southwest Airlines",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"southwest.com",industry:"Airlines",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000lxbYRIAY",name:"Spark Brighter Thinking",type:"New",isOwned:!1,hadOpportunity:!0,website:"hellospark.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000c9oD6IAI",name:"Stripe",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"stripe.com",industry:null,csmName:null,ownerName:"Nicola Fratini"},{id:"001Wj00000bzz9TIAQ",name:"Tailored Brands",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"tailoredbrands.com",industry:null,csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000mCFs0IAG",name:"Taoglas Limited",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"taoglas.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000iS9AJIA0",name:"TE Connectivity",type:"New",isOwned:!1,hadOpportunity:!0,website:"te.com",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000mCFtPIAW",name:"Teamwork.com",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"teamwork.com",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Wj00000PjGDaIAN",name:"The Weir Group PLC",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"global.weir",industry:null,csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrNBIA0",name:"The Wonderful Company",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"wonderful.com",industry:"Multicompany",csmName:null,ownerName:"Julie Stefanich"},{id:"001Wj00000SFiOvIAL",name:"TikTok",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"tiktok.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000ZDXTRIA5",name:"Tinder LLC",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"tinder.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Hp00003kIrCwIAK",name:"Toshiba US",type:"Customer - Active Pipeline",isOwned:!1,hadOpportunity:!0,website:"toshiba.com",industry:"Electronics and IT Solutions",csmName:null,ownerName:"Olivia Jung"},{id:"001Wj00000bWBkeIAG",name:"U.S. Air Force",type:"New",isOwned:!1,hadOpportunity:!0,website:"eprc.or.ug",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Wj00000bWBlEIAW",name:"Udemy",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"udemy.com",industry:null,csmName:null,ownerName:"Nathan Shine"},{id:"001Wj00000mCFtOIAW",name:"Uisce Eireann (Irish Water)",type:"Johnson Hana Owned",isOwned:!1,hadOpportunity:!0,website:"water.ie",industry:null,csmName:null,ownerName:"Tom Clancy"},{id:"001Wj00000bn8VSIAY",name:"Vista Equity Partners",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"vistaequitypartners.com",industry:null,csmName:null,ownerName:"Ananth Cherukupally"},{id:"001Wj00000p1SuZIAU",name:"Vulcan Special Ops",type:"New",isOwned:!1,hadOpportunity:!0,website:"vulcan-v.com",industry:null,csmName:null,ownerName:"Mike Masiello"},{id:"001Hp00003kIrNwIAK",name:"W.W. Grainger",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"grainger.com",industry:"Wholesalers: Diversified",csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000bzz9NIAQ",name:"Wealth Partners Capital Group",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"wealthpcg.com",industry:null,csmName:null,ownerName:"Asad Hussain"},{id:"001Wj00000ZLVpTIAX",name:"Wellspring Philanthropic Fund",type:"Prospect - Discovery",isOwned:!1,hadOpportunity:!0,website:"wpfund.org",industry:null,csmName:null,ownerName:"Conor Molloy"},{id:"001Hp00003kIrOAIA0",name:"Western Digital",type:"Prospect - SQO",isOwned:!1,hadOpportunity:!0,website:"westerndigital.com",industry:"Computers, Office Equipment",csmName:null,ownerName:"Olivia Jung"},{id:"001Hp00003kIrOLIA0",name:"World Wide Technology",type:"Prospect",isOwned:!1,hadOpportunity:!0,website:"wwt.com",industry:"Technology Hardware & Equipment",csmName:null,ownerName:"Julie Stefanich"}],Le={US:["asad.hussain@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com","rajeev.patel@eudia.com"],EMEA:["greg.machale@eudia.com","tom.clancy@eudia.com","nicola.fratini@eudia.com","nathan.shine@eudia.com","stephen.mulholland@eudia.com"],IRE_UK:["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com","riona.mchale@eudia.com"]},ee={"mitchell.loquaci@eudia.com":["asad.hussain@eudia.com","julie.stefanich@eudia.com","olivia@eudia.com","ananth@eudia.com","ananth.cherukupally@eudia.com","justin.hills@eudia.com","mike.masiello@eudia.com","mike@eudia.com","sean.boyd@eudia.com","riley.stack@eudia.com","rajeev.patel@eudia.com"],"stephen.mulholland@eudia.com":["greg.machale@eudia.com","tom.clancy@eudia.com","conor.molloy@eudia.com","nathan.shine@eudia.com","nicola.fratini@eudia.com"],"riona.mchale@eudia.com":["conor.molloy@eudia.com","alex.fox@eudia.com","emer.flynn@eudia.com"]},Be={"sean.boyd@eudia.com":"US","riley.stack@eudia.com":"US","rajeev.patel@eudia.com":"US"};function _e(b){let a=b.toLowerCase().trim();return ue.includes(a)?"admin":pe.includes(a)?"exec":a in me?"sales_leader":he.includes(a)?"cs":"bl"}function Ue(b){let a=b.toLowerCase().trim();return me[a]?.region||null}function ge(b){return Le[b]||[]}function Ge(b){let a=b.toLowerCase().trim();if(ee[a])return ee[a];let e=Ue(a);return e?ge(e):[]}function M(b){let a=b.toLowerCase().trim();return ue.includes(a)||pe.includes(a)}function _(b){let a=b.toLowerCase().trim();return he.includes(a)}function U(b){let a=b.toLowerCase().trim();return Re.includes(a)}function ye(b){let a=b.toLowerCase().trim();return He[a]||[]}var N={version:"2026-02-09",lastUpdated:"2026-02-09",businessLeads:{"alex.fox@eudia.com":{email:"alex.fox@eudia.com",name:"Alex Fox",accounts:[{id:"001Wj00000mCFsT",name:"Arabic Computer Systems",hadOpportunity:!0},{id:"001Wj00000mCFsO",name:"Brown Thomas",hadOpportunity:!0},{id:"001Wj00000mCFt2",name:"Byrne Wallace Shields",hadOpportunity:!0},{id:"001Wj00000mCFsu",name:"Corrigan & Corrigan Solicitors LLP",hadOpportunity:!0},{id:"001Wj00000pzTPY",name:"Defence Forces Tribunal",hadOpportunity:!1},{id:"001Wj00000mCFsc",name:"Department of Children, Disability and Equality",hadOpportunity:!0},{id:"001Wj00000mCFsN",name:"Department of Climate, Energy and the Environment",hadOpportunity:!0},{id:"001Wj00000mCFrZ",name:"Department of Housing",hadOpportunity:!0},{id:"001Wj00000mCFsU",name:"ESB NI/Electric Ireland",hadOpportunity:!0},{id:"001Wj00000pzTPV",name:"MW Keller",hadOpportunity:!1},{id:"001Wj00000pzTPX",name:"Murphy's Ice Cream",hadOpportunity:!1},{id:"001Wj00000mCFrM",name:"Sisk Group",hadOpportunity:!0}]},"ananth.cherukupally@eudia.com":{email:"ananth.cherukupally@eudia.com",name:"Ananth Cherukupally",accounts:[{id:"001Wj00000PfssX",name:"AGC Partners",hadOpportunity:!1},{id:"001Wj00000ahBZt",name:"AMETEK",hadOpportunity:!1},{id:"001Wj00000ahBZr",name:"Accel-KKR",hadOpportunity:!1},{id:"001Wj00000bwVu4",name:"Addtech",hadOpportunity:!1},{id:"001Wj00000YNV7Z",name:"Advent",hadOpportunity:!0},{id:"001Wj00000VZScK",name:"Affinity Consulting Group",hadOpportunity:!1},{id:"001Wj00000lyFyt",name:"Albacore Capital Group",hadOpportunity:!0},{id:"001Wj00000nlL88",name:"Alder",hadOpportunity:!0},{id:"001Wj00000XumF6",name:"Alpine Investors",hadOpportunity:!0},{id:"001Wj00000QTbLP",name:"Alvarez AI Advisors",hadOpportunity:!1},{id:"001Wj00000ahFCJ",name:"American Pacific Group",hadOpportunity:!1},{id:"001Wj00000ah6dg",name:"Angeles Equity Partners",hadOpportunity:!1},{id:"001Hp00003kIrEu",name:"Apollo Global Management",hadOpportunity:!0},{id:"001Wj00000cl5pq",name:"Arizona MBDA Business Center",hadOpportunity:!1},{id:"001Wj00000nlRev",name:"Attack Capital",hadOpportunity:!0},{id:"001Wj00000ahFBx",name:"Audax Group",hadOpportunity:!1},{id:"001Wj00000YhZAE",name:"Beacon Software",hadOpportunity:!0},{id:"001Wj00000cfg0c",name:"Beekers Capital",hadOpportunity:!1},{id:"001Wj00000bwVsk",name:"Bertram Capital",hadOpportunity:!1},{id:"001Wj00000ahBa0",name:"Bessemer Venture Partners",hadOpportunity:!1},{id:"001Wj00000lzDWj",name:"BlueEarth Capital",hadOpportunity:!0},{id:"001Wj00000ah6dZ",name:"Brentwood Associates",hadOpportunity:!1},{id:"001Wj00000ah6dL",name:"Brown & Brown",hadOpportunity:!1},{id:"001Hp00003kIrCh",name:"CBRE Group",hadOpportunity:!0},{id:"001Wj00000cejJz",name:"CVC",hadOpportunity:!0},{id:"001Wj00000ahFCV",name:"Caltius Equity Partners",hadOpportunity:!1},{id:"001Wj00000ahFBz",name:"Capstone Partners",hadOpportunity:!1},{id:"001Wj00000nlB0g",name:"Capvest",hadOpportunity:!0},{id:"001Hp00003kIrFy",name:"Cardinal Health",hadOpportunity:!0},{id:"001Hp00003kIrDg",name:"Carlyle",hadOpportunity:!0},{id:"001Wj00000PbIZ8",name:"Cascadia Capital",hadOpportunity:!1},{id:"001Wj00000ah6dW",name:"Catterton",hadOpportunity:!1},{id:"001Wj00000ahFC7",name:"Century Park Capital Partners",hadOpportunity:!1},{id:"001Wj00000Rjuhj",name:"Citadel",hadOpportunity:!0},{id:"001Wj00000ah6dn",name:"Clearlake Capital Group",hadOpportunity:!1},{id:"001Wj00000ah6dY",name:"Cognex Corporation",hadOpportunity:!1},{id:"001Wj00000ah6do",name:"Comvest Partners",hadOpportunity:!1},{id:"001Wj00000ah6dv",name:"Constellation Software",hadOpportunity:!0},{id:"001Wj00000ahFCI",name:"Cortec Group",hadOpportunity:!1},{id:"001Wj00000ahBa4",name:"Crosslink Capital",hadOpportunity:!1},{id:"001Wj00000ahFCR",name:"DCA Partners",hadOpportunity:!1},{id:"001Wj00000ah6dc",name:"DFO Management",hadOpportunity:!1},{id:"001Wj00000W8fEu",name:"Davis Polk",hadOpportunity:!1},{id:"001Wj00000crdDR",name:"Delcor",hadOpportunity:!0},{id:"001Wj00000ahFCM",name:"Diploma",hadOpportunity:!1},{id:"001Wj00000kcANH",name:"Discord",hadOpportunity:!0},{id:"001Wj00000ahFCU",name:"Doughty Hanson & Co",hadOpportunity:!1},{id:"001Wj00000ah6dd",name:"Edgewater Capital Partners",hadOpportunity:!1},{id:"001Wj00000Y64qh",name:"Emigrant Bank",hadOpportunity:!0},{id:"001Wj00000ah6dM",name:"Encore Consumer Capital",hadOpportunity:!1},{id:"001Wj00000ahFCL",name:"Endeavour Capital",hadOpportunity:!1},{id:"001Wj00000ah6di",name:"FFL Partners",hadOpportunity:!1},{id:"001Wj00000ah6dV",name:"Falfurrias Capital Partners",hadOpportunity:!1},{id:"001Wj00000ah6dU",name:"FirstService Corporation",hadOpportunity:!1},{id:"001Wj00000nlLZU",name:"Five Capital",hadOpportunity:!0},{id:"001Wj00000ahFCK",name:"Flexpoint Ford",hadOpportunity:!1},{id:"001Wj00000QkjJL",name:"Floodgate",hadOpportunity:!1},{id:"001Wj00000bwVu6",name:"Fortive Corporation",hadOpportunity:!1},{id:"001Wj00000ahFCa",name:"Foundry Group",hadOpportunity:!1},{id:"001Hp00003kIrID",name:"Freeport-McMoRan",hadOpportunity:!0},{id:"001Wj00000bwVuN",name:"Fremont Partners",hadOpportunity:!1},{id:"001Wj00000ahFCO",name:"Frontenac Company",hadOpportunity:!1},{id:"001Hp00003kIrII",name:"GE Healthcare",hadOpportunity:!0},{id:"001Hp00003kIrIJ",name:"GE Vernova",hadOpportunity:!0},{id:"001Wj00000lz2Jb",name:"GTIS Partners",hadOpportunity:!0},{id:"001Wj00000ah6dh",name:"Gallant Capital Partners",hadOpportunity:!1},{id:"001Hp00003kJ9oP",name:"General Catalyst",hadOpportunity:!0},{id:"001Wj00000ah6dr",name:"Genstar Capital",hadOpportunity:!1},{id:"001Hp00003kIrIT",name:"GlaxoSmithKline",hadOpportunity:!0},{id:"001Wj00000ahFCb",name:"Goldner Hawn Johnson & Morrison",hadOpportunity:!1},{id:"001Wj00000ah6du",name:"Great Point Partners",hadOpportunity:!1},{id:"001Wj00000ahBZx",name:"Greenoaks Capital",hadOpportunity:!0},{id:"001Wj00000ahFCB",name:"Greenspring Associates",hadOpportunity:!1},{id:"001Wj00000ahFCX",name:"Group 206",hadOpportunity:!1},{id:"001Wj00000ahBZz",name:"Gryphon Investors",hadOpportunity:!1},{id:"001Wj00000ah6dT",name:"HEICO Corporation",hadOpportunity:!1},{id:"001Wj00000cy4m1",name:"HG",hadOpportunity:!0},{id:"001Wj00000ahBZn",name:"HGGC",hadOpportunity:!1},{id:"001Wj00000ah6df",name:"Halma",hadOpportunity:!1},{id:"001Wj00000ah48X",name:"Harvest Partners",hadOpportunity:!1},{id:"001Wj00000ahFCS",name:"HealthpointCapital",hadOpportunity:!1},{id:"001Wj00000lzDtJ",name:"Heidrick & Struggles",hadOpportunity:!0},{id:"001Hp00003kIrIl",name:"Hellman & Friedman",hadOpportunity:!0},{id:"001Wj00000ahFCW",name:"Highview Capital",hadOpportunity:!1},{id:"001Wj00000Pg7rW",name:"Houlihan Lokey",hadOpportunity:!1},{id:"001Wj00000ahFCH",name:"Housatonic Partners",hadOpportunity:!1},{id:"001Wj00000ahFC9",name:"Huron Capital",hadOpportunity:!1},{id:"001Wj00000ahFC6",name:"Indutrade",hadOpportunity:!1},{id:"001Wj00000ahBa5",name:"Insight Partners",hadOpportunity:!1},{id:"001Wj00000nlbr9",name:"Intercorp",hadOpportunity:!0},{id:"001Wj00000ahFCA",name:"Irving Place Capital",hadOpportunity:!1},{id:"001Wj00000bwVtt",name:"Jack Henry & Associates",hadOpportunity:!1},{id:"001Wj00000Pg9oT",name:"Jackim Woods & Co.",hadOpportunity:!1},{id:"001Wj00000ah6de",name:"Jonas Software",hadOpportunity:!1},{id:"001Hp00003kIrJU",name:"KKR",hadOpportunity:!1},{id:"001Wj00000ahBa1",name:"Kayne Anderson Capital Advisors",hadOpportunity:!1},{id:"001Wj00000m5kud",name:"Kelly Services",hadOpportunity:!0},{id:"001Wj00000ahBZp",name:"Keysight Technologies",hadOpportunity:!1},{id:"001Wj00000ahFC8",name:"L Squared Capital Partners",hadOpportunity:!1},{id:"001Wj00000QGTNV",name:"LCS Forensic Accounting & Advisory",hadOpportunity:!1},{id:"001Wj00000ahFCD",name:"Lagercrantz Group",hadOpportunity:!1},{id:"001Wj00000ahBZs",name:"Levine Leichtman Capital Partners",hadOpportunity:!1},{id:"001Wj00000Z6zhP",name:"Liberty Mutual Insurance",hadOpportunity:!0},{id:"001Wj00000ahFCC",name:"Lifco",hadOpportunity:!1},{id:"001Wj00000ahFCP",name:"LightBay Capital",hadOpportunity:!1},{id:"001Wj00000iYEVS",name:"Lightstone Group",hadOpportunity:!0},{id:"001Wj00000ahFCT",name:"Lincolnshire Management",hadOpportunity:!1},{id:"001Wj00000c8ynV",name:"Littelfuse",hadOpportunity:!0},{id:"001Wj00000W95CX",name:"Long Lake",hadOpportunity:!0},{id:"001Wj00000ahBa3",name:"Luminate Capital",hadOpportunity:!1},{id:"001Wj00000ahFC1",name:"Lumine Group",hadOpportunity:!1},{id:"001Wj00000bwVuH",name:"Markel Corporation",hadOpportunity:!1},{id:"001Wj00000Pfppo",name:"Marks Baughan",hadOpportunity:!1},{id:"001Wj00000ah6dm",name:"Martis Capital",hadOpportunity:!1},{id:"001Hp00003kKrRR",name:"Marvell Technology",hadOpportunity:!0},{id:"001Wj00000PbJ2B",name:"Meridian Capital",hadOpportunity:!1},{id:"001Wj00000ahFC3",name:"Nexa Equity",hadOpportunity:!1},{id:"001Wj00000ahBZv",name:"Norwest Venture Partners",hadOpportunity:!1},{id:"001Wj00000ah6dp",name:"Novanta",hadOpportunity:!1},{id:"001Wj00000ah6dQ",name:"Pacific Avenue Capital Partners",hadOpportunity:!1},{id:"001Wj00000ah6dt",name:"Palladium Equity Partners",hadOpportunity:!1},{id:"001Wj00000iXNFs",name:"Palomar Holdings",hadOpportunity:!0},{id:"001Wj00000ahFCG",name:"Pamlico Capital",hadOpportunity:!1},{id:"001Wj00000W3R2u",name:"Paradigm",hadOpportunity:!1},{id:"001Wj00000bWBlQ",name:"Pegasystems",hadOpportunity:!0},{id:"001Wj00000YcPTM",name:"Percheron Capital",hadOpportunity:!0},{id:"001Wj00000bzz9M",name:"Peregrine Hospitality",hadOpportunity:!0},{id:"001Wj00000VZkJ3",name:"PerformLaw",hadOpportunity:!1},{id:"001Hp00003ljCJ8",name:"Petco",hadOpportunity:!0},{id:"001Wj00000ahFBy",name:"Pharos Capital Group",hadOpportunity:!1},{id:"001Wj00000bwVuF",name:"Pool Corporation",hadOpportunity:!1},{id:"001Wj00000ah48Y",name:"Pritzker Private Capital",hadOpportunity:!1},{id:"001Wj00000mRFNX",name:"Publicis Group",hadOpportunity:!0},{id:"001Hp00003kKXSI",name:"Pure Storage",hadOpportunity:!0},{id:"001Wj00000ah6dS",name:"Quad-C Management",hadOpportunity:!1},{id:"001Hp00003kIrLo",name:"Raymond James Financial",hadOpportunity:!1},{id:"001Wj00000ah6ds",name:"Resilience Capital Partners",hadOpportunity:!1},{id:"001Wj00000m0jBC",name:"RingCentral",hadOpportunity:!0},{id:"001Wj00000ahFC4",name:"Riverside Acceleration Capital",hadOpportunity:!1},{id:"001Wj00000ah48a",name:"Riverside Partners",hadOpportunity:!1},{id:"001Wj00000ahFCE",name:"Rustic Canyon Partners",hadOpportunity:!1},{id:"001Wj00000ah6dR",name:"Sageview Capital",hadOpportunity:!1},{id:"001Wj00000ahFCN",name:"Salt Creek Capital",hadOpportunity:!1},{id:"001Wj00000lzlLX",name:"Sandbox",hadOpportunity:!0},{id:"001Wj00000nldrK",name:"Scout Motors",hadOpportunity:!0},{id:"001Wj00000ah48Z",name:"Searchlight Capital",hadOpportunity:!1},{id:"001Wj00000ahBZq",name:"Serent Capital",hadOpportunity:!1},{id:"001Hp00003kIrEB",name:"Silver Lake",hadOpportunity:!0},{id:"001Wj00000ahBZo",name:"Siris Capital Group",hadOpportunity:!1},{id:"001Wj00000ah6db",name:"Solace Capital Partners",hadOpportunity:!1},{id:"001Wj00000ahFCF",name:"Solis Capital Partners",hadOpportunity:!1},{id:"001Wj00000VkQyY",name:"Sonja Cotton & Associates",hadOpportunity:!1},{id:"001Wj00000ah6dO",name:"Sorenson Capital",hadOpportunity:!1},{id:"001Wj00000lygkU",name:"SoundPoint Capital",hadOpportunity:!0},{id:"001Wj00000lxbYR",name:"Spark Brighter Thinking",hadOpportunity:!0},{id:"001Wj00000ah6dj",name:"Spectrum Equity",hadOpportunity:!0},{id:"001Wj00000lusqi",name:"Symphony Technology Partners",hadOpportunity:!0},{id:"001Wj00000tOAoE",name:"TA Associates",hadOpportunity:!0},{id:"001Hp00003kKrU1",name:"TPG",hadOpportunity:!0},{id:"001Wj00000dNhDy",name:"TSS Europe",hadOpportunity:!0},{id:"001Wj00000QTbzh",name:"Taytrom",hadOpportunity:!1},{id:"001Wj00000ahFCY",name:"The Courtney Group",hadOpportunity:!1},{id:"001Wj00000ahFCZ",name:"The Riverside Company",hadOpportunity:!1},{id:"001Wj00000cgCF8",name:"Titan AI",hadOpportunity:!1},{id:"001Wj00000nlOIv",name:"Together Fund",hadOpportunity:!0},{id:"001Wj00000ah6dX",name:"Topicus.com",hadOpportunity:!1},{id:"001Hp00003kIrNO",name:"TransDigm Group",hadOpportunity:!1},{id:"001Wj00000ah6dN",name:"Transom Capital Group",hadOpportunity:!1},{id:"001Wj00000ahBZu",name:"Trimble Inc.",hadOpportunity:!1},{id:"001Wj00000ah6dl",name:"Trivest Partners",hadOpportunity:!1},{id:"001Wj00000dXDo3",name:"Tucker's Farm",hadOpportunity:!0},{id:"001Wj00000ah6da",name:"Tyler Technologies",hadOpportunity:!1},{id:"001Wj00000Y6VMa",name:"UBS",hadOpportunity:!0},{id:"001Wj00000ahFCQ",name:"Vance Street Capital",hadOpportunity:!1},{id:"001Wj00000bn8VS",name:"Vista Equity Partners",hadOpportunity:!0},{id:"001Wj00000ahFC0",name:"Vitec Software",hadOpportunity:!1},{id:"001Wj00000ah6dP",name:"Volaris Group",hadOpportunity:!1},{id:"001Hp00003kIrO2",name:"Watsco",hadOpportunity:!1},{id:"001Wj00000ahBZw",name:"West Lane Capital Partners",hadOpportunity:!1},{id:"001Wj00000ahBZy",name:"Zebra Technologies",hadOpportunity:!1}]},"asad.hussain@eudia.com":{email:"asad.hussain@eudia.com",name:"Asad Hussain",accounts:[{id:"001Hp00003kIrFC",name:"AT&T",hadOpportunity:!0},{id:"001Hp00003kIrCy",name:"Airbnb",hadOpportunity:!0},{id:"001Hp00003kIrEe",name:"Amazon",hadOpportunity:!0},{id:"001Wj00000WElj9",name:"American Arbitration Association",hadOpportunity:!0},{id:"001Hp00003kIrCz",name:"American Express",hadOpportunity:!0},{id:"001Wj00000hewsX",name:"Amkor",hadOpportunity:!0},{id:"001Wj00000WZ05x",name:"Applied Intuition",hadOpportunity:!0},{id:"001Hp00003kIrEx",name:"Applied Materials",hadOpportunity:!1},{id:"001Hp00003kIrEz",name:"Archer Daniels Midland",hadOpportunity:!0},{id:"001Wj00000Y0g8Z",name:"Asana",hadOpportunity:!0},{id:"001Wj00000gGYAQ",name:"Autodesk",hadOpportunity:!0},{id:"001Wj00000c0wRA",name:"Away",hadOpportunity:!0},{id:"001Wj00000WTMCR",name:"BNY Mellon",hadOpportunity:!0},{id:"001Wj00000c6DHy",name:"BetterUp",hadOpportunity:!0},{id:"001Hp00003kIrFY",name:"BlackRock",hadOpportunity:!1},{id:"001Hp00003kIrFe",name:"Booz Allen Hamilton",hadOpportunity:!1},{id:"001Wj00000XhcVG",name:"Box.com",hadOpportunity:!0},{id:"001Wj00000bWBla",name:"CNA Insurance",hadOpportunity:!0},{id:"001Wj00000XiYqz",name:"Canva",hadOpportunity:!0},{id:"001Hp00003kIrG0",name:"Carrier Global",hadOpportunity:!1},{id:"001Wj00000mosEX",name:"Carta",hadOpportunity:!0},{id:"001Wj00000ah6dk",name:"Charlesbank Capital Partners",hadOpportunity:!0},{id:"001Wj00000XiXjd",name:"Circle",hadOpportunity:!0},{id:"001Hp00003kIrE5",name:"Coherent",hadOpportunity:!0},{id:"001Hp00003kIrGf",name:"Corning",hadOpportunity:!0},{id:"001Wj00000fgfGu",name:"Cyware",hadOpportunity:!0},{id:"001Hp00003kIrE6",name:"DHL",hadOpportunity:!0},{id:"001Wj00000duIWr",name:"Deepmind",hadOpportunity:!0},{id:"001Hp00003kIrGy",name:"Dell Technologies",hadOpportunity:!1},{id:"001Hp00003kIrGz",name:"Deloitte",hadOpportunity:!0},{id:"001Wj00000W8ZKl",name:"Docusign",hadOpportunity:!0},{id:"001Hp00003kIrHN",name:"Ecolab",hadOpportunity:!0},{id:"001Wj00000dheQN",name:"Emory",hadOpportunity:!0},{id:"001Wj00000bWIxP",name:"Ericsson",hadOpportunity:!0},{id:"001Hp00003kIrHs",name:"FedEx",hadOpportunity:!1},{id:"001Wj00000lMcwT",name:"Flo Health",hadOpportunity:!0},{id:"001Hp00003kIrI3",name:"Fluor",hadOpportunity:!0},{id:"001Hp00003kIrIA",name:"Fox",hadOpportunity:!0},{id:"001Hp00003kJ9oe",name:"Fresh Del Monte",hadOpportunity:!0},{id:"001Wj00000Y6HEY",name:"G-III Apparel Group",hadOpportunity:!0},{id:"001Wj00000kNTF0",name:"GLG",hadOpportunity:!0},{id:"001Hp00003kIrIK",name:"Geico",hadOpportunity:!0},{id:"001Hp00003lhVuD",name:"General Atlantic",hadOpportunity:!0},{id:"001Wj00000dw1gb",name:"Glean",hadOpportunity:!0},{id:"001Hp00003kJ9l1",name:"Google",hadOpportunity:!0},{id:"001Wj00000oqVXg",name:"Goosehead Insurance",hadOpportunity:!0},{id:"001Wj00000tuXZb",name:"Gopuff",hadOpportunity:!0},{id:"001Hp00003kIrDP",name:"HP",hadOpportunity:!0},{id:"001Hp00003kIrIt",name:"HSBC",hadOpportunity:!0},{id:"001Hp00003kL3Mo",name:"Honeywell",hadOpportunity:!0},{id:"001Hp00003kIrIy",name:"Huntsman",hadOpportunity:!0},{id:"001Wj00000d7IL8",name:"IAC",hadOpportunity:!0},{id:"001Hp00003kIrJ0",name:"IBM",hadOpportunity:!0},{id:"001Wj00000hdoLx",name:"Insight Enterprises Inc.",hadOpportunity:!0},{id:"001Wj00000gH7ua",name:"JFrog",hadOpportunity:!0},{id:"001Wj00000tNwur",name:"Janus Henderson",hadOpportunity:!1},{id:"001Wj00000iC14X",name:"Klarna",hadOpportunity:!0},{id:"001Wj00000wSLUl",name:"LexisNexis",hadOpportunity:!1},{id:"001Wj00000mCFtJ",name:"LinkedIn",hadOpportunity:!0},{id:"001Hp00003kIrJu",name:"Lockheed Martin",hadOpportunity:!0},{id:"001Hp00003kIrKC",name:"Mass Mutual Life Insurance",hadOpportunity:!0},{id:"001Hp00003kIrKO",name:"Microsoft",hadOpportunity:!0},{id:"001Wj00000lyDQk",name:"MidOcean Partners",hadOpportunity:!0},{id:"001Hp00003kIrKT",name:"Morgan Stanley",hadOpportunity:!0},{id:"001Wj00000bWIxq",name:"Motiva",hadOpportunity:!0},{id:"001Hp00003kIrKr",name:"NVIDIA",hadOpportunity:!1},{id:"001Hp00003kIrCx",name:"Novartis",hadOpportunity:!0},{id:"001Wj00000hVTTB",name:"One Oncology",hadOpportunity:!0},{id:"001Wj00000Y6VVW",name:"Oscar Health",hadOpportunity:!0},{id:"001Wj00000eLHLO",name:"Palo Alto Networks",hadOpportunity:!1},{id:"001Wj00000kNp2X",name:"Plusgrade",hadOpportunity:!0},{id:"001Wj00000YoLqW",name:"Procore Technologies",hadOpportunity:!0},{id:"001Wj00000lXD0F",name:"RBI (Burger King)",hadOpportunity:!1},{id:"001Hp00003kIrLx",name:"Republic Services",hadOpportunity:!1},{id:"001Wj00000bWJ0J",name:"SAP",hadOpportunity:!1},{id:"001Hp00003kIrD9",name:"Salesforce",hadOpportunity:!0},{id:"001Wj00000fPr6N",name:"Santander",hadOpportunity:!0},{id:"001Hp00003kIrMK",name:"ServiceNow",hadOpportunity:!0},{id:"001Wj00000eL760",name:"Shell",hadOpportunity:!1},{id:"001Wj00000kNmsg",name:"Skims",hadOpportunity:!0},{id:"001Wj00000aCGR3",name:"Solventum",hadOpportunity:!0},{id:"001Hp00003kIrEC",name:"Southwest Airlines",hadOpportunity:!0},{id:"001Hp00003kIrMc",name:"SpaceX",hadOpportunity:!1},{id:"001Wj00000SdYHq",name:"Spotify",hadOpportunity:!0},{id:"001Hp00003kIrDl",name:"StoneX Group",hadOpportunity:!0},{id:"001Wj00000WYtsU",name:"Tenable",hadOpportunity:!0},{id:"001Hp00003kIrN5",name:"Tesla",hadOpportunity:!1},{id:"001Wj00000c0wRK",name:"The Initial Group",hadOpportunity:!0},{id:"001Wj00000bWBlX",name:"Thomson Reuters Ventures",hadOpportunity:!1},{id:"001Hp00003kIrCs",name:"UPS",hadOpportunity:!0},{id:"001Wj00000tuRNo",name:"Virtusa",hadOpportunity:!0},{id:"001Hp00003kIrNw",name:"W.W. Grainger",hadOpportunity:!0},{id:"001Hp00003kIrNy",name:"Walmart",hadOpportunity:!0},{id:"001Wj00000Y64qk",name:"Warburg Pincus LLC",hadOpportunity:!1},{id:"001Wj00000bzz9N",name:"Wealth Partners Capital Group",hadOpportunity:!0},{id:"001Wj00000tuolf",name:"Wynn Las Vegas",hadOpportunity:!0},{id:"001Wj00000bzz9Q",name:"Youtube",hadOpportunity:!0},{id:"001Wj00000uzs1f",name:"Zero RFI",hadOpportunity:!0}]},"conor.molloy@eudia.com":{email:"conor.molloy@eudia.com",name:"Conor Molloy",accounts:[{id:"001Wj00000mCFrf",name:"APEX Group",hadOpportunity:!1},{id:"001Wj00000xxtg6",name:"ASR Nederland",hadOpportunity:!1},{id:"001Hp00003kIrQD",name:"Accenture",hadOpportunity:!0},{id:"001Wj00000qLixn",name:"Al Dahra Group Llc",hadOpportunity:!0},{id:"001Wj00000syNyn",name:"Alliance Healthcare",hadOpportunity:!1},{id:"001Hp00003kIrEy",name:"Aramark Ireland",hadOpportunity:!0},{id:"001Wj00000tWwXk",name:"Aramex",hadOpportunity:!1},{id:"001Wj00000xyXlY",name:"Arkema",hadOpportunity:!1},{id:"001Wj00000mCFrg",name:"Aryza",hadOpportunity:!0},{id:"001Wj00000xz3F7",name:"Aurubis",hadOpportunity:!1},{id:"001Wj00000bWIzJ",name:"BAE Systems, Inc.",hadOpportunity:!1},{id:"001Wj00000fFhea",name:"BBC News",hadOpportunity:!1},{id:"001Wj00000Y6Vk4",name:"BBC Studios",hadOpportunity:!1},{id:"001Wj00000xypIc",name:"BMW Group",hadOpportunity:!1},{id:"001Wj00000eLPna",name:"BP",hadOpportunity:!1},{id:"001Wj00000tsfWO",name:"Baker Tilly",hadOpportunity:!0},{id:"001Wj00000tWwXr",name:"Bestseller",hadOpportunity:!1},{id:"001Wj00000xz3LZ",name:"Bouygues",hadOpportunity:!1},{id:"001Wj00000xz3Td",name:"British Broadcasting Corporation",hadOpportunity:!1},{id:"001Wj00000xyc3f",name:"Carrefour",hadOpportunity:!1},{id:"001Wj00000tWwXy",name:"Citco",hadOpportunity:!1},{id:"001Wj00000mCFrk",name:"Coillte",hadOpportunity:!0},{id:"001Wj00000mCFsH",name:"Consensys",hadOpportunity:!0},{id:"001Wj00000xxS3B",name:"Currys",hadOpportunity:!1},{id:"001Wj00000Y6Vgo",name:"Cushman & Wakefield",hadOpportunity:!1},{id:"001Wj00000tWwY2",name:"DB Schenker",hadOpportunity:!1},{id:"001Wj00000xxpXf",name:"DZ Bank",hadOpportunity:!1},{id:"001Wj00000bWIzG",name:"DZB BANK GmbH",hadOpportunity:!1},{id:"001Wj00000Y6VMZ",name:"Danone",hadOpportunity:!1},{id:"001Wj00000xyCKX",name:"Deutsche Bahn",hadOpportunity:!1},{id:"001Wj00000tWwY3",name:"Dyson",hadOpportunity:!1},{id:"001Wj00000xy3Iu",name:"E.ON",hadOpportunity:!1},{id:"001Wj00000xz3Jx",name:"Electricite de France",hadOpportunity:!1},{id:"001Hp00003kIrHR",name:"Electronic Arts",hadOpportunity:!1},{id:"001Wj00000xz373",name:"Energie Baden-Wurttemberg",hadOpportunity:!1},{id:"001Wj00000xwnL0",name:"Evonik Industries",hadOpportunity:!1},{id:"001Wj00000xyr5v",name:"FMS Wertmanagement",hadOpportunity:!1},{id:"001Wj00000Y6DDb",name:"Federal Reserve Bank of New York",hadOpportunity:!1},{id:"001Wj00000tWwYf",name:"Fenergo",hadOpportunity:!1},{id:"001Wj00000xxuFZ",name:"Finatis",hadOpportunity:!1},{id:"001Wj00000xz3QP",name:"Groupe SEB",hadOpportunity:!1},{id:"001Wj00000syXLZ",name:"Guerbet",hadOpportunity:!1},{id:"001Wj00000xyP83",name:"Heraeus Holding",hadOpportunity:!1},{id:"001Wj00000xxuVh",name:"Hermes International",hadOpportunity:!1},{id:"001Wj00000xz32D",name:"Hornbach Group",hadOpportunity:!1},{id:"001Wj00000hkk0u",name:"ICON",hadOpportunity:!1},{id:"001Wj00000mCFr2",name:"ICON Clinical Research",hadOpportunity:!0},{id:"001Wj00000Y64qd",name:"ION",hadOpportunity:!0},{id:"001Wj00000xz3AH",name:"Ingka Group",hadOpportunity:!1},{id:"001Wj00000tWwXa",name:"Jacobs Engineering Group",hadOpportunity:!1},{id:"001Wj00000xz30c",name:"Johnson Matthey",hadOpportunity:!1},{id:"001Wj00000mCFtM",name:"Kellanova",hadOpportunity:!0},{id:"001Wj00000xz3S1",name:"Klockner",hadOpportunity:!1},{id:"001Wj00000tWwYC",name:"Kuehne & Nagel",hadOpportunity:!1},{id:"001Wj00000bWIym",name:"LSEG",hadOpportunity:!1},{id:"001Wj00000Y6VZE",name:"Linde",hadOpportunity:!1},{id:"001Wj00000xy1Lu",name:"M&G",hadOpportunity:!1},{id:"001Wj00000xz0h4",name:"Metinvest",hadOpportunity:!1},{id:"001Wj00000xyNse",name:"NN Group",hadOpportunity:!1},{id:"001Wj00000xyECc",name:"Network Rail",hadOpportunity:!1},{id:"001Wj00000xyudG",name:"Nordex",hadOpportunity:!1},{id:"001Wj00000tWwXc",name:"Ocorian",hadOpportunity:!1},{id:"001Wj00000fFW1m",name:"Okta",hadOpportunity:!1},{id:"001Wj00000mCFrI",name:"Orsted",hadOpportunity:!0},{id:"001Wj00000tWwYK",name:"PGIM",hadOpportunity:!1},{id:"001Wj00000xz38f",name:"PPF Group",hadOpportunity:!1},{id:"001Wj00000tWwYi",name:"Penneys",hadOpportunity:!1},{id:"001Wj00000tWwYL",name:"Philips Electronics",hadOpportunity:!1},{id:"001Wj00000tWwYP",name:"Reddit",hadOpportunity:!1},{id:"001Wj00000mCFrU",name:"Riot Games",hadOpportunity:!0},{id:"001Wj00000xyD0Q",name:"Rolls-Royce",hadOpportunity:!1},{id:"001Wj00000xxIqC",name:"Royal Ahold Delhaize",hadOpportunity:!1},{id:"001Wj00000xz3Gj",name:"Rubis",hadOpportunity:!1},{id:"001Wj00000xyrh0",name:"Salzgitter",hadOpportunity:!1},{id:"001Wj00000bWBm6",name:"Schneider Electric",hadOpportunity:!1},{id:"001Wj00000mI9Nm",name:"Sequoia Climate Fund",hadOpportunity:!1},{id:"001Wj00000fCp7J",name:"Siemens",hadOpportunity:!1},{id:"001Wj00000tWwYR",name:"Smurfit Kappa",hadOpportunity:!1},{id:"001Wj00000tWwYS",name:"Stewart",hadOpportunity:!1},{id:"001Wj00000syavy",name:"Symrise AG",hadOpportunity:!1},{id:"001Wj00000mCFs0",name:"Taoglas Limited",hadOpportunity:!0},{id:"001Wj00000mCFtP",name:"Teamwork.com",hadOpportunity:!0},{id:"001Wj00000sxsOq",name:"TechnipFMC",hadOpportunity:!1},{id:"001Wj00000tWwXe",name:"Teneo",hadOpportunity:!1},{id:"001Wj00000Y64qc",name:"Thales",hadOpportunity:!1},{id:"001Hp00003kIrNJ",name:"Toyota",hadOpportunity:!0},{id:"001Wj00000mCFqw",name:"Ulster Bank",hadOpportunity:!1},{id:"001Wj00000xxDSI",name:"Unedic",hadOpportunity:!1},{id:"001Wj00000mCFs2",name:"Vantage Towers",hadOpportunity:!0},{id:"001Hp00003kIrNs",name:"Vistra",hadOpportunity:!0},{id:"001Wj00000Y6VZD",name:"WPP",hadOpportunity:!0},{id:"001Wj00000ZLVpT",name:"Wellspring Philanthropic Fund",hadOpportunity:!0},{id:"001Wj00000mCFsY",name:"World Rugby",hadOpportunity:!1},{id:"001Wj00000xyygs",name:"Wurth",hadOpportunity:!1},{id:"001Wj00000aLlzL",name:"Xerox",hadOpportunity:!1},{id:"001Wj00000j3QNL",name:"adidas",hadOpportunity:!1}]},"david.vanreyk@eudia.com":{email:"david.vanreyk@eudia.com",name:"David Van Reyk",accounts:[{id:"001Wj00000cIA4i",name:"Amerivet",hadOpportunity:!0},{id:"001Wj00000dw9pN",name:"Ardian",hadOpportunity:!0}]},"emer.flynn@eudia.com":{email:"emer.flynn@eudia.com",name:"Emer Flynn",accounts:[{id:"001Wj00000syUts",name:"Bakkavor",hadOpportunity:!1},{id:"001Wj00000syAdO",name:"Bonduelle",hadOpportunity:!1},{id:"001Wj00000syAoe",name:"Gerresheimer",hadOpportunity:!1},{id:"001Wj00000syBb5",name:"Harbour Energy",hadOpportunity:!1},{id:"001Wj00000soqIv",name:"Lundbeck",hadOpportunity:!1},{id:"001Wj00000mCFr6",name:"NTMA",hadOpportunity:!0},{id:"001Wj00000sxy9J",name:"Orion Pharma",hadOpportunity:!1},{id:"001Wj00000soqNk",name:"Sobi",hadOpportunity:!1},{id:"001Wj00000sy54F",name:"SubSea7",hadOpportunity:!1},{id:"001Wj00000sxvzJ",name:"Virbac",hadOpportunity:!1}]},"greg.machale@eudia.com":{email:"greg.machale@eudia.com",name:"Greg MacHale",accounts:[{id:"001Wj00000Y64ql",name:"ABN AMRO Bank N.V.",hadOpportunity:!1},{id:"001Wj00000tWwYd",name:"AXA",hadOpportunity:!1},{id:"001Hp00003kIrEF",name:"Abbott Laboratories",hadOpportunity:!0},{id:"001Wj00000tWwXg",name:"Abtran",hadOpportunity:!1},{id:"001Wj00000umCEl",name:"Aerogen",hadOpportunity:!1},{id:"001Wj00000xyMyB",name:"Air Liquide",hadOpportunity:!1},{id:"001Wj00000tWwYa",name:"Allergan",hadOpportunity:!1},{id:"001Wj00000sgXdB",name:"Allianz Insurance",hadOpportunity:!0},{id:"001Wj00000tWwYb",name:"Almac Group",hadOpportunity:!1},{id:"001Hp00003kIrEm",name:"Amgen",hadOpportunity:!1},{id:"001Wj00000pzTPu",name:"Arrow Global Group PLC/Mars Capital",hadOpportunity:!1},{id:"001Wj00000tWwXm",name:"Arvato Digital Services",hadOpportunity:!1},{id:"001Wj00000tWwXn",name:"Arvato Supply Chain Solutions",hadOpportunity:!1},{id:"001Wj00000tWwYc",name:"Arvato Systems",hadOpportunity:!1},{id:"001Wj00000xz3VF",name:"Asklepios",hadOpportunity:!1},{id:"001Wj00000vWwfx",name:"Associated British Foods",hadOpportunity:!1},{id:"001Hp00003kIrFB",name:"AstraZeneca",hadOpportunity:!1},{id:"001Wj00000bWJ0A",name:"Atos",hadOpportunity:!1},{id:"001Wj00000hfWMu",name:"Aya Healthcare",hadOpportunity:!1},{id:"001Wj00000tWwXV",name:"BCM Group",hadOpportunity:!1},{id:"001Wj00000tWwXU",name:"BCMGlobal ASI Ltd",hadOpportunity:!1},{id:"001Wj00000Y6VMd",name:"BNP Paribas",hadOpportunity:!0},{id:"001Wj00000X4OqN",name:"BT Group",hadOpportunity:!0},{id:"001Wj00000vRJ13",name:"BWG Group",hadOpportunity:!1},{id:"001Wj00000bWBsw",name:"Bausch + Lomb",hadOpportunity:!1},{id:"001Hp00003kIrFO",name:"Baxter International",hadOpportunity:!1},{id:"001Wj00000wLIjh",name:"Baywa",hadOpportunity:!1},{id:"001Wj00000tWwXs",name:"Bidvest Noonan",hadOpportunity:!1},{id:"001Wj00000mCFqr",name:"Biomarin International Limited",hadOpportunity:!0},{id:"001Hp00003kIrFd",name:"Booking Holdings",hadOpportunity:!0},{id:"001Wj00000T5gdt",name:"Bosch",hadOpportunity:!1},{id:"001Hp00003kIrFg",name:"Boston Scientific",hadOpportunity:!1},{id:"001Wj00000xyNsd",name:"Brenntag",hadOpportunity:!1},{id:"001Wj00000tgYgj",name:"British American Tobacco ( BAT )",hadOpportunity:!1},{id:"001Wj00000ulXoK",name:"British Petroleum ( BP )",hadOpportunity:!1},{id:"001Hp00003kIrDK",name:"Bupa",hadOpportunity:!1},{id:"001Wj00000bWBkr",name:"CRH",hadOpportunity:!1},{id:"001Wj00000uZ5J7",name:"Canada Life",hadOpportunity:!0},{id:"001Hp00003kIrFu",name:"Capgemini",hadOpportunity:!1},{id:"001Wj00000tWwYe",name:"Capita",hadOpportunity:!1},{id:"001Wj00000mCFt9",name:"Cerberus European Servicing",hadOpportunity:!0},{id:"001Wj00000tWwXz",name:"CluneTech",hadOpportunity:!1},{id:"001Wj00000wKnrE",name:"Co-operative Group ( Co-op )",hadOpportunity:!1},{id:"001Wj00000Y6HEM",name:"Commerzbank AG",hadOpportunity:!1},{id:"001Wj00000aLp9L",name:"Compass",hadOpportunity:!1},{id:"001Wj00000cSBr6",name:"Compass Group Equity Partners",hadOpportunity:!1},{id:"001Wj00000Y6VMk",name:"Computershare",hadOpportunity:!0},{id:"001Wj00000uP5x8",name:"Cornmarket Financial Services",hadOpportunity:!0},{id:"001Wj00000tWwY0",name:"Cornmarket Hill Trading Limited",hadOpportunity:!1},{id:"001Hp00003kIrGk",name:"Covestro",hadOpportunity:!1},{id:"001Wj00000tWwXY",name:"DCC Vital",hadOpportunity:!1},{id:"001Wj00000mCFrV",name:"Danske Bank",hadOpportunity:!1},{id:"001Hp00003kJ9fx",name:"Deutsche Bank AG",hadOpportunity:!1},{id:"001Wj00000Y6VMM",name:"Diageo",hadOpportunity:!0},{id:"001Wj00000prFOX",name:"Doosan Bobcat",hadOpportunity:!0},{id:"001Wj00000wKzZ1",name:"Drax Group",hadOpportunity:!1},{id:"001Hp00003kIrHQ",name:"EG Group",hadOpportunity:!1},{id:"001Wj00000hUcQZ",name:"EY",hadOpportunity:!0},{id:"001Wj00000wK30S",name:"EY ( Ernst & Young )",hadOpportunity:!1},{id:"001Hp00003kIrHL",name:"Eaton Corporation",hadOpportunity:!1},{id:"001Wj00000mCFtR",name:"Ekco Cloud Limited",hadOpportunity:!0},{id:"001Hp00003kIrHS",name:"Elevance Health",hadOpportunity:!1},{id:"001Hp00003kIrHT",name:"Eli Lilly",hadOpportunity:!1},{id:"001Wj00000Y6HEn",name:"Ferring Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000tWwYn",name:"Fibrus",hadOpportunity:!1},{id:"001Hp00003kIrHu",name:"Fidelity Investments",hadOpportunity:!1},{id:"001Hp00003kIrI0",name:"Fiserv",hadOpportunity:!1},{id:"001Wj00000xxg4V",name:"Fnac Darty",hadOpportunity:!1},{id:"001Wj00000wL79x",name:"Frasers Group",hadOpportunity:!1},{id:"001Wj00000aLlyX",name:"Gartner",hadOpportunity:!1},{id:"001Wj00000fFuFY",name:"Grant Thornton",hadOpportunity:!0},{id:"001Wj00000uZ4A9",name:"Great West Lifec co",hadOpportunity:!0},{id:"001Wj00000pzTPt",name:"Gym Plus Coffee",hadOpportunity:!1},{id:"001Wj00000xW3SE",name:"Hayfin",hadOpportunity:!0},{id:"001Wj00000pzTPm",name:"Hedgserv",hadOpportunity:!1},{id:"001Wj00000xxsbv",name:"Heidelberg Materials",hadOpportunity:!1},{id:"001Wj00000wvtPl",name:"ICEYE",hadOpportunity:!0},{id:"001Wj00000mCFrH",name:"Indra",hadOpportunity:!1},{id:"001Wj00000uZtcT",name:"Ineos",hadOpportunity:!0},{id:"001Wj00000vXdt1",name:"International Airline Group ( IAG )",hadOpportunity:!1},{id:"001Wj00000wKnZU",name:"International Distribution Services",hadOpportunity:!1},{id:"001Wj00000wKTao",name:"John Swire & Sons",hadOpportunity:!1},{id:"001Wj00000vaqot",name:"Johnson Controls",hadOpportunity:!1},{id:"001Wj00000xwwRX",name:"Jumbo Groep Holding",hadOpportunity:!1},{id:"001Hp00003kIrJb",name:"KPMG",hadOpportunity:!1},{id:"001Wj00000Y6VZM",name:"Kering",hadOpportunity:!1},{id:"001Wj00000mCFrr",name:"Kerry Group",hadOpportunity:!1},{id:"001Wj00000xyyk7",name:"La Poste",hadOpportunity:!1},{id:"001Wj00000tWwYr",name:"Laya Healthcare",hadOpportunity:!1},{id:"001Wj00000tWwYE",name:"Leaseplan",hadOpportunity:!1},{id:"001Wj00000tWwYF",name:"Linked Finance",hadOpportunity:!1},{id:"001Wj00000Y6HEA",name:"Lloyds Banking Group",hadOpportunity:!1},{id:"001Wj00000xyDV4",name:"LyondellBasell Industries",hadOpportunity:!1},{id:"001Wj00000tWwYG",name:"MSC - Mediterranean Shipping Company",hadOpportunity:!1},{id:"001Wj00000wvGLB",name:"MTU Maintenance Lease Services",hadOpportunity:!1},{id:"001Wj00000iC14L",name:"MUFG Investor Services",hadOpportunity:!1},{id:"001Wj00000xyp2U",name:"MVV Energie",hadOpportunity:!1},{id:"001Wj00000tWwYp",name:"Mail Metrics",hadOpportunity:!0},{id:"001Wj00000qFtCk",name:"Mars Capital",hadOpportunity:!1},{id:"001Wj00000pAeWg",name:"Meetingsbooker",hadOpportunity:!0},{id:"001Hp00003kIrKJ",name:"Mercedes-Benz Group",hadOpportunity:!0},{id:"001Wj00000YEMaI",name:"Mercer",hadOpportunity:!1},{id:"001Wj00000vwSUX",name:"Mercor",hadOpportunity:!0},{id:"001Wj00000mCFtU",name:"Mercury Engineering",hadOpportunity:!0},{id:"001Wj00000yGZth",name:"Monzo",hadOpportunity:!1},{id:"001Wj00000tWwYg",name:"Musgrave",hadOpportunity:!1},{id:"001Wj00000lPFP3",name:"Nomura",hadOpportunity:!0},{id:"001Wj00000tWwYH",name:"Norbrook Laboratories",hadOpportunity:!1},{id:"001Hp00003kIrKn",name:"Northrop Grumman",hadOpportunity:!1},{id:"001Wj00000xxcH4",name:"Orange",hadOpportunity:!1},{id:"001Wj00000tWwYI",name:"P.J. Carroll (BAT Ireland)",hadOpportunity:!1},{id:"001Wj00000mCFsf",name:"Pepper Finance Corporation",hadOpportunity:!0},{id:"001Wj00000mCFrO",name:"Peptalk",hadOpportunity:!0},{id:"001Wj00000mCFr1",name:"Permanent TSB plc",hadOpportunity:!0},{id:"001Wj00000Y6QfR",name:"Pernod Ricard",hadOpportunity:!0},{id:"001Wj00000vVxFy",name:"Phoenix Group",hadOpportunity:!1},{id:"001Wj00000tWwYM",name:"Pinewood Laboratories",hadOpportunity:!1},{id:"001Wj00000tWwYN",name:"Pinsent Masons",hadOpportunity:!1},{id:"001Wj00000tWwYO",name:"Pramerica",hadOpportunity:!1},{id:"001Hp00003kIrLf",name:"PwC",hadOpportunity:!1},{id:"001Hp00003kIrLi",name:"Quest Diagnostics",hadOpportunity:!0},{id:"001Wj00000xy735",name:"RATP Group",hadOpportunity:!1},{id:"001Wj00000xyKjS",name:"Randstad",hadOpportunity:!1},{id:"001Wj00000mCFsF",name:"Regeneron",hadOpportunity:!0},{id:"001Wj00000xwh4H",name:"Renault",hadOpportunity:!1},{id:"001Wj00000xy1P5",name:"Rheinmetall",hadOpportunity:!1},{id:"001Wj00000tWwYQ",name:"Roche",hadOpportunity:!1},{id:"001Wj00000wKi8O",name:"Royal London",hadOpportunity:!1},{id:"001Wj00000mCFsR",name:"Ryanair",hadOpportunity:!0},{id:"001Wj00000xyJqd",name:"SCOR",hadOpportunity:!1},{id:"001Wj00000pAxKo",name:"SSP Group",hadOpportunity:!0},{id:"001Wj00000bWIzx",name:"Saint-Gobain",hadOpportunity:!1},{id:"001Wj00000pzTPv",name:"Scottish Friendly",hadOpportunity:!1},{id:"001Wj00000bzz9U",name:"Signify Group",hadOpportunity:!0},{id:"001Wj00000fFuG4",name:"Sky",hadOpportunity:!1},{id:"001Hp00003kIrDR",name:"Smith & Nephew",hadOpportunity:!1},{id:"001Hp00003kIrE1",name:"Societe Generale",hadOpportunity:!1},{id:"001Hp00003kIrMj",name:"State Street",hadOpportunity:!0},{id:"001Wj00000xyy4A",name:"Sudzucker",hadOpportunity:!1},{id:"001Wj00000mCFtB",name:"SurveyMonkey",hadOpportunity:!1},{id:"001Wj00000xypQh",name:"TUI",hadOpportunity:!1},{id:"001Wj00000tWwYT",name:"Takeda",hadOpportunity:!1},{id:"001Wj00000wKD4c",name:"Talanx",hadOpportunity:!1},{id:"001Wj00000mCFr9",name:"Tesco",hadOpportunity:!0},{id:"001Wj00000tWwYX",name:"Tullow Oil",hadOpportunity:!1},{id:"001Wj00000mCFsS",name:"Uniphar PLC",hadOpportunity:!0},{id:"001Hp00003kIrNg",name:"UnitedHealth Group",hadOpportunity:!1},{id:"001Wj00000mCFsx",name:"Vodafone Ireland",hadOpportunity:!1},{id:"001Wj00000xybh4",name:"Wendel",hadOpportunity:!1},{id:"001Wj00000sCb3D",name:"Willis Towers Watson",hadOpportunity:!1},{id:"001Wj00000tWwYY",name:"Winthrop",hadOpportunity:!1},{id:"001Wj00000pzTPW",name:"WizzAir",hadOpportunity:!1},{id:"001Wj00000mCFrm",name:"eShopWorld",hadOpportunity:!0},{id:"001Hp00003kJ9Ck",name:"wnco.com",hadOpportunity:!1}]},"himanshu.agarwal@eudia.com":{email:"himanshu.agarwal@eudia.com",name:"Himanshu Agarwal",accounts:[{id:"001Hp00003kIrEs",name:"AON",hadOpportunity:!0},{id:"001Wj00000RwUpO",name:"Acrisure",hadOpportunity:!0},{id:"001Hp00003kIrCd",name:"Adobe",hadOpportunity:!1},{id:"001Hp00003kIrEU",name:"Albertsons",hadOpportunity:!0},{id:"001Wj00000T6Hrw",name:"Atlassian",hadOpportunity:!0},{id:"001Wj00000ZRrYl",name:"Avis Budget Group",hadOpportunity:!0},{id:"001Wj00000kIYAD",name:"Axis Bank",hadOpportunity:!0},{id:"001Hp00003kIrD0",name:"Broadcom",hadOpportunity:!0},{id:"001Hp00003kIrGh",name:"Costco Wholesale",hadOpportunity:!1},{id:"001Hp00003kIrCu",name:"Disney",hadOpportunity:!1},{id:"001Hp00003kIrIF",name:"Gap",hadOpportunity:!0},{id:"001Hp00003kIrDN",name:"Genpact",hadOpportunity:!0},{id:"001Wj00000Zcmad",name:"Geodis",hadOpportunity:!0},{id:"001Wj00000Q2yaX",name:"Innovative Driven",hadOpportunity:!1},{id:"001Hp00003lhshd",name:"Instacart",hadOpportunity:!0},{id:"001Hp00003kIrJx",name:"Lowe's",hadOpportunity:!1},{id:"001Hp00003kIrDk",name:"Moderna",hadOpportunity:!0},{id:"001Wj00000hDvCc",name:"Nykaa",hadOpportunity:!0},{id:"001Wj00000h9r1F",name:"Piramal Finance",hadOpportunity:!0},{id:"001Hp00003kIrDc",name:"Progressive",hadOpportunity:!0},{id:"001Wj00000cyDxS",name:"Pyxus",hadOpportunity:!0},{id:"001Wj00000XXvnk",name:"Relativity",hadOpportunity:!0},{id:"001Wj00000kIFDh",name:"Reliance",hadOpportunity:!0},{id:"001Wj00000eKsGZ",name:"Snowflake",hadOpportunity:!1},{id:"001Hp00003kIrNr",name:"Visa",hadOpportunity:!0},{id:"001Hp00003kIrO0",name:"Warner Bros Discovery",hadOpportunity:!1},{id:"001Hp00003kIrDT",name:"xAI",hadOpportunity:!0}]},"jon.cobb@eudia.com":{email:"jon.cobb@eudia.com",name:"Jon Cobb",accounts:[{id:"001Wj00000XTOQZ",name:"Armstrong World Industries",hadOpportunity:!0},{id:"001Wj00000c0Cxn",name:"U.S. Aircraft Insurance Group",hadOpportunity:!0}]},"julie.stefanich@eudia.com":{email:"julie.stefanich@eudia.com",name:"Julie Stefanich",accounts:[{id:"001Wj00000asSHB",name:"Airbus",hadOpportunity:!0},{id:"001Hp00003kIrEl",name:"Ameriprise Financial",hadOpportunity:!0},{id:"001Wj00000X6IDs",name:"Andersen",hadOpportunity:!0},{id:"001Hp00003kIrEv",name:"Apple",hadOpportunity:!0},{id:"001Wj00000soLVH",name:"Base Power",hadOpportunity:!0},{id:"001Hp00003kJ9pX",name:"Bayer",hadOpportunity:!0},{id:"001Hp00003kIrFP",name:"Bechtel",hadOpportunity:!0},{id:"001Hp00003kIrFZ",name:"Block",hadOpportunity:!0},{id:"001Hp00003kIrE3",name:"Cargill",hadOpportunity:!0},{id:"001Hp00003kIrGD",name:"Charles Schwab",hadOpportunity:!0},{id:"001Hp00003kIrE4",name:"Chevron",hadOpportunity:!0},{id:"001Hp00003kIrDh",name:"Comcast",hadOpportunity:!0},{id:"001Hp00003kIrGe",name:"Corebridge Financial",hadOpportunity:!0},{id:"001Wj00000eLJAK",name:"CrowdStrike",hadOpportunity:!1},{id:"001Hp00003liBe9",name:"DoorDash",hadOpportunity:!1},{id:"001Hp00003kIrE7",name:"ECMS",hadOpportunity:!0},{id:"001Hp00003kIrHP",name:"Edward Jones",hadOpportunity:!0},{id:"001Wj00000iRzqv",name:"Florida Crystals Corporation",hadOpportunity:!0},{id:"001Wj00000XS3MX",name:"Flutter",hadOpportunity:!0},{id:"001Hp00003kIrIP",name:"Genworth Financial",hadOpportunity:!0},{id:"001Hp00003kIrIX",name:"Goldman Sachs",hadOpportunity:!0},{id:"001Wj00000rceVp",name:"Hikma",hadOpportunity:!0},{id:"001Hp00003kIrJV",name:"KLA",hadOpportunity:!0},{id:"001Wj00000XkT43",name:"Kaiser Permanente",hadOpportunity:!0},{id:"001Wj00000aLmhe",name:"Macmillan",hadOpportunity:!0},{id:"001Wj00000X6G8q",name:"Mainsail Partners",hadOpportunity:!0},{id:"001Hp00003kIrDb",name:"McKinsey & Company",hadOpportunity:!0},{id:"001Hp00003kIrKL",name:"MetLife",hadOpportunity:!0},{id:"001Hp00003kIrCp",name:"Mosaic",hadOpportunity:!0},{id:"001Hp00003kIrDe",name:"National Grid",hadOpportunity:!0},{id:"001Hp00003kIrKY",name:"Netflix",hadOpportunity:!0},{id:"001Hp00003kIrKj",name:"Nordstrom",hadOpportunity:!0},{id:"001Hp00003kIrL2",name:"O'Reilly Automotive",hadOpportunity:!0},{id:"001Hp00003kIrDv",name:"Oracle",hadOpportunity:!0},{id:"001Hp00003kIrLP",name:"PG&E",hadOpportunity:!1},{id:"001Hp00003kIrLH",name:"PayPal inc.",hadOpportunity:!1},{id:"001Hp00003kIrLN",name:"Petsmart",hadOpportunity:!0},{id:"001Hp00003kIrLZ",name:"Procter & Gamble",hadOpportunity:!0},{id:"001Wj00000XcHEb",name:"Resmed",hadOpportunity:!0},{id:"001Hp00003lhsUY",name:"Rio Tinto Group",hadOpportunity:!0},{id:"001Wj00000svQI3",name:"Safelite",hadOpportunity:!0},{id:"001Wj00000Yfysf",name:"Samsara",hadOpportunity:!0},{id:"001Wj00000fRtLm",name:"State Farm",hadOpportunity:!0},{id:"001Hp00003kIrNH",name:"T-Mobile",hadOpportunity:!0},{id:"001Hp00003kIrCr",name:"TIAA",hadOpportunity:!0},{id:"001Wj00000bIVo1",name:"TSMC",hadOpportunity:!0},{id:"001Wj00000bzz9T",name:"Tailored Brands",hadOpportunity:!0},{id:"001Hp00003kIrNB",name:"The Wonderful Company",hadOpportunity:!0},{id:"001Hp00003kIrNV",name:"Uber",hadOpportunity:!0},{id:"001Wj00000Y6VYk",name:"Verifone",hadOpportunity:!0},{id:"001Hp00003kIrOL",name:"World Wide Technology",hadOpportunity:!0},{id:"001Wj00000bWIza",name:"eBay",hadOpportunity:!1}]},"justin.hills@eudia.com":{email:"justin.hills@eudia.com",name:"Justin Hills",accounts:[{id:"001Wj00000vCx6j",name:"1800 Flowers",hadOpportunity:!1},{id:"001Wj00000Y6VM4",name:"Ares Management Corporation",hadOpportunity:!0},{id:"001Hp00003kIrG8",name:"Centene",hadOpportunity:!0},{id:"001Wj00000c9oCv",name:"Cox Media Group",hadOpportunity:!0},{id:"001Wj00000vCPMs",name:"Crusoe",hadOpportunity:!1},{id:"001Wj00000vCiAw",name:"Deel",hadOpportunity:!1},{id:"001Wj00000Y0jPm",name:"Delinea",hadOpportunity:!0},{id:"001Wj00000iwKGQ",name:"Dominos",hadOpportunity:!0},{id:"001Hp00003kIrDa",name:"Duracell",hadOpportunity:!0},{id:"001Wj00000Y6Vde",name:"EPIC Insurance Brokers & Consultants",hadOpportunity:!1},{id:"001Hp00003kIrIC",name:"Freddie Mac",hadOpportunity:!1},{id:"001Hp00003kJ9gW",name:"Genentech",hadOpportunity:!0},{id:"001Hp00003kIrDV",name:"Intel",hadOpportunity:!0},{id:"001Hp00003kIrJJ",name:"Johnson & Johnson",hadOpportunity:!0},{id:"001Wj00000gnrug",name:"Kraken",hadOpportunity:!0},{id:"001Wj00000op4EW",name:"McCormick & Co Inc",hadOpportunity:!0},{id:"001Wj00000RCeqA",name:"Nielsen",hadOpportunity:!0},{id:"001Wj00000YEMZp",name:"Notion",hadOpportunity:!1},{id:"001Wj00000ix7c2",name:"Nouryon",hadOpportunity:!0},{id:"001Wj00000WYyKI",name:"Ramp",hadOpportunity:!0},{id:"001Wj00000hzxnD",name:"Ro Healthcare",hadOpportunity:!1},{id:"001Hp00003kIrMi",name:"Starbucks",hadOpportunity:!0},{id:"001Wj00000o5G0v",name:"StockX",hadOpportunity:!0},{id:"001Wj00000f3bWU",name:"TransUnion",hadOpportunity:!0},{id:"001Wj00000oqRyc",name:"Walgreens Boots Alliance",hadOpportunity:!0}]},"mike.ayres@eudia.com":{email:"mike.ayres@eudia.com",name:"Mike Ayres",accounts:[{id:"001Wj00000synYD",name:"Barry Callebaut Group",hadOpportunity:!1}]},"mike@eudia.com":{email:"mike@eudia.com",name:"Mike Masiello",accounts:[{id:"001Wj00000celOy",name:"Arizona Gov Office",hadOpportunity:!1},{id:"001Wj00000p1lCP",name:"Army Applications Lab",hadOpportunity:!0},{id:"001Wj00000p1hYb",name:"Army Corps of Engineers",hadOpportunity:!0},{id:"001Wj00000ZxEpD",name:"Army Futures Command",hadOpportunity:!0},{id:"001Hp00003lhZrR",name:"DARPA",hadOpportunity:!0},{id:"001Wj00000bWBlA",name:"Defense Innovation Unit (DIU)",hadOpportunity:!0},{id:"001Hp00003kJzoR",name:"Gov - Civ",hadOpportunity:!1},{id:"001Hp00003kJuJ5",name:"Gov - DOD",hadOpportunity:!0},{id:"001Wj00000p1PVH",name:"IFC",hadOpportunity:!0},{id:"001Wj00000UkYiC",name:"MITRE",hadOpportunity:!1},{id:"001Wj00000VVJ31",name:"NATO",hadOpportunity:!0},{id:"001Wj00000Ukxzt",name:"SIIA",hadOpportunity:!1},{id:"001Wj00000p1Ybm",name:"SOCOM",hadOpportunity:!0},{id:"001Wj00000Zwarp",name:"Second Front",hadOpportunity:!1},{id:"001Hp00003lhcL9",name:"Social Security Administration",hadOpportunity:!0},{id:"001Wj00000p1jH3",name:"State of Alaska",hadOpportunity:!0},{id:"001Wj00000hVa6V",name:"State of Arizona",hadOpportunity:!0},{id:"001Wj00000p0PcE",name:"State of California",hadOpportunity:!0},{id:"001Wj00000bWBke",name:"U.S. Air Force",hadOpportunity:!0},{id:"001Wj00000bWIzN",name:"U.S. Army",hadOpportunity:!0},{id:"001Hp00003kIrDU",name:"U.S. Government",hadOpportunity:!1},{id:"001Wj00000p1SRX",name:"U.S. Marine Corps",hadOpportunity:!0},{id:"001Wj00000hfaDc",name:"U.S. Navy",hadOpportunity:!0},{id:"001Wj00000Rrm5O",name:"UK Government",hadOpportunity:!0},{id:"001Hp00003lieJP",name:"USDA",hadOpportunity:!0},{id:"001Wj00000p1SuZ",name:"Vulcan Special Ops",hadOpportunity:!0}]},"mitch.loquaci@eudia.com":{email:"mitch.loquaci@eudia.com",name:"Mitch Loquaci",accounts:[{id:"001Hp00003kIrCn",name:"Home Depot",hadOpportunity:!0},{id:"001Wj00000wlTbU",name:"Mimecast",hadOpportunity:!1},{id:"001Wj00000cpxt0",name:"Novelis",hadOpportunity:!0}]},"nathan.shine@eudia.com":{email:"nathan.shine@eudia.com",name:"Nathan Shine",accounts:[{id:"001Wj00000xy4hv",name:"ASDA Group",hadOpportunity:!1},{id:"001Wj00000xz26A",name:"Achmea",hadOpportunity:!1},{id:"001Wj00000xyb9C",name:"Adient",hadOpportunity:!1},{id:"001Hp00003kIrEn",name:"Amphenol",hadOpportunity:!0},{id:"001Wj00000mCFr3",name:"Ancestry",hadOpportunity:!0},{id:"001Wj00000xxHhF",name:"Ashtead Group",hadOpportunity:!1},{id:"001Wj00000mCFr5",name:"Boomi",hadOpportunity:!1},{id:"001Wj00000mCFrQ",name:"CaliberAI",hadOpportunity:!1},{id:"001Wj00000WiFP8",name:"Cantor Fitzgerald",hadOpportunity:!0},{id:"001Wj00000mCFrj",name:"CarTrawler",hadOpportunity:!0},{id:"001Wj00000xz2UM",name:"Carnival",hadOpportunity:!1},{id:"001Wj00000pzTPd",name:"Circle K",hadOpportunity:!1},{id:"001Wj00000xyP82",name:"Claas Group",hadOpportunity:!1},{id:"001Wj00000bW3KA",name:"Cloud Software Group",hadOpportunity:!1},{id:"001Wj00000mHDBo",name:"Coimisiun na Mean",hadOpportunity:!0},{id:"001Wj00000mCFqt",name:"CommScope Technologies",hadOpportunity:!0},{id:"001Wj00000xz2ZC",name:"Continental",hadOpportunity:!1},{id:"001Wj00000Y6wFZ",name:"Coursera",hadOpportunity:!1},{id:"001Wj00000xz3DV",name:"Credit Mutuel Group",hadOpportunity:!1},{id:"001Wj00000Y6DDY",name:"Credit Suisse",hadOpportunity:!1},{id:"001Wj00000pzTPZ",name:"CubeMatch",hadOpportunity:!1},{id:"001Wj00000pzTPb",name:"Dawn Meats",hadOpportunity:!1},{id:"001Wj00000xxtwB",name:"Deutsche Telekom",hadOpportunity:!1},{id:"001Hp00003kIrDM",name:"Dropbox",hadOpportunity:!0},{id:"001Wj00000mCFra",name:"Dunnes Stores",hadOpportunity:!0},{id:"001Wj00000xxq75",name:"ELO Group",hadOpportunity:!1},{id:"001Wj00000xyEnj",name:"Engie",hadOpportunity:!1},{id:"001Wj00000mCFqu",name:"Fexco",hadOpportunity:!0},{id:"001Wj00000mCFsA",name:"First Derivatives",hadOpportunity:!1},{id:"001Wj00000mCFtD",name:"Flynn O'Driscoll, Business Lawyers",hadOpportunity:!1},{id:"001Wj00000xyMmu",name:"Forvia",hadOpportunity:!1},{id:"001Wj00000xz3Bt",name:"Freudenberg Group",hadOpportunity:!1},{id:"001Wj00000mCFro",name:"GemCap",hadOpportunity:!0},{id:"001Wj00000xxqjp",name:"Groupama",hadOpportunity:!1},{id:"001Wj00000xyFdR",name:"Groupe Eiffage",hadOpportunity:!1},{id:"001Wj00000xxtuZ",name:"Hays",hadOpportunity:!1},{id:"001Wj00000xy4A2",name:"HelloFresh",hadOpportunity:!1},{id:"001Wj00000mCFrq",name:"ID-Pal",hadOpportunity:!1},{id:"001Wj00000xz3IL",name:"ING Group",hadOpportunity:!1},{id:"001Wj00000xz2xN",name:"Inchcape",hadOpportunity:!1},{id:"001Wj00000mCFs5",name:"Indeed",hadOpportunity:!0},{id:"001Wj00000sooaT",name:"Ipsen",hadOpportunity:!1},{id:"001Wj00000mCFss",name:"Irish League of Credit Unions",hadOpportunity:!0},{id:"001Wj00000mCFrS",name:"Irish Life",hadOpportunity:!0},{id:"001Wj00000mCFsV",name:"Irish Residential Properties REIT Plc",hadOpportunity:!1},{id:"001Hp00003kIrJO",name:"Keurig Dr Pepper",hadOpportunity:!0},{id:"001Wj00000hkk0z",name:"Kingspan",hadOpportunity:!0},{id:"001Wj00000mCFrs",name:"Kitman Labs",hadOpportunity:!0},{id:"001Wj00000xy1VZ",name:"LDC Group",hadOpportunity:!1},{id:"001Wj00000mCFtF",name:"Let's Get Checked",hadOpportunity:!1},{id:"001Hp00003kIrJo",name:"Liberty Insurance",hadOpportunity:!1},{id:"001Wj00000xz2yz",name:"Marks and Spencer Group",hadOpportunity:!1},{id:"001Wj00000mCFsM",name:"McDermott Creed & Martyn",hadOpportunity:!0},{id:"001Hp00003kIrKF",name:"McKesson",hadOpportunity:!1},{id:"001Wj00000mCFso",name:"Mediolanum",hadOpportunity:!0},{id:"001Wj00000xyP9g",name:"Munich Re Group",hadOpportunity:!1},{id:"001Wj00000xxIyF",name:"Nationwide Building Society",hadOpportunity:!1},{id:"001Wj00000xxgZB",name:"Nebius Group",hadOpportunity:!1},{id:"001Wj00000symlp",name:"Nestl\xE9 Health Science",hadOpportunity:!1},{id:"001Wj00000xyYPq",name:"Nexans",hadOpportunity:!1},{id:"001Wj00000xybvb",name:"Next",hadOpportunity:!1},{id:"001Wj00000syczN",name:"Nomad Foods",hadOpportunity:!1},{id:"001Wj00000mCFrF",name:"OKG Payments Services Limited",hadOpportunity:!0},{id:"001Wj00000mCFqy",name:"Oneview Healthcare",hadOpportunity:!1},{id:"001Wj00000aCGRB",name:"Optum",hadOpportunity:!1},{id:"001Wj00000sylmX",name:"Orlen",hadOpportunity:!1},{id:"001Wj00000mCFrL",name:"PROS",hadOpportunity:!1},{id:"001Wj00000ZDPUI",name:"Perrigo Pharma",hadOpportunity:!0},{id:"001Wj00000xz33p",name:"Phoenix Pharma",hadOpportunity:!1},{id:"001Wj00000mCFqz",name:"Phoenix Tower International",hadOpportunity:!0},{id:"001Wj00000pzTPf",name:"Pipedrive",hadOpportunity:!1},{id:"001Wj00000mCFtS",name:"Poe Kiely Hogan Lanigan",hadOpportunity:!0},{id:"001Wj00000xxwys",name:"REWE Group",hadOpportunity:!1},{id:"001Wj00000xz3On",name:"Rexel",hadOpportunity:!1},{id:"001Wj00000xyJLy",name:"Royal BAM Group",hadOpportunity:!1},{id:"001Wj00000xysZq",name:"SPIE",hadOpportunity:!1},{id:"001Wj00000xxuVg",name:"SSE",hadOpportunity:!1},{id:"001Wj00000xxk1y",name:"Schaeffler",hadOpportunity:!1},{id:"001Wj00000syeJe",name:"Schott Pharma",hadOpportunity:!1},{id:"001Wj00000mCFrX",name:"South East Financial Services Cluster",hadOpportunity:!1},{id:"001Wj00000mCFry",name:"Spectrum Wellness Holdings Limited",hadOpportunity:!0},{id:"001Wj00000mCFsq",name:"Speed Fibre Group(enet)",hadOpportunity:!0},{id:"001Wj00000mCFtH",name:"StepStone Group",hadOpportunity:!0},{id:"001Hp00003kIrMp",name:"Stryker",hadOpportunity:!1},{id:"001Wj00000pzTPa",name:"SuperNode Ltd",hadOpportunity:!1},{id:"001Wj00000mCFtI",name:"Swish Fibre",hadOpportunity:!1},{id:"001Wj00000SFiOv",name:"TikTok",hadOpportunity:!0},{id:"001Wj00000ZDXTR",name:"Tinder LLC",hadOpportunity:!0},{id:"001Wj00000mCFrC",name:"Tines Security Services Limited",hadOpportunity:!0},{id:"001Wj00000xxQsc",name:"UDG Healthcare",hadOpportunity:!1},{id:"001Wj00000pzTPe",name:"Udaras na Gaeltachta",hadOpportunity:!1},{id:"001Wj00000bWBlE",name:"Udemy",hadOpportunity:!0},{id:"001Wj00000Y6VMX",name:"Unilever",hadOpportunity:!1},{id:"001Wj00000pzTPc",name:"Urban Volt",hadOpportunity:!1},{id:"001Wj00000xwB2o",name:"Vitesco Technologies Group",hadOpportunity:!1},{id:"001Hp00003liCZY",name:"Workday",hadOpportunity:!1},{id:"001Wj00000xyOlT",name:"X5 Retail Group",hadOpportunity:!1},{id:"001Wj00000xyXQZ",name:"Zalando",hadOpportunity:!1},{id:"001Wj00000Y6VZ3",name:"Ziff Davis",hadOpportunity:!1},{id:"001Wj00000mCFsZ",name:"Zurich Irish Life plc",hadOpportunity:!0}]},"nicola.fratini@eudia.com":{email:"nicola.fratini@eudia.com",name:"Nicola Fratini",accounts:[{id:"001Wj00000mCFqs",name:"AIB",hadOpportunity:!0},{id:"001Wj00000tWwXp",name:"AXIS Capital",hadOpportunity:!1},{id:"001Wj00000tWwXh",name:"Actavo Group Ltd",hadOpportunity:!1},{id:"001Wj00000thuKE",name:"Aer Lingus",hadOpportunity:!0},{id:"001Wj00000tWwXi",name:"Aer Rianta",hadOpportunity:!1},{id:"001Wj00000mCFrG",name:"AerCap",hadOpportunity:!0},{id:"001Wj00000YEMaB",name:"Aligned Incentives, a Bureau Veritas company",hadOpportunity:!1},{id:"001Wj00000mCFs7",name:"Allied Irish Banks plc",hadOpportunity:!0},{id:"001Wj00000mCFsb",name:"Amundi Ireland Limited",hadOpportunity:!0},{id:"001Wj00000uZ7w2",name:"Anna Charles",hadOpportunity:!1},{id:"001Wj00000TUdXw",name:"Anthropic",hadOpportunity:!0},{id:"001Wj00000mCFrD",name:"Applegreen",hadOpportunity:!1},{id:"001Wj00000wvc5a",name:"AppliedAI",hadOpportunity:!0},{id:"001Wj00000socke",name:"Archer The Well Company",hadOpportunity:!1},{id:"001Wj00000tWwXl",name:"Ardagh Glass Sales",hadOpportunity:!1},{id:"001Wj00000sgB1h",name:"Autorek",hadOpportunity:!1},{id:"001Wj00000mCFrh",name:"Avant Money",hadOpportunity:!0},{id:"001Wj00000tWwXT",name:"Avantcard",hadOpportunity:!1},{id:"001Wj00000mI7Na",name:"Aviva Insurance",hadOpportunity:!0},{id:"001Wj00000tWwXo",name:"Avolon",hadOpportunity:!1},{id:"001Wj00000uNUIB",name:"Bank of China",hadOpportunity:!0},{id:"001Hp00003kJ9kN",name:"Barclays",hadOpportunity:!0},{id:"001Wj00000ttPZB",name:"Barings",hadOpportunity:!0},{id:"001Wj00000tWwXW",name:"Beauparc Group",hadOpportunity:!0},{id:"001Wj00000xxRyK",name:"Bertelsmann",hadOpportunity:!1},{id:"001Wj00000tWwXX",name:"Bidx1",hadOpportunity:!1},{id:"001Wj00000soanc",name:"Borr Drilling",hadOpportunity:!1},{id:"001Wj00000tWwXu",name:"Boylesports",hadOpportunity:!1},{id:"001Wj00000uYz0o",name:"Bud Financial",hadOpportunity:!1},{id:"001Wj00000tWwXv",name:"Bunzl",hadOpportunity:!1},{id:"001Wj00000xxtGE",name:"Burelle",hadOpportunity:!1},{id:"001Wj00000mCFr0",name:"CNP Santander Insurance Services Limited",hadOpportunity:!0},{id:"001Wj00000tWwXw",name:"Cairn Homes",hadOpportunity:!0},{id:"001Wj00000uZ2hp",name:"Centrica",hadOpportunity:!1},{id:"001Wj00000uYYWv",name:"Checkout.com",hadOpportunity:!1},{id:"001Wj00000Y64qg",name:"Christian Dior Couture",hadOpportunity:!1},{id:"001Wj00000Y6VLh",name:"Citi",hadOpportunity:!0},{id:"001Wj00000mCFrE",name:"Clanwilliam Group",hadOpportunity:!0},{id:"001Wj00000tWwYl",name:"Clevercards",hadOpportunity:!1},{id:"001Wj00000mCFsm",name:"Coca-Cola HBC Ireland Limited",hadOpportunity:!0},{id:"001Wj00000xz30b",name:"Compagnie de l'Odet",hadOpportunity:!1},{id:"001Wj00000xxtOM",name:"Credit Industriel & Commercial",hadOpportunity:!1},{id:"001Wj00000uZ7RN",name:"Cuvva",hadOpportunity:!1},{id:"001Wj00000tx2MQ",name:"CyberArk",hadOpportunity:!0},{id:"001Wj00000tWwY1",name:"DAA",hadOpportunity:!1},{id:"001Wj00000xyNnm",name:"DS Smith",hadOpportunity:!1},{id:"001Wj00000hkk0s",name:"DSM",hadOpportunity:!1},{id:"001Wj00000hfWMt",name:"Dassault Syst?mes",hadOpportunity:!1},{id:"001Wj00000mCFsB",name:"Datalex",hadOpportunity:!0},{id:"001Wj00000mCFrl",name:"Davy",hadOpportunity:!0},{id:"001Wj00000tWwYm",name:"Deliveroo",hadOpportunity:!1},{id:"001Wj00000w0uVV",name:"Doceree",hadOpportunity:!0},{id:"001Wj00000vbvuX",name:"Dole plc",hadOpportunity:!1},{id:"001Wj00000tWwXZ",name:"EVO Payments",hadOpportunity:!1},{id:"001Wj00000xxsvH",name:"EXOR Group",hadOpportunity:!1},{id:"001Wj00000tWwY4",name:"Easons",hadOpportunity:!1},{id:"001Wj00000xz35R",name:"EasyJet",hadOpportunity:!1},{id:"001Wj00000xx4SK",name:"Edeka Zentrale",hadOpportunity:!1},{id:"001Wj00000uJwxo",name:"Eir",hadOpportunity:!0},{id:"001Wj00000tWwY5",name:"Elavon",hadOpportunity:!1},{id:"001Wj00000pzTPn",name:"Euronext Dublin",hadOpportunity:!1},{id:"001Wj00000sg8Gc",name:"FARFETCH",hadOpportunity:!0},{id:"001Wj00000mIEAX",name:"FNZ Group",hadOpportunity:!0},{id:"001Wj00000tWwY7",name:"First Data",hadOpportunity:!1},{id:"001Wj00000soigL",name:"Fresenius Kabi",hadOpportunity:!1},{id:"001Wj00000xyXyQ",name:"FrieslandCampina",hadOpportunity:!1},{id:"001Wj00000xyAP9",name:"GasTerra",hadOpportunity:!1},{id:"001Wj00000mCFt1",name:"Goodbody Stockbrokers",hadOpportunity:!0},{id:"001Wj00000soN5f",name:"Greencore",hadOpportunity:!1},{id:"001Wj00000xyyli",name:"Groupe BPCE",hadOpportunity:!1},{id:"001Wj00000xz9xF",name:"Haleon",hadOpportunity:!1},{id:"001Wj00000xz3S2",name:"Hapag-Lloyd",hadOpportunity:!1},{id:"001Wj00000tWwY9",name:"Henderson Group",hadOpportunity:!1},{id:"001Wj00000Y6VMb",name:"Henkel",hadOpportunity:!1},{id:"001Hp00003liHvf",name:"Hubspot",hadOpportunity:!0},{id:"001Wj00000sg9MN",name:"INNIO Group",hadOpportunity:!1},{id:"001Wj00000bzz9O",name:"IPG Mediabrands",hadOpportunity:!0},{id:"001Wj00000tWwYA",name:"IPL Plastics",hadOpportunity:!1},{id:"001Wj00000ZDXrd",name:"Intercom",hadOpportunity:!0},{id:"001Wj00000tWwYB",name:"Ires Reit",hadOpportunity:!1},{id:"001Wj00000xy2WS",name:"J. Sainsbury",hadOpportunity:!1},{id:"001Wj00000xyG3B",name:"JD Sports Fashion",hadOpportunity:!1},{id:"001Wj00000ullPp",name:"Jet2 Plc",hadOpportunity:!0},{id:"001Wj00000xyIeR",name:"KION Group",hadOpportunity:!1},{id:"001Wj00000tWwXb",name:"Keywords Studios",hadOpportunity:!1},{id:"001Wj00000xxdOO",name:"Kingfisher",hadOpportunity:!1},{id:"001Wj00000xy0o1",name:"Knorr-Bremse",hadOpportunity:!1},{id:"001Wj00000xxuVi",name:"L'Oreal",hadOpportunity:!1},{id:"001Wj00000xwh4I",name:"Landesbank Baden-Wurttemberg",hadOpportunity:!1},{id:"001Wj00000au3sw",name:"Lenovo",hadOpportunity:!0},{id:"001Wj00000sobq8",name:"MOL Magyarorsz\xE1g",hadOpportunity:!1},{id:"001Wj00000xwrq3",name:"Michelin",hadOpportunity:!1},{id:"001Wj00000xz3i9",name:"Mondi Group",hadOpportunity:!1},{id:"001Wj00000xxaf3",name:"NatWest Group",hadOpportunity:!1},{id:"001Wj00000xzFJV",name:"Norddeutsche Landesbank",hadOpportunity:!1},{id:"001Hp00003kIrKm",name:"Northern Trust Management Services",hadOpportunity:!0},{id:"001Wj00000bWIxi",name:"Novo Nordisk",hadOpportunity:!1},{id:"001Wj00000TV1Wz",name:"OpenAi",hadOpportunity:!0},{id:"001Wj00000tWwYh",name:"Origin Enterprises",hadOpportunity:!1},{id:"001Wj00000xz3dJ",name:"Otto",hadOpportunity:!1},{id:"001Wj00000tWwYs",name:"Panda Waste",hadOpportunity:!1},{id:"001Wj00000tWwYJ",name:"Paysafe",hadOpportunity:!1},{id:"001Wj00000souuM",name:"Premier Foods",hadOpportunity:!1},{id:"001Wj00000xyzrT",name:"RWE",hadOpportunity:!1},{id:"001Wj00000u0eJp",name:"Re-Turn",hadOpportunity:!0},{id:"001Wj00000xyAdg",name:"SGAM La Mondiale",hadOpportunity:!1},{id:"001Wj00000sg2T0",name:"SHEIN",hadOpportunity:!0},{id:"001Wj00000hfaEC",name:"Safran",hadOpportunity:!1},{id:"001Wj00000sonmQ",name:"Sandoz",hadOpportunity:!1},{id:"001Wj00000xz9ik",name:"Savencia",hadOpportunity:!1},{id:"001Wj00000xyGKs",name:"Sodexo",hadOpportunity:!1},{id:"001Wj00000c9oD6",name:"Stripe",hadOpportunity:!0},{id:"001Hp00003kKrS0",name:"Sword Health",hadOpportunity:!0},{id:"001Wj00000soZus",name:"Tate & Lyle",hadOpportunity:!1},{id:"001Wj00000mEEkG",name:"Team Car Care dba Jiffy Lube",hadOpportunity:!0},{id:"001Hp00003kIrN0",name:"Teleperformance",hadOpportunity:!1},{id:"001Wj00000vzG8f",name:"Temu",hadOpportunity:!1},{id:"001Wj00000xy9fz",name:"Tennet Holding",hadOpportunity:!1},{id:"001Wj00000tWwXf",name:"The Est\xE9e Lauder Companies Inc.",hadOpportunity:!1},{id:"001Wj00000Y6DDc",name:"The HEINEKEN Company",hadOpportunity:!1},{id:"001Wj00000tWwYV",name:"The Irish Stock Exchange",hadOpportunity:!1},{id:"001Wj00000xxp7o",name:"Thuga Holding",hadOpportunity:!1},{id:"001Wj00000xyBgC",name:"ThyssenKrupp",hadOpportunity:!1},{id:"001Wj00000tWwYW",name:"Total Produce plc",hadOpportunity:!1},{id:"001Wj00000xxxLU",name:"TotalEnergies",hadOpportunity:!1},{id:"001Wj00000mIBpN",name:"Transworld Business Advisors",hadOpportunity:!0},{id:"001Wj00000mCFs1",name:"Twitter",hadOpportunity:!0},{id:"001Wj00000xV8Vg",name:"UNHCR, the UN Refugee Agency",hadOpportunity:!0},{id:"001Wj00000xxo5I",name:"United Internet",hadOpportunity:!1},{id:"001Wj00000bWIzw",name:"Veolia | Water Tech",hadOpportunity:!1},{id:"001Hp00003kIrDA",name:"Verizon",hadOpportunity:!0},{id:"001Wj00000tWwXd",name:"Virgin Media Ireland Limited",hadOpportunity:!1},{id:"001Wj00000sgaj9",name:"Volkswagon",hadOpportunity:!0},{id:"001Wj00000ZDTG9",name:"Waystone",hadOpportunity:!0},{id:"001Wj00000pB5DX",name:"White Swan Data",hadOpportunity:!0},{id:"001Wj00000xwL2A",name:"Wm. Morrison Supermarkets",hadOpportunity:!1},{id:"001Wj00000mIB6E",name:"Zendesk",hadOpportunity:!0},{id:"001Wj00000S4r49",name:"Zoom",hadOpportunity:!0}]},"olivia.jung@eudia.com":{email:"olivia.jung@eudia.com",name:"Olivia Jung",accounts:[{id:"001Hp00003kIrED",name:"3M",hadOpportunity:!1},{id:"001Hp00003kIrEK",name:"ADP",hadOpportunity:!1},{id:"001Hp00003kIrEO",name:"AES",hadOpportunity:!0},{id:"001Hp00003kIrEG",name:"AbbVie",hadOpportunity:!1},{id:"001Wj00000mCFrd",name:"Airship Group Inc",hadOpportunity:!0},{id:"001Hp00003kIrET",name:"Albemarle",hadOpportunity:!1},{id:"001Hp00003kIrEZ",name:"Ally Financial",hadOpportunity:!1},{id:"001Hp00003kIrEc",name:"Altria Group",hadOpportunity:!1},{id:"001Hp00003kIrEf",name:"Ameren",hadOpportunity:!1},{id:"001Hp00003kIrEi",name:"American Family Insurance Group",hadOpportunity:!1},{id:"001Wj00000YIOI1",name:"Aptiv",hadOpportunity:!0},{id:"001Hp00003kIrFA",name:"Astellas",hadOpportunity:!0},{id:"001Hp00003kIrFD",name:"Autoliv",hadOpportunity:!1},{id:"001Hp00003kIrDJ",name:"Avery Dennison",hadOpportunity:!1},{id:"001Hp00003kIrDG",name:"Bain",hadOpportunity:!0},{id:"001Hp00003kIrFL",name:"Bank of America",hadOpportunity:!0},{id:"001Hp00003kIrFN",name:"Bath & Body Works",hadOpportunity:!1},{id:"001Hp00003kIrFQ",name:"Becton Dickinson",hadOpportunity:!1},{id:"001Hp00003kIrFV",name:"Best Buy",hadOpportunity:!0},{id:"001Hp00003kIrDY",name:"Blackstone",hadOpportunity:!0},{id:"001Hp00003kIrFb",name:"Boeing",hadOpportunity:!0},{id:"001Hp00003kIrFf",name:"BorgWarner",hadOpportunity:!1},{id:"001Hp00003kIrFk",name:"Bristol-Myers Squibb",hadOpportunity:!0},{id:"001Hp00003kIrFo",name:"Burlington Stores",hadOpportunity:!1},{id:"001Wj00000Y6VLn",name:"CHANEL",hadOpportunity:!1},{id:"001Hp00003kIrGK",name:"CHS",hadOpportunity:!0},{id:"001Hp00003kJ9kw",name:"CSL",hadOpportunity:!0},{id:"001Hp00003kIrGq",name:"CVS Health",hadOpportunity:!1},{id:"001Hp00003kIrG7",name:"Cencora (formerly AmerisourceBergen)",hadOpportunity:!1},{id:"001Hp00003kIrGE",name:"Charter Communications",hadOpportunity:!0},{id:"001Hp00003kIrDZ",name:"Ciena",hadOpportunity:!0},{id:"001Hp00003kIrGL",name:"Cintas",hadOpportunity:!1},{id:"001Wj00000c6df9",name:"Clear",hadOpportunity:!0},{id:"001Wj00000eLOI4",name:"Cleveland Clinic",hadOpportunity:!1},{id:"001Hp00003kIrGO",name:"Cleveland-Cliffs",hadOpportunity:!1},{id:"001Hp00003kIrGQ",name:"Coca-Cola",hadOpportunity:!1},{id:"001Hp00003kIrGX",name:"Conagra Brands",hadOpportunity:!1},{id:"001Hp00003kIrGZ",name:"Consolidated Edison",hadOpportunity:!0},{id:"001Wj00000jK5Hl",name:"Crate & Barrel",hadOpportunity:!0},{id:"001Hp00003kIrGo",name:"Cummins",hadOpportunity:!0},{id:"001Hp00003kIrGu",name:"Danaher",hadOpportunity:!1},{id:"001Wj00000bzz9R",name:"Datadog",hadOpportunity:!0},{id:"001Wj00000aZvt9",name:"Dolby",hadOpportunity:!0},{id:"001Hp00003kIrHB",name:"Dominion Energy",hadOpportunity:!1},{id:"001Hp00003kIrHE",name:"Dow",hadOpportunity:!1},{id:"001Hp00003kIrHH",name:"Duke Energy",hadOpportunity:!1},{id:"001Wj00000hkk0j",name:"Etsy",hadOpportunity:!0},{id:"001Hp00003kIrI7",name:"Ford",hadOpportunity:!1},{id:"001Hp00003kIrIL",name:"General Dynamics",hadOpportunity:!1},{id:"001Wj00000ScUQ3",name:"General Electric",hadOpportunity:!1},{id:"001Hp00003kIrIN",name:"General Motors",hadOpportunity:!1},{id:"001Hp00003kIrIS",name:"Gilead Sciences",hadOpportunity:!0},{id:"001Hp00003kIrE8",name:"Graybar Electric",hadOpportunity:!0},{id:"001Hp00003kIrDO",name:"Guardian Life Ins",hadOpportunity:!0},{id:"001Wj00000dvgdb",name:"HealthEquity",hadOpportunity:!0},{id:"001Hp00003kIrJ9",name:"Intuit",hadOpportunity:!0},{id:"001Wj00000aLlyV",name:"J.Crew",hadOpportunity:!0},{id:"001Hp00003kKKMc",name:"JPmorganchase",hadOpportunity:!0},{id:"001Hp00003kIrJI",name:"John Deere",hadOpportunity:!1},{id:"001Hp00003kIrDQ",name:"Jones Lang LaSalle",hadOpportunity:!0},{id:"001Wj00000hfaE1",name:"Lowe",hadOpportunity:!1},{id:"001Hp00003kIrDj",name:"Marsh McLennan",hadOpportunity:!0},{id:"001Hp00003kIrEA",name:"Mastercard",hadOpportunity:!0},{id:"001Wj00000QBapC",name:"Mayo Clinic",hadOpportunity:!1},{id:"001Hp00003kIrD7",name:"McDonald's",hadOpportunity:!1},{id:"001Hp00003kIrD8",name:"Medtronic",hadOpportunity:!0},{id:"001Hp00003kIrKK",name:"Merck",hadOpportunity:!0},{id:"001Hp00003kJ9lG",name:"Meta",hadOpportunity:!0},{id:"001Hp00003kIrKS",name:"Mondelez International",hadOpportunity:!0},{id:"001Hp00003kIrKU",name:"Motorola Solutions",hadOpportunity:!0},{id:"001Wj00000Y6VYj",name:"NBCUniversal",hadOpportunity:!1},{id:"001Wj00000j3QN2",name:"Nasdaq Private Market",hadOpportunity:!1},{id:"001Hp00003kIrCq",name:"Nationwide Insurance",hadOpportunity:!1},{id:"001Wj00000Y6VML",name:"Nestle",hadOpportunity:!1},{id:"001Hp00003kIrLF",name:"Paramount",hadOpportunity:!1},{id:"001Hp00003kIrLO",name:"Pfizer",hadOpportunity:!0},{id:"001Wj00000wzgaP",name:"Philip Morris International",hadOpportunity:!1},{id:"001Hp00003kIrLa",name:"Prudential",hadOpportunity:!1},{id:"001Hp00003kIrLp",name:"Raytheon Technologies",hadOpportunity:!1},{id:"001Hp00003kIrDz",name:"Shopify",hadOpportunity:!0},{id:"001Wj00000eLWPF",name:"Stellantis",hadOpportunity:!1},{id:"001Wj00000iS9AJ",name:"TE Connectivity",hadOpportunity:!0},{id:"001Hp00003kIrMx",name:"Target",hadOpportunity:!1},{id:"001Wj00000PjGDa",name:"The Weir Group PLC",hadOpportunity:!0},{id:"001Hp00003kIrDF",name:"Thermo Fisher Scientific",hadOpportunity:!0},{id:"001Hp00003kIrCw",name:"Toshiba US",hadOpportunity:!0},{id:"001Hp00003kIrNb",name:"Unisys",hadOpportunity:!0},{id:"001Hp00003kIrO7",name:"Wells Fargo",hadOpportunity:!0},{id:"001Wj00000kD7MA",name:"Wellspan Health",hadOpportunity:!0},{id:"001Hp00003kIrOA",name:"Western Digital",hadOpportunity:!0},{id:"001Wj00000kD3s1",name:"White Cap",hadOpportunity:!0}]},"rajeev.patel@eudia.com":{email:"rajeev.patel@eudia.com",name:"Rajeev Patel",accounts:[{id:"001Wj00000fFW35",name:"Alnylam Pharmaceuticals",hadOpportunity:!0},{id:"001Wj00000woNmQ",name:"Beiersdorf",hadOpportunity:!1},{id:"001Wj00000vCOx2",name:"Cambridge Associates",hadOpportunity:!1},{id:"001Wj00000wE56T",name:"Care Vet Health",hadOpportunity:!1},{id:"001Wj00000dIjyB",name:"CareVet, LLC",hadOpportunity:!1},{id:"001Wj00000xZEkY",name:"Modern Treasury",hadOpportunity:!1},{id:"001Wj00000vv2vX",name:"Nextdoor",hadOpportunity:!1}]},"riley.stack@eudia.com":{email:"riley.stack@eudia.com",name:"Riley Stack",accounts:[{id:"001Wj00000XiEDy",name:"Coinbase",hadOpportunity:!0},{id:"001Wj00000YEMa8",name:"Turing",hadOpportunity:!0}]},"sean.boyd@eudia.com":{email:"sean.boyd@eudia.com",name:"Sean Boyd",accounts:[{id:"001Hp00003kIrE9",name:"IQVIA",hadOpportunity:!0}]},"tom.clancy@eudia.com":{email:"tom.clancy@eudia.com",name:"Tom Clancy",accounts:[{id:"001Wj00000pB30V",name:"AIR (Advanced Inhalation Rituals)",hadOpportunity:!0},{id:"001Wj00000qLRqW",name:"ASML",hadOpportunity:!0},{id:"001Wj00000xyA0y",name:"Aegon",hadOpportunity:!1},{id:"001Wj00000xxpcR",name:"Air France-KLM Group",hadOpportunity:!1},{id:"001Wj00000xyIg2",name:"Akzo Nobel",hadOpportunity:!1},{id:"001Wj00000qFynV",name:"Alexion Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000xwuUW",name:"Alstom",hadOpportunity:!1},{id:"001Wj00000xxtL6",name:"Anglo American",hadOpportunity:!1},{id:"001Wj00000syHJt",name:"Aryzta",hadOpportunity:!1},{id:"001Wj00000tWwXq",name:"BAM Ireland",hadOpportunity:!1},{id:"001Wj00000c9oCe",name:"BLDG Management Co., Inc.",hadOpportunity:!0},{id:"001Wj00000hfWN1",name:"Balfour Beatty US",hadOpportunity:!1},{id:"001Wj00000fFuFM",name:"Bank of Ireland",hadOpportunity:!0},{id:"001Wj00000xy23Q",name:"Bayerische Landesbank",hadOpportunity:!1},{id:"001Wj00000tWwXt",name:"Boots",hadOpportunity:!1},{id:"001Wj00000xyIOL",name:"Ceconomy",hadOpportunity:!1},{id:"001Wj00000tWwXx",name:"Chanelle Pharma",hadOpportunity:!1},{id:"001Hp00003kIrD3",name:"Cisco Systems",hadOpportunity:!0},{id:"001Wj00000xyqxq",name:"Computacenter",hadOpportunity:!1},{id:"001Wj00000xy0ss",name:"Constellium",hadOpportunity:!1},{id:"001Wj00000Y6Vk0",name:"Credit Agricole CIB",hadOpportunity:!1},{id:"001Wj00000xwf7G",name:"Daimler Truck Holding",hadOpportunity:!1},{id:"001Wj00000xyaWU",name:"Delivery Hero",hadOpportunity:!1},{id:"001Wj00000mCFsz",name:"Electricity Supply Board",hadOpportunity:!0},{id:"001Wj00000sp0Bl",name:"Ensco PLC",hadOpportunity:!1},{id:"001Wj00000xz374",name:"EssilorLuxottica",hadOpportunity:!1},{id:"001Wj00000hfaDT",name:"Experian",hadOpportunity:!1},{id:"001Wj00000tWwY6",name:"Fineos",hadOpportunity:!1},{id:"001Wj00000mCFsd",name:"Fujitsu",hadOpportunity:!1},{id:"001Wj00000mCFrc",name:"Glanbia",hadOpportunity:!0},{id:"001Wj00000mHuzr",name:"IHRB",hadOpportunity:!1},{id:"001Wj00000xy9Ho",name:"Imperial Brands",hadOpportunity:!1},{id:"001Wj00000sp1nl",name:"Ina Groupa",hadOpportunity:!1},{id:"001Wj00000xz3ev",name:"Infineon",hadOpportunity:!1},{id:"001Wj00000xyMzn",name:"JDE Peet's",hadOpportunity:!1},{id:"001Wj00000hfWN2",name:"Jazz Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000soxsD",name:"Jazz Pharmaceuticals",hadOpportunity:!1},{id:"001Wj00000xxtcq",name:"John Lewis Partnership",hadOpportunity:!1},{id:"001Wj00000tWwYo",name:"Just Eat",hadOpportunity:!1},{id:"001Wj00000xz3jl",name:"KfW Group",hadOpportunity:!1},{id:"001Wj00000tWwYD",name:"Ladbrokes",hadOpportunity:!1},{id:"001Wj00000xystC",name:"Lanxess Group",hadOpportunity:!1},{id:"001Wj00000vRNFu",name:"Legal & General",hadOpportunity:!1},{id:"001Wj00000xxgZC",name:"Legrand",hadOpportunity:!1},{id:"001Wj00000Y64qm",name:"Louis Dreyfus Company",hadOpportunity:!1},{id:"001Wj00000xyGRQ",name:"Lufthansa Group",hadOpportunity:!1},{id:"001Wj00000pA6d7",name:"Masdar Future Energy Company",hadOpportunity:!0},{id:"001Wj00000xz0xC",name:"Metro",hadOpportunity:!1},{id:"001Wj00000xzAen",name:"Motability Operations Group",hadOpportunity:!1},{id:"001Wj00000mCFrv",name:"Ornua",hadOpportunity:!1},{id:"001Hp00003kIrLK",name:"Pepsi",hadOpportunity:!1},{id:"001Wj00000qFudS",name:"Pluralsight",hadOpportunity:!1},{id:"001Wj00000xyODc",name:"Puma",hadOpportunity:!1},{id:"001Wj00000iC14Z",name:"RELX",hadOpportunity:!1},{id:"001Wj00000tWwYj",name:"Rabobank",hadOpportunity:!1},{id:"001Wj00000xyU9M",name:"Reckitt Benckiser",hadOpportunity:!1},{id:"001Wj00000xz3bh",name:"Rentokil Initial",hadOpportunity:!1},{id:"001Wj00000sp1hL",name:"SBM Offshore",hadOpportunity:!1},{id:"001Wj00000xybkK",name:"SHV Holdings",hadOpportunity:!1},{id:"001Wj00000xz3gX",name:"SNCF Group",hadOpportunity:!1},{id:"001Wj00000tWwYt",name:"Sage",hadOpportunity:!1},{id:"001Wj00000sGEuO",name:"Sanofi",hadOpportunity:!1},{id:"001Wj00000qL7AG",name:"Seismic",hadOpportunity:!0},{id:"001Wj00000soyhp",name:"Stada Group",hadOpportunity:!1},{id:"001Wj00000xytSg",name:"Standard Chartered",hadOpportunity:!1},{id:"001Wj00000tWwYq",name:"Symantec",hadOpportunity:!1},{id:"001Wj00000pAPW2",name:"Tarmac",hadOpportunity:!0},{id:"001Wj00000xxvA1",name:"Technip Energies",hadOpportunity:!1},{id:"001Wj00000tWwYU",name:"Tegral Building Products",hadOpportunity:!1},{id:"001Wj00000fFuFq",name:"The Boots Group",hadOpportunity:!1},{id:"001Wj00000tWwYk",name:"Three",hadOpportunity:!1},{id:"001Wj00000xy5HP",name:"Trane Technologies",hadOpportunity:!1},{id:"001Wj00000sohCP",name:"Trans Ocean",hadOpportunity:!1},{id:"001Wj00000mCFtO",name:"Uisce Eireann (Irish Water)",hadOpportunity:!0},{id:"001Wj00000xyQ5k",name:"Uniper",hadOpportunity:!1},{id:"001Wj00000xz1GY",name:"Valeo",hadOpportunity:!1},{id:"001Wj00000pBibT",name:"Version1",hadOpportunity:!0},{id:"001Wj00000xy2BT",name:"Vivendi",hadOpportunity:!1},{id:"001Wj00000xyulK",name:"Wacker Chemie",hadOpportunity:!1},{id:"001Wj00000tWwYZ",name:"Wyeth Nutritionals Ireland",hadOpportunity:!1},{id:"001Wj00000mI9qo",name:"XACT Data Discovery",hadOpportunity:!0},{id:"001Wj00000xyq3P",name:"ZF Friedrichshafen",hadOpportunity:!1}]}}},H=class{constructor(a){this.cachedData=null;this.serverUrl=a}async getAccountsForUser(a){return(await this.getAccountsWithProspects(a)).accounts}async getAccountsWithProspects(a){let e=a.toLowerCase().trim(),t=await this.fetchFromServerWithProspects(e);if(t&&(t.accounts.length>0||t.prospects.length>0))return console.log(`[AccountOwnership] Got ${t.accounts.length} active + ${t.prospects.length} prospects from server for ${e}`),t;console.log(`[AccountOwnership] Using static data fallback for ${e}`);let n=this.getAccountsFromStatic(e),i=n.filter(s=>s.hadOpportunity!==!1),r=n.filter(s=>s.hadOpportunity===!1);return{accounts:i,prospects:r}}getAccountsFromStatic(a){if(_e(a)==="sales_leader"){let r=Ge(a);if(r.length===0)return console.log(`[AccountOwnership] No direct reports found for sales leader: ${a}`),[];let s=new Map;for(let l of r){let c=N.businessLeads[l];if(c)for(let d of c.accounts)s.has(d.id)||s.set(d.id,{...d,isOwned:!1})}let o=Array.from(s.values()).sort((l,c)=>l.name.localeCompare(c.name));return console.log(`[AccountOwnership] Found ${o.length} static accounts for sales leader ${a} (from ${r.length} direct reports)`),o}let t=N.businessLeads[a],n=t?t.accounts.map(r=>({...r,isOwned:!0})):[],i=Be[a];if(i){let r=ge(i),s=new Set(n.map(l=>l.id));for(let l of r){let c=N.businessLeads[l];if(c)for(let d of c.accounts)s.has(d.id)||(n.push({...d,isOwned:!1}),s.add(d.id))}let o=n.sort((l,c)=>l.name.localeCompare(c.name));return console.log(`[AccountOwnership] Pod-view user ${a} (${i}): ${o.length} static accounts (${t?.accounts.length||0} owned + region)`),o}return t?(console.log(`[AccountOwnership] Found ${t.accounts.length} static accounts for ${a} (own accounts only)`),t.accounts):(console.log(`[AccountOwnership] No static mapping found for: ${a}`),[])}async fetchFromServer(a){let e=await this.fetchFromServerWithProspects(a);return e?e.accounts:null}async fetchFromServerWithProspects(a){let e=`${this.serverUrl}/api/accounts/ownership/${encodeURIComponent(a)}`;console.log(`[AccountOwnership] Fetching accounts from: ${e}`);let t=n=>({id:n.id,name:n.name,type:n.type||"Prospect",hadOpportunity:n.hadOpportunity??!0,website:n.website||void 0,industry:n.industry||void 0});try{let{requestUrl:n}=await import("obsidian"),i=await n({url:e,method:"GET",headers:{Accept:"application/json"},throw:!1});if(console.log(`[AccountOwnership] requestUrl status: ${i.status}`),i.status===200&&i.json?.success){let r=(i.json.accounts||[]).map(t),s=(i.json.prospectAccounts||[]).map(t);return console.log(`[AccountOwnership] requestUrl success: ${r.length} accounts, ${s.length} prospects`),{accounts:r,prospects:s}}console.log("[AccountOwnership] requestUrl returned non-success:",i.status,i.json?.message||"")}catch(n){console.error("[AccountOwnership] requestUrl failed:",n?.message||n)}try{console.log("[AccountOwnership] Trying native fetch fallback...");let n=await fetch(e,{method:"GET",headers:{Accept:"application/json"}});if(console.log(`[AccountOwnership] fetch status: ${n.status}`),n.ok){let i=await n.json();if(i?.success){let r=(i.accounts||[]).map(t),s=(i.prospectAccounts||[]).map(t);return console.log(`[AccountOwnership] fetch success: ${r.length} accounts, ${s.length} prospects`),{accounts:r,prospects:s}}}}catch(n){console.error("[AccountOwnership] Native fetch also failed:",n?.message||n)}return console.warn(`[AccountOwnership] Both requestUrl and fetch failed for ${a}`),null}async getNewAccounts(a,e){let t=await this.getAccountsForUser(a),n=e.map(i=>i.toLowerCase().trim());return t.filter(i=>{let r=i.name.toLowerCase().trim();return!n.some(s=>s===r||s.startsWith(r)||r.startsWith(s))})}findTeamLeader(a){let e=a.toLowerCase().trim();for(let[t,n]of Object.entries(ee))if(n.includes(e))return t;return null}hasUser(a){return a.toLowerCase().trim()in N.businessLeads}getAllBusinessLeads(){return Object.keys(N.businessLeads)}getBusinessLead(a){let e=a.toLowerCase().trim();return N.businessLeads[e]||null}getDataVersion(){return N.version}async getAllAccountsForAdmin(a){let e=a.toLowerCase().trim();if(!M(e))return console.log(`[AccountOwnership] ${e} is not an admin, returning owned accounts only`),this.getAccountsForUser(e);let t=await this.fetchAllAccountsFromServer();if(t&&t.length>0){let n=await this.getAccountsForUser(e),i=new Set(n.map(r=>r.id));return t.map(r=>({...r,isOwned:i.has(r.id)}))}return console.log("[AccountOwnership] Using static data fallback for admin all-accounts"),this.getAllAccountsFromStatic(e)}getAllAccountsFromStatic(a){let e=new Map,t=new Set,n=N.businessLeads[a];if(n)for(let i of n.accounts)t.add(i.id),e.set(i.id,{...i,isOwned:!0});for(let i of Object.values(N.businessLeads))for(let r of i.accounts)e.has(r.id)||e.set(r.id,{...r,isOwned:!1});return Array.from(e.values()).sort((i,r)=>i.name.localeCompare(r.name))}async getCSAccounts(a){let e=a.toLowerCase().trim();console.log(`[AccountOwnership] Fetching CS accounts for: ${e}`);let t=3,n=3e3;for(let r=1;r<=t;r++)try{let{requestUrl:s,Notice:o}=await import("obsidian");console.log(`[AccountOwnership] CS fetch attempt ${r}/${t} for ${e}`);let l=await s({url:`${this.serverUrl}/api/bl-accounts/${encodeURIComponent(e)}`,method:"GET",headers:{Accept:"application/json"},throw:!1});if(console.log(`[AccountOwnership] CS fetch response status: ${l.status}`),l.status===200&&l.json?.success){let c=(l.json.accounts||[]).map(p=>({id:p.id,name:p.name,type:p.customerType||p.type||"Customer",isOwned:!1,hadOpportunity:!0,website:p.website||null,industry:p.industry||null,ownerName:p.ownerName||null,csmName:p.csmName||null})),d=(l.json.prospectAccounts||[]).map(p=>({id:p.id,name:p.name,type:p.customerType||p.type||"Prospect",isOwned:!1,hadOpportunity:!1,website:p.website||null,industry:p.industry||null,ownerName:p.ownerName||null,csmName:p.csmName||null}));if(c.length>0)return console.log(`[AccountOwnership] CS accounts for ${e}: ${c.length} active + ${d.length} prospects`),new o(`Found ${c.length} CS accounts`),{accounts:c,prospects:d};if(console.warn(`[AccountOwnership] CS fetch attempt ${r}: server returned success but 0 accounts (Salesforce not ready)`),r<t){console.log(`[AccountOwnership] Retrying in ${n}ms...`),await new Promise(p=>setTimeout(p,n));continue}}else console.warn(`[AccountOwnership] CS fetch attempt ${r} returned status ${l.status} for ${e}`),r<t&&(console.log(`[AccountOwnership] Retrying in ${n}ms...`),await new Promise(c=>setTimeout(c,n)))}catch(s){console.error(`[AccountOwnership] CS account fetch attempt ${r} failed for ${e}:`,s),r<t&&(console.log(`[AccountOwnership] Retrying in ${n}ms after error...`),await new Promise(o=>setTimeout(o,n)))}console.warn(`[AccountOwnership] Server returned no CS accounts after ${t} attempts. Using static fallback (${D.length} accounts).`);let{Notice:i}=await import("obsidian");return new i(`Loading ${D.length} CS accounts (server warming up)`),{accounts:[...D],prospects:[]}}async fetchAllAccountsFromServer(){try{let{requestUrl:a}=await import("obsidian"),e=await a({url:`${this.serverUrl}/api/accounts/all`,method:"GET",headers:{Accept:"application/json"}});return e.json?.success&&e.json?.accounts?e.json.accounts.map(t=>({id:t.id,name:t.name,type:t.type||"Prospect"})):null}catch(a){return console.log("[AccountOwnership] Server fetch all accounts failed:",a),null}}};var fe=[{value:"America/New_York",label:"Eastern Time (ET)"},{value:"America/Chicago",label:"Central Time (CT)"},{value:"America/Denver",label:"Mountain Time (MT)"},{value:"America/Los_Angeles",label:"Pacific Time (PT)"},{value:"Europe/London",label:"London (GMT/BST)"},{value:"Europe/Dublin",label:"Dublin (GMT/IST)"},{value:"Europe/Paris",label:"Central Europe (CET)"},{value:"Europe/Berlin",label:"Berlin (CET)"},{value:"UTC",label:"UTC"}],ze={serverUrl:"https://gtm-wizard.onrender.com",accountsFolder:"Accounts",recordingsFolder:"Recordings",syncOnStartup:!0,autoSyncAfterTranscription:!0,saveAudioFiles:!0,appendTranscript:!0,lastSyncTime:null,cachedAccounts:[],enableSmartTags:!0,showCalendarView:!0,userEmail:"",setupCompleted:!1,calendarConfigured:!1,salesforceConnected:!1,accountsImported:!1,importedAccountCount:0,timezone:"America/New_York",lastAccountRefreshDate:null,archiveRemovedAccounts:!0,syncAccountsOnStartup:!0,sfAutoSyncEnabled:!0,sfAutoSyncIntervalMinutes:15,audioCaptureMode:"full_call",audioMicDeviceId:"",audioSystemDeviceId:"",audioSetupDismissed:!1,meetingTemplate:"meddic",lastUpdateVersion:null,lastUpdateTimestamp:null,pendingUpdateVersion:null,healQueue:[]},te=class{constructor(a,e=""){this.enabled=!0;this.pluginVersion="4.9.0";this.serverUrl=a,this.userEmail=e}setUserEmail(a){this.userEmail=a}async reportError(a,e){this.enabled&&this.send("error",a,e)}async reportWarning(a,e){this.enabled&&this.send("warning",a,e)}async reportInfo(a,e){this.enabled&&this.send("info",a,e)}async sendHeartbeat(a,e){if(!this.enabled||!this.userEmail)return null;try{return(await(0,u.requestUrl)({url:`${this.serverUrl}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"heartbeat",userEmail:this.userEmail,pluginVersion:this.pluginVersion,platform:"obsidian",accountCount:a,connections:e})})).json}catch{return null}}async reportSync(a){if(this.enabled)try{(0,u.requestUrl)({url:`${this.serverUrl}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"sync",userEmail:this.userEmail||"anonymous",pluginVersion:this.pluginVersion,platform:"obsidian",context:a})}).catch(()=>{})}catch{}}async checkForPushedConfig(){if(!this.userEmail)return[];try{let a=await(0,u.requestUrl)({url:`${this.serverUrl}/api/admin/users/${encodeURIComponent(this.userEmail)}/config`,method:"GET",headers:{"Content-Type":"application/json"}});return a.json?.hasUpdates&&a.json?.updates?(console.log("[Eudia] Received pushed config from admin:",a.json.updates),a.json.updates):[]}catch{return[]}}async reportRecordingStart(a){this.enabled&&this.send("recording_start","Recording started",a)}async reportRecordingStop(a){this.enabled&&this.send("recording_stop",`Recording stopped (${a.durationSec}s)`,a)}async reportTranscriptionResult(a){if(!this.enabled)return;let e=a.success?`Transcription complete (${a.transcriptLength} chars)`:`Transcription failed: ${a.error||"unknown"}`;this.send("transcription_result",e,a)}async reportAutoHealScan(a){this.enabled&&this.send("autoheal_scan",`AutoHeal: ${a.healed} healed, ${a.failed} failed`,a)}async reportUpdateCheck(a){this.enabled&&this.send("update_check",`Update check: ${a.updateResult}`,a)}async reportSafetyNetFailure(a){this.enabled&&this.send("safety_net_failure",`Safety net save failed: ${a.error}`,a)}async send(a,e,t){try{(0,u.requestUrl)({url:`${this.serverUrl}/api/plugin/telemetry`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:a,message:e,context:t,userEmail:this.userEmail||"anonymous",pluginVersion:this.pluginVersion,platform:"obsidian"})}).catch(()=>{})}catch{}}},G="eudia-calendar-view",B="eudia-setup-view",L="eudia-live-query-view",ne=class extends u.EditorSuggest{constructor(a,e){super(a),this.plugin=e}onTrigger(a,e,t){let n=e.getLine(a.line),i=e.getValue(),r=e.posToOffset(a),s=i.indexOf("---"),o=i.indexOf("---",s+3);if(s===-1||r<s||r>o)return null;let l=n.match(/^account:\s*(.*)$/);if(!l)return null;let c=l[1].trim(),d=n.indexOf(":")+1,p=n.substring(d).match(/^\s*/)?.[0].length||0;return{start:{line:a.line,ch:d+p},end:a,query:c}}getSuggestions(a){let e=a.query.toLowerCase(),t=this.plugin.settings.cachedAccounts;return e?t.filter(n=>n.name.toLowerCase().includes(e)).sort((n,i)=>{let r=n.name.toLowerCase().startsWith(e),s=i.name.toLowerCase().startsWith(e);return r&&!s?-1:s&&!r?1:n.name.localeCompare(i.name)}).slice(0,10):t.slice(0,10)}renderSuggestion(a,e){e.createEl("div",{text:a.name,cls:"suggestion-title"})}selectSuggestion(a,e){this.context&&this.context.editor.replaceRange(a.name,this.context.start,this.context.end)}},ae=class{constructor(a,e,t,n){this.containerEl=null;this.waveformBars=[];this.durationEl=null;this.waveformData=new Array(16).fill(0);this.onPause=a,this.onResume=e,this.onStop=t,this.onCancel=n}show(){if(this.containerEl)return;this.containerEl=document.createElement("div"),this.containerEl.className="eudia-transcription-bar active";let a=document.createElement("div");a.className="eudia-recording-dot",this.containerEl.appendChild(a);let e=document.createElement("div");e.className="eudia-waveform",this.waveformBars=[];for(let r=0;r<16;r++){let s=document.createElement("div");s.className="eudia-waveform-bar",s.style.height="2px",e.appendChild(s),this.waveformBars.push(s)}this.containerEl.appendChild(e),this.durationEl=document.createElement("div"),this.durationEl.className="eudia-duration",this.durationEl.textContent="0:00",this.containerEl.appendChild(this.durationEl);let t=document.createElement("div");t.className="eudia-controls-minimal";let n=document.createElement("button");n.className="eudia-control-btn stop",n.innerHTML='<span class="eudia-stop-icon"></span>',n.title="Stop and summarize",n.onclick=()=>this.onStop(),t.appendChild(n);let i=document.createElement("button");i.className="eudia-control-btn cancel",i.textContent="Cancel",i.onclick=()=>this.onCancel(),t.appendChild(i),this.containerEl.appendChild(t),document.body.appendChild(this.containerEl)}hide(){this.containerEl&&(this.containerEl.remove(),this.containerEl=null,this.waveformBars=[],this.durationEl=null)}updateState(a){if(this.containerEl){if(this.waveformData.shift(),this.waveformData.push(a.audioLevel),this.waveformBars.forEach((e,t)=>{let n=this.waveformData[t]||0,i=Math.max(2,Math.min(24,n*.24));e.style.height=`${i}px`}),this.durationEl){let e=Math.floor(a.duration/60),t=Math.floor(a.duration%60);this.durationEl.textContent=`${e}:${t.toString().padStart(2,"0")}`}this.containerEl.className=a.isPaused?"eudia-transcription-bar paused":"eudia-transcription-bar active"}}showProcessing(){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar processing";let a=document.createElement("div");a.className="eudia-processing-spinner",this.containerEl.appendChild(a);let e=document.createElement("div");e.className="eudia-processing-text",e.textContent="Processing...",this.containerEl.appendChild(e)}showComplete(a){if(!this.containerEl)return;this.containerEl.innerHTML="",this.containerEl.className="eudia-transcription-bar complete";let e=document.createElement("div");e.className="eudia-complete-checkmark",this.containerEl.appendChild(e);let t=document.createElement("div");if(t.className="eudia-complete-content",a.summaryPreview){let o=document.createElement("div");o.className="eudia-summary-preview",o.textContent=a.summaryPreview.length>80?a.summaryPreview.substring(0,80)+"...":a.summaryPreview,t.appendChild(o)}let n=document.createElement("div");n.className="eudia-complete-stats-row";let i=Math.floor(a.duration/60),r=Math.floor(a.duration%60);n.textContent=`${i}:${r.toString().padStart(2,"0")} recorded`,a.nextStepsCount>0&&(n.textContent+=` | ${a.nextStepsCount} action${a.nextStepsCount>1?"s":""}`),a.meddiccCount>0&&(n.textContent+=` | ${a.meddiccCount} signals`),t.appendChild(n),this.containerEl.appendChild(t);let s=document.createElement("button");s.className="eudia-control-btn close",s.textContent="Dismiss",s.onclick=()=>this.hide(),this.containerEl.appendChild(s),setTimeout(()=>this.hide(),8e3)}};var ie=class extends u.Modal{constructor(a,e,t){super(a),this.plugin=e,this.onSelect=t}onOpen(){let{contentEl:a}=this;a.empty(),a.addClass("eudia-account-selector"),a.createEl("h3",{text:"Select Account for Meeting Note"}),this.searchInput=a.createEl("input",{type:"text",placeholder:"Search accounts..."}),this.searchInput.style.cssText="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);",this.resultsContainer=a.createDiv({cls:"eudia-account-results"}),this.resultsContainer.style.cssText="max-height: 300px; overflow-y: auto;",this.updateResults(""),this.searchInput.addEventListener("input",()=>this.updateResults(this.searchInput.value)),this.searchInput.focus()}updateResults(a){this.resultsContainer.empty();let e=this.plugin.settings.cachedAccounts,t=a?e.filter(n=>n.name.toLowerCase().includes(a.toLowerCase())).slice(0,15):e.slice(0,15);if(t.length===0){this.resultsContainer.createDiv({cls:"eudia-no-results",text:"No accounts found"});return}t.forEach(n=>{let i=this.resultsContainer.createDiv({cls:"eudia-account-item",text:n.name});i.onclick=()=>{this.onSelect(n),this.close()}})}onClose(){this.contentEl.empty()}},K=class extends u.Modal{constructor(e,t,n){super(e);this.accountContext=null;this.sessionId=null;this.plugin=t,this.accountContext=n||null}onOpen(){let{contentEl:e}=this;e.empty(),e.addClass("eudia-intelligence-modal");let t=e.createDiv({cls:"eudia-intelligence-header"});t.createEl("h2",{text:this.accountContext?`Ask about ${this.accountContext.name}`:"Ask gtm-brain"}),this.accountContext?t.createEl("p",{text:"Get insights, prep for meetings, or ask about this account.",cls:"eudia-intelligence-subtitle"}):t.createEl("p",{text:"Ask questions about your accounts, deals, or pipeline.",cls:"eudia-intelligence-subtitle"});let n=e.createDiv({cls:"eudia-intelligence-input-container"});this.queryInput=n.createEl("textarea",{placeholder:this.accountContext?`e.g., "What should I know before my next meeting?" or "What's the deal status?"`:`e.g., "Who owns Dolby?" or "What's my late stage pipeline?"`}),this.queryInput.addClass("eudia-intelligence-input"),this.queryInput.rows=3;let r=e.createDiv({cls:"eudia-intelligence-actions"}).createEl("button",{text:"Ask",cls:"eudia-btn-primary"});r.onclick=()=>this.submitQuery(),this.queryInput.onkeydown=d=>{d.key==="Enter"&&!d.shiftKey&&(d.preventDefault(),this.submitQuery())},this.threadContainer=e.createDiv({cls:"eudia-intelligence-thread"}),this.responseContainer=e.createDiv({cls:"eudia-intelligence-response"}),this.responseContainer.style.display="none";let o=e.createDiv({cls:"eudia-intelligence-thread-actions"}).createEl("button",{text:"New conversation",cls:"eudia-btn-secondary"});o.onclick=()=>{this.threadContainer.empty(),this.sessionId=null,this.queryInput.value="",this.queryInput.focus()};let l=e.createDiv({cls:"eudia-intelligence-suggestions"});l.createEl("p",{text:"Suggested:",cls:"eudia-suggestions-label"});let c;if(this.accountContext)c=["What should I know before my next meeting?","Summarize our relationship and deal status","What are the key pain points?"];else{let p=(this.plugin.settings.cachedAccounts||[]).slice(0,3).map(g=>g.name);p.length>=2?c=[`What should I know about ${p[0]} before my next meeting?`,`What's the account history with ${p[1]}?`,"What's my late-stage pipeline?"]:c=["What should I know before my next meeting?","What accounts need attention this week?","What is my late-stage pipeline?"]}c.forEach(d=>{let p=l.createEl("button",{text:d,cls:"eudia-suggestion-btn"});p.onclick=()=>{this.queryInput.value=d,this.submitQuery()}}),setTimeout(()=>this.queryInput.focus(),100)}async submitQuery(){let e=this.queryInput.value.trim();if(!e)return;this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-user"}).setText(e),this.queryInput.value="";let n=this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-loading"}),i=this.accountContext?.name?` about ${this.accountContext.name}`:"";n.setText(`Thinking${i}...`),this.scrollThread();try{let r={query:e,accountId:this.accountContext?.id,accountName:this.accountContext?.name,userEmail:this.plugin.settings.userEmail};this.sessionId&&(r.sessionId=this.sessionId);let s=await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/intelligence/query`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(r),throw:!1,contentType:"application/json"});if(n.remove(),s.status>=400){let o=s.json?.error||`Server error (${s.status}). Please try again.`;this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-error"}).setText(o),this.scrollThread();return}if(s.json?.success){s.json.sessionId&&(this.sessionId=s.json.sessionId);let o=s.json.answer||"",l=[],c=o.match(/---\s*\n\s*You might also ask:\s*\n((?:\d+\.\s*.+\n?)+)/i);if(c){o=o.substring(0,o.indexOf(c[0])).trim();let O=c[1].trim().split(`
`);for(let f of O){let C=f.replace(/^\d+\.\s*/,"").trim();C.length>5&&l.push(C)}}let d=this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-ai"}),p=d.createDiv({cls:"eudia-intelligence-answer"});if(p.innerHTML=this.formatResponse(o),s.json.context){let O=s.json.context,f=[];O.accountName&&f.push(O.accountName),O.opportunityCount>0&&f.push(`${O.opportunityCount} opps`),O.hasNotes&&f.push("notes"),O.hasCustomerBrain&&f.push("history");let C=O.dataFreshness==="cached"||O.dataFreshness==="session-cached"?" (cached)":"";f.length&&d.createDiv({cls:"eudia-intelligence-context-info"}).setText(`${f.join(" \u2022 ")}${C}`)}if(l.length>0){let O=d.createDiv({cls:"eudia-suggestions-inline"});for(let f of l.slice(0,3)){let C=O.createEl("button",{text:f,cls:"eudia-suggestion-chip-inline"});C.onclick=()=>{this.queryInput.value=f,this.submitQuery()}}}let g=d.createDiv({cls:"eudia-feedback-row"}),y=g.createEl("button",{text:"\u2191 Helpful",cls:"eudia-feedback-btn"}),m=g.createEl("button",{text:"\u2193 Not helpful",cls:"eudia-feedback-btn"}),w=async(O,f,C)=>{f.disabled=!0,f.style.fontWeight="600",f.style.color=O==="helpful"?"var(--text-success)":"var(--text-error)",C.style.display="none";try{await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/intelligence/feedback`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:e,answerSnippet:o.substring(0,300),accountName:this.accountContext?.name||"",accountId:this.accountContext?.id||"",userEmail:this.plugin.settings.userEmail,sessionId:this.sessionId||"",rating:O}),throw:!1})}catch{}};y.onclick=()=>w("helpful",y,m),m.onclick=()=>w("not_helpful",m,y)}else{let o=s.json?.error||"Could not get an answer. Try rephrasing your question.";this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-error"}).setText(o)}this.scrollThread()}catch(r){n.remove(),console.error("[GTM Brain] Intelligence query error:",r);let s="Unable to connect. Please check your internet connection and try again.";r?.message?.includes("timeout")?s="Request timed out. The server may be busy - please try again.":(r?.message?.includes("network")||r?.message?.includes("fetch"))&&(s="Network error. Please check your connection and try again."),this.threadContainer.createDiv({cls:"eudia-thread-msg eudia-thread-msg-error"}).setText(s),this.scrollThread()}}scrollThread(){this.threadContainer.scrollTop=this.threadContainer.scrollHeight}formatResponse(e){let t=e;return t=t.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu,""),t=t.replace(/\n{3,}/g,`

`),t=t.replace(/^([•\-]\s+.+)\n\n(?=[•\-]\s+)/gm,`$1
`),t=t.replace(/^(#{2,3}\s+.+)\n\n/gm,`$1
`),t=t.replace(/^#{1,3}\s+.+\n+(?=#{1,3}\s|\s*$)/gm,""),t=t.replace(/^#{2,3}\s+(.+)$/gm,'</p><h3 class="eudia-intel-header">$1</h3><p>'),t=t.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>"),t=t.replace(/^-\s+\[\s*\]\s+(.+)$/gm,'<li class="eudia-intel-todo">$1</li>'),t=t.replace(/^-\s+\[x\]\s+(.+)$/gm,'<li class="eudia-intel-done">$1</li>'),t=t.replace(/^[•\-]\s+(.+)$/gm,"<li>$1</li>"),t=t.replace(/(<li[^>]*>.*?<\/li>\s*)+/g,'<ul class="eudia-intel-list">$&</ul>'),t=t.replace(/\n\n/g,"</p><p>"),t=t.replace(/\n/g,"<br>"),t=t.replace(/<p>\s*(<ul)/g,"$1"),t=t.replace(/<\/ul>\s*<\/p>/g,"</ul>"),t=t.replace(/<p>\s*(<h3)/g,"$1"),t=t.replace(/<\/h3>\s*<\/p>/g,"</h3>"),t=t.replace(/<\/li>\s*<br>\s*<li/g,"</li><li"),t=t.replace(/<p>\s*<\/p>/g,""),t=t.replace(/<p>\s*<br>\s*<\/p>/g,""),t=t.replace(/(<br>\s*){2,}/g,""),t=t.replace(/<\/h3>\s*<br>/g,"</h3>"),t=t.replace(/<br>\s*<h3/g,"<h3"),t=t.replace(/<br>\s*<ul/g,"<ul"),t=t.replace(/<\/ul>\s*<br>/g,"</ul>"),t=t.replace(/^(<br>)+|(<br>)+$/g,""),t="<p>"+t+"</p>",t=t.replace(/<p><\/p>/g,""),t}onClose(){this.contentEl.empty()}};var se=class extends u.ItemView{constructor(e,t){super(e);this.emailInput=null;this.pollInterval=null;this.plugin=t,this.accountOwnershipService=new H(t.settings.serverUrl),this.steps=[{id:"calendar",title:"Connect Your Calendar",description:"View your meetings and create notes with one click",status:"pending"},{id:"salesforce",title:"Connect to Salesforce",description:"Sync notes and access your accounts",status:"pending"},{id:"transcribe",title:"Ready to Transcribe",description:"Record and summarize meetings automatically",status:"pending"}]}getViewType(){return B}getDisplayText(){return"Setup"}getIcon(){return"settings"}async onOpen(){await this.checkExistingStatus(),await this.render()}async onClose(){this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null)}async checkExistingStatus(){if(this.plugin.settings.userEmail){this.steps[0].status="complete";try{(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0&&(this.steps[1].status="complete",this.plugin.settings.salesforceConnected=!0)}catch{}if(this.plugin.settings.accountsImported){let t=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(s=>s.children!==void 0)||[];t.length>0?(this.steps[2].status="complete",console.log(`[Eudia] Vault reopen: ${t.length} account folders verified`)):(console.warn("[Eudia] accountsImported=true but 0 account folders found \u2014 resetting for re-import"),this.plugin.settings.accountsImported=!1,this.plugin.settings.importedAccountCount=0,await this.plugin.saveSettings());try{let s=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");s&&await this.plugin.app.vault.delete(s)}catch{}let n=this.plugin.settings.userEmail,r=(this.plugin.settings.cachedAccounts||[]).filter(s=>s.id&&String(s.id).startsWith("001"));if(n&&r.length>0){let s=this.plugin.settings.accountsFolder||"Accounts",o=!1;for(let l of r.slice(0,5)){let c=(l.name||"").replace(/[<>:"/\\|?*]/g,"_").trim(),d=`${s}/${c}/Contacts.md`,p=this.plugin.app.vault.getAbstractFileByPath(d);if(p instanceof u.TFile&&!this.plugin.app.metadataCache.getFileCache(p)?.frontmatter?.enriched_at){o=!0;break}}o&&(console.log("[Eudia Setup] Accounts need enrichment \u2014 triggering on vault reopen..."),setTimeout(async()=>{try{let l=r.map(c=>({id:c.id,name:c.name,type:"",isOwned:!1,hadOpportunity:!0,website:null,industry:null}));await this.plugin.enrichAccountFolders(l),console.log(`[Eudia] Vault-reopen enrichment complete: ${l.length} accounts enriched`)}catch(l){console.log("[Eudia] Vault-reopen enrichment failed (will retry next open):",l)}},3e3))}}else{console.log("[Eudia Setup] Email set but accounts not imported \u2014 auto-retrying import...");let e=this.plugin.app.workspace.leftSplit,t=e?.collapsed;try{let n=this.plugin.settings.userEmail,i=M(n)?"admin":_(n)?"cs":"bl",r=[],s=[];if(console.log(`[Eudia Setup] Auto-retry for ${n} (group: ${i})`),i==="cs")r=[...D],console.log(`[Eudia Setup] Auto-retry CS: using ${r.length} static accounts`);else if(i==="admin")r=await this.accountOwnershipService.getAllAccountsForAdmin(n);else{let o=await this.accountOwnershipService.getAccountsWithProspects(n);r=o.accounts,s=o.prospects}if(r.length>0||s.length>0){if(e&&!t&&e.collapse(),i==="admin"?await this.plugin.createAdminAccountFolders(r):(await this.plugin.createTailoredAccountFolders(r,{}),s.length>0&&await this.plugin.createProspectAccountFiles(s)),U(n))try{await this.plugin.createCSManagerDashboard(n,r)}catch{}this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=r.length+s.length,await this.plugin.saveSettings(),this.steps[2].status="complete";try{let o=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");o&&await this.plugin.app.vault.delete(o)}catch{}e&&!t&&e.expand(),console.log(`[Eudia Setup] Auto-retry imported ${r.length} accounts for ${n}`),new u.Notice(`Enriching ${r.length} accounts with Salesforce contacts...`);try{let o=i==="cs"?r:[...r,...s];await this.plugin.enrichAccountFolders(o),new u.Notice(`${r.length} accounts loaded and enriched!`),console.log("[Eudia Setup] Auto-retry enrichment complete")}catch(o){console.log("[Eudia Setup] Auto-retry enrichment failed:",o),new u.Notice(`${r.length} accounts imported! Contacts will populate on next open.`)}}else console.warn(`[Eudia Setup] Auto-retry returned 0 accounts for ${n}. Server may still be starting.`),e&&!t&&e.expand()}catch(n){console.error("[Eudia Setup] Auto-retry account import failed:",n),e&&!t&&e.expand()}}}}getCompletionPercentage(){let e=this.steps.filter(t=>t.status==="complete").length;return Math.round(e/this.steps.length*100)}async render(){let e=this.containerEl.children[1];e.empty(),e.addClass("eudia-setup-view"),this.renderHeader(e),this.renderSteps(e),this.renderFooter(e)}renderHeader(e){let t=e.createDiv({cls:"eudia-setup-header"}),n=t.createDiv({cls:"eudia-setup-title-section"});n.createEl("h1",{text:"Welcome to Eudia Sales Vault",cls:"eudia-setup-main-title"}),n.createEl("p",{text:"Complete these steps to transcribe and summarize meetings -- capturing objections, next steps, and pain points to drive better client outcomes and smarter selling.",cls:"eudia-setup-subtitle"});let i=t.createDiv({cls:"eudia-setup-progress-section"}),r=this.getCompletionPercentage(),s=i.createDiv({cls:"eudia-setup-progress-label"});s.createSpan({text:"Setup Progress"}),s.createSpan({text:`${r}%`,cls:"eudia-setup-progress-value"});let l=i.createDiv({cls:"eudia-setup-progress-bar"}).createDiv({cls:"eudia-setup-progress-fill"});l.style.width=`${r}%`}renderSteps(e){let t=e.createDiv({cls:"eudia-setup-steps-container"});this.renderCalendarStep(t),this.renderSalesforceStep(t),this.renderTranscribeStep(t)}renderCalendarStep(e){let t=this.steps[0],n=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),i=n.createDiv({cls:"eudia-setup-step-header"}),r=i.createDiv({cls:"eudia-setup-step-number"});r.setText(t.status==="complete"?"":"1"),t.status==="complete"&&r.addClass("eudia-step-complete");let s=i.createDiv({cls:"eudia-setup-step-info"});s.createEl("h3",{text:t.title}),s.createEl("p",{text:t.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(t.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:`Connected as ${this.plugin.settings.userEmail}`});else{let l=o.createDiv({cls:"eudia-setup-input-group"});this.emailInput=l.createEl("input",{type:"email",placeholder:"yourname@eudia.com",cls:"eudia-setup-input"}),this.plugin.settings.userEmail&&(this.emailInput.value=this.plugin.settings.userEmail);let c=l.createEl("button",{text:"Connect",cls:"eudia-setup-btn primary"});c.onclick=async()=>{await this.handleCalendarConnect()},this.emailInput.onkeydown=async d=>{d.key==="Enter"&&await this.handleCalendarConnect()},o.createDiv({cls:"eudia-setup-validation-message"}),o.createEl("p",{cls:"eudia-setup-help-text",text:"Your calendar syncs automatically via Microsoft 365. We use your email to identify your meetings."})}}async handleCalendarConnect(){if(!this.emailInput)return;let e=this.emailInput.value.trim().toLowerCase(),t=this.containerEl.querySelector(".eudia-setup-validation-message");if(!e){t&&(t.textContent="Please enter your email",t.className="eudia-setup-validation-message error");return}if(!e.endsWith("@eudia.com")){t&&(t.textContent="Please use your @eudia.com email address",t.className="eudia-setup-validation-message error");return}t&&(t.textContent="Validating...",t.className="eudia-setup-validation-message loading");try{let n=await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${encodeURIComponent(e)}`,method:"GET",throw:!1});if(n.status===200&&n.json?.authorized){this.plugin.settings.userEmail=e,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),this.steps[0].status="complete",new u.Notice("Calendar connected successfully!"),t&&(t.textContent="Importing your accounts...",t.className="eudia-setup-validation-message loading");let i=this.plugin.app.workspace.leftSplit,r=i?.collapsed;i&&!r&&i.collapse();try{let s,o=[],l=M(e)?"admin":_(e)?"cs":"bl";if(console.log(`[Eudia] User group detected: ${l} for ${e}`),l==="cs"){if(console.log(`[Eudia] CS user detected \u2014 loading ${D.length} accounts from static data (instant, no server needed)`),s=[...D],o=[],t&&(t.textContent=`Loading ${s.length} Customer Success accounts...`),await this.plugin.createTailoredAccountFolders(s,{}),U(e))try{await this.plugin.createCSManagerDashboard(e,s)}catch(p){console.error("[Eudia] CS Manager dashboard creation failed (non-blocking):",p)}let d=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(p=>p.children!==void 0)||[];d.length>0?(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length,console.log(`[Eudia] CS accounts verified: ${d.length} folders created`)):(console.warn(`[Eudia] CS folder creation may have failed \u2014 ${d.length} folders found. Keeping accountsImported=false for retry.`),this.plugin.settings.accountsImported=!1),await this.plugin.saveSettings();try{let p=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");p&&await this.plugin.app.vault.delete(p)}catch{}console.log(`[Eudia] CS accounts created: ${s.length} folders from static data`),t&&(t.textContent=`Enriching ${s.length} accounts with Salesforce contacts...`),new u.Notice(`Enriching ${s.length} accounts with contacts from Salesforce...`),console.log(`[Eudia] Starting synchronous enrichment for ${s.length} CS accounts...`);try{await this.plugin.enrichAccountFolders(s),console.log("[Eudia] Synchronous enrichment complete"),new u.Notice(`${s.length} accounts loaded with contacts from Salesforce!`),t&&(t.textContent=`${s.length} accounts loaded and enriched with Salesforce contacts!`)}catch(p){console.log("[Eudia] Synchronous enrichment failed, will retry in background:",p),new u.Notice(`${s.length} accounts loaded! Contacts will populate shortly...`);let g=e,y=[5e3,2e4,6e4],m=async w=>{let O=y[w];if(O!==void 0){await new Promise(f=>setTimeout(f,O));try{await this.plugin.enrichAccountFolders(s),console.log(`[Eudia] Background enrichment retry ${w+1} succeeded`)}catch{return m(w+1)}}};m(0)}}else if(l==="admin"){if(console.log("[Eudia] Admin user detected - importing all accounts"),s=await this.accountOwnershipService.getAllAccountsForAdmin(e),s.length>0){t&&(t.textContent=`Creating ${s.length} account folders...`),await this.plugin.createAdminAccountFolders(s);let d=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(g=>g.children!==void 0)||[];d.length>0?(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length,console.log(`[Eudia] Admin accounts verified: ${d.length} folders created`)):(console.warn("[Eudia] Admin folder creation may have failed \u2014 keeping accountsImported=false for retry"),this.plugin.settings.accountsImported=!1),await this.plugin.saveSettings();try{let g=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");g&&await this.plugin.app.vault.delete(g)}catch{}new u.Notice(`Imported ${s.length} accounts! Enriching with Salesforce data...`);let p=s.filter(g=>g.id&&g.id.startsWith("001"));if(p.length>0){t&&(t.textContent=`Enriching ${p.length} accounts with Salesforce contacts...`);try{await this.plugin.enrichAccountFolders(p),new u.Notice(`${s.length} accounts loaded and enriched with Salesforce data!`),console.log(`[Eudia] Admin/exec synchronous enrichment complete: ${p.length} accounts`),t&&(t.textContent=`${s.length} accounts loaded and enriched!`)}catch(g){console.log("[Eudia] Admin/exec synchronous enrichment failed, will retry on next open:",g),new u.Notice(`${s.length} accounts imported! Contacts will populate on next vault open.`);let y=[5e3,2e4,6e4],m=async w=>{let O=y[w];if(O!==void 0){await new Promise(f=>setTimeout(f,O));try{await this.plugin.enrichAccountFolders(p),console.log(`[Eudia] Admin/exec background enrichment retry ${w+1} succeeded`)}catch{return m(w+1)}}};m(0)}}}}else{let c=await this.accountOwnershipService.getAccountsWithProspects(e);if(s=c.accounts,o=c.prospects,s.length>0||o.length>0){t&&(t.textContent=`Creating ${s.length} account folders...`),await this.plugin.createTailoredAccountFolders(s,{}),o.length>0&&await this.plugin.createProspectAccountFiles(o);let p=this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(y=>y.children!==void 0)||[];p.length>0?(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length+o.length,console.log(`[Eudia] BL accounts verified: ${p.length} folders created`)):(console.warn("[Eudia] BL folder creation may have failed \u2014 keeping accountsImported=false for retry"),this.plugin.settings.accountsImported=!1),await this.plugin.saveSettings();try{let y=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");y&&await this.plugin.app.vault.delete(y)}catch{}new u.Notice(`Imported ${s.length} active accounts + ${o.length} prospects!`);let g=[...s,...o];setTimeout(async()=>{try{await this.plugin.enrichAccountFolders(g)}catch(y){console.log("[Eudia] Background enrichment skipped:",y)}},500)}else{console.warn(`[Eudia] No accounts returned for ${e} \u2014 auto-retrying...`);let d=!1;for(let p=1;p<=3;p++){t&&(t.textContent=`Server warming up... retrying in 10s (attempt ${p}/3)`,t.className="eudia-setup-validation-message warning"),await new Promise(g=>setTimeout(g,1e4));try{let g=await this.plugin.accountOwnershipService.getAccountsWithProspects(e);if(g.accounts.length>0||g.prospects.length>0){s=g.accounts,o=g.prospects,t&&(t.textContent=`Creating ${s.length} account folders...`),await this.plugin.createTailoredAccountFolders(s,{}),o.length>0&&await this.plugin.createProspectAccountFiles(o),(this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.accountsFolder||"Accounts")?.children?.filter(w=>w.children!==void 0)||[]).length>0&&(this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=s.length+o.length),await this.plugin.saveSettings(),new u.Notice(`Imported ${s.length} accounts + ${o.length} prospects!`),d=!0;break}}catch(g){console.warn(`[Eudia] Retry ${p} failed:`,g)}}d||(t&&(t.textContent="Could not load accounts after 3 attempts. Close this window, wait 1 minute, then re-open Obsidian and try again.",t.className="eudia-setup-validation-message error"),new u.Notice("Account import failed after retries. Wait 1 minute and try again."))}}}catch(s){console.error("[Eudia] Account import failed:",s),t&&(t.textContent="Account import failed. Please try again.",t.className="eudia-setup-validation-message error"),new u.Notice("Account import failed \u2014 please try again.")}finally{i&&!r&&i.expand()}await this.render()}else t&&(t.innerHTML=`<strong>${e}</strong> is not authorized for calendar access. Contact your admin.`,t.className="eudia-setup-validation-message error")}catch{t&&(t.textContent="Connection failed. Please try again.",t.className="eudia-setup-validation-message error")}}renderSalesforceStep(e){let t=this.steps[1],n=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),i=n.createDiv({cls:"eudia-setup-step-header"}),r=i.createDiv({cls:"eudia-setup-step-number"});r.setText(t.status==="complete"?"":"2"),t.status==="complete"&&r.addClass("eudia-step-complete");let s=i.createDiv({cls:"eudia-setup-step-info"});s.createEl("h3",{text:t.title}),s.createEl("p",{text:t.description});let o=n.createDiv({cls:"eudia-setup-step-content"});if(!this.plugin.settings.userEmail){o.createDiv({cls:"eudia-setup-disabled-message",text:"Complete the calendar step first"});return}if(t.status==="complete")o.createDiv({cls:"eudia-setup-complete-message",text:"Salesforce connected successfully"}),this.plugin.settings.accountsImported&&o.createDiv({cls:"eudia-setup-account-status",text:`${this.plugin.settings.importedAccountCount} accounts imported`});else{let c=o.createDiv({cls:"eudia-setup-button-group"}).createEl("button",{text:"Connect to Salesforce",cls:"eudia-setup-btn primary"}),d=o.createDiv({cls:"eudia-setup-sf-status"});c.onclick=async()=>{let p=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(p,"_blank"),d.textContent="Complete the login in the popup window...",d.className="eudia-setup-sf-status loading",new u.Notice("Complete the Salesforce login in the popup window",5e3),this.startSalesforcePolling(d)},o.createEl("p",{cls:"eudia-setup-help-text",text:"This links your Obsidian notes to your Salesforce account for automatic sync."})}}startSalesforcePolling(e){this.pollInterval&&window.clearInterval(this.pollInterval);let t=0,n=60;this.pollInterval=window.setInterval(async()=>{t++;try{(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),this.steps[1].status="complete",new u.Notice("Salesforce connected successfully!"),await this.importTailoredAccounts(e),await this.render()):t>=n&&(this.pollInterval&&(window.clearInterval(this.pollInterval),this.pollInterval=null),e.textContent="Connection timed out. Please try again.",e.className="eudia-setup-sf-status error")}catch{}},5e3)}async importTailoredAccounts(e){e.textContent="Importing your accounts...",e.className="eudia-setup-sf-status loading";try{let t=this.plugin.settings.userEmail,n=M(t)?"admin":_(t)?"cs":"bl";console.log(`[Eudia SF Import] Importing for ${t} (group: ${n})`);let i,r=[];if(n==="cs"){console.log("[Eudia SF Import] CS user SF Connect \u2014 fetching live data from Salesforce..."),e.textContent="Syncing with Salesforce for latest account data...";try{let y=await this.accountOwnershipService.getCSAccounts(t);i=y.accounts,r=y.prospects,console.log(`[Eudia SF Import] CS server sync: ${i.length} accounts (with real SF IDs + CSM data)`)}catch{if(this.plugin.settings.accountsImported){e.textContent="Salesforce connected! Account folders already loaded. Enrichment will retry later.",e.className="eudia-setup-sf-status success",this.steps[1].status="complete";return}i=[...D],console.log(`[Eudia SF Import] CS server unavailable \u2014 using ${i.length} static accounts`)}}else if(n==="admin")console.log("[Eudia] Admin user detected - importing all accounts"),e.textContent="Admin detected - importing all accounts...",i=await this.accountOwnershipService.getAllAccountsForAdmin(t);else{let y=await this.accountOwnershipService.getAccountsWithProspects(t);i=y.accounts,r=y.prospects}if(i.length===0&&r.length===0){e.textContent="No accounts found for your email. Contact your admin.",e.className="eudia-setup-sf-status warning";return}e.textContent=`Creating ${i.length} account folders...`;let s=this.plugin.app.workspace.leftSplit,o=s?.collapsed;if(s&&!o&&s.collapse(),M(t)?await this.plugin.createAdminAccountFolders(i):(await this.plugin.createTailoredAccountFolders(i,{}),r.length>0&&await this.plugin.createProspectAccountFiles(r)),U(t))try{await this.plugin.createCSManagerDashboard(t,i)}catch{}this.plugin.settings.accountsImported=!0,this.plugin.settings.importedAccountCount=i.length+r.length,await this.plugin.saveSettings();try{let y=this.plugin.app.vault.getAbstractFileByPath("Accounts/_Setup Required.md");y&&await this.plugin.app.vault.delete(y)}catch{}s&&!o&&s.expand(),this.steps[2].status="complete";let l=i.filter(y=>y.isOwned!==!1).length,c=i.filter(y=>y.isOwned===!1).length;n==="admin"&&c>0?e.textContent=`${l} owned + ${c} view-only accounts imported! Enriching...`:e.textContent=`${i.length} active + ${r.length} prospect accounts imported! Enriching...`,e.className="eudia-setup-sf-status success";let d=[...i,...r],p=t,g=n;setTimeout(async()=>{try{let y=d.filter(m=>m.id&&m.id.startsWith("001"));if(y.length>0?(e.textContent=`Enriching ${y.length} accounts with Salesforce data...`,await this.plugin.enrichAccountFolders(y),e.textContent=`${i.length} accounts imported, ${y.length} enriched with Salesforce data`):e.textContent=`${i.length} accounts imported (enrichment requires Salesforce IDs)`,g==="cs"&&U(p))try{console.log("[Eudia SF Import] Regenerating CS Manager dashboard with live CSM data..."),await this.plugin.createCSManagerDashboard(p,i),console.log("[Eudia SF Import] CS Manager dashboard updated with CSM assignments")}catch(m){console.error("[Eudia SF Import] Dashboard regeneration failed (non-blocking):",m)}}catch(y){console.log("[Eudia] Background enrichment skipped:",y),e.textContent=`${i.length+r.length} accounts imported (enrichment will retry on next launch)`}},500)}catch{e.textContent="Failed to import accounts. Please try again.",e.className="eudia-setup-sf-status error";let n=this.plugin.app.workspace.leftSplit;if(n?.collapsed===!1)try{n.expand()}catch{}}}renderTranscribeStep(e){let t=this.steps[2],n=e.createDiv({cls:`eudia-setup-step-card ${t.status}`}),i=n.createDiv({cls:"eudia-setup-step-header"}),r=i.createDiv({cls:"eudia-setup-step-number"});r.setText(t.status==="complete"?"":"3"),t.status==="complete"&&r.addClass("eudia-step-complete");let s=i.createDiv({cls:"eudia-setup-step-info"});s.createEl("h3",{text:t.title}),s.createEl("p",{text:t.description});let o=n.createDiv({cls:"eudia-setup-step-content"}),l=o.createDiv({cls:"eudia-setup-instructions"}),c=l.createDiv({cls:"eudia-setup-instruction"});c.createSpan({cls:"eudia-setup-instruction-icon",text:"\u{1F399}"}),c.createSpan({text:"Click the microphone icon in the left sidebar during a call"});let d=l.createDiv({cls:"eudia-setup-instruction"});d.createSpan({cls:"eudia-setup-instruction-icon",text:"\u2328"}),d.createSpan({text:'Or press Cmd/Ctrl+P and search for "Transcribe Meeting"'});let p=l.createDiv({cls:"eudia-setup-instruction"});p.createSpan({cls:"eudia-setup-instruction-icon",text:"\u{1F4DD}"}),p.createSpan({text:"AI will summarize and extract key insights automatically"}),t.status!=="complete"&&o.createEl("p",{cls:"eudia-setup-help-text muted",text:"This step completes automatically after connecting to Salesforce and importing accounts."})}renderFooter(e){let t=e.createDiv({cls:"eudia-setup-footer"});if(this.steps.every(r=>r.status==="complete")){let r=t.createDiv({cls:"eudia-setup-completion"});r.createEl("h2",{text:"\u{1F389} You're all set!"}),r.createEl("p",{text:"Your sales vault is ready. Click below to start using Eudia."});let s=t.createEl("button",{text:"Open Calendar \u2192",cls:"eudia-setup-btn primary large"});s.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(B),await this.plugin.activateCalendarView()}}else{let r=t.createEl("button",{text:"Skip Setup (I'll do this later)",cls:"eudia-setup-btn secondary"});r.onclick=async()=>{this.plugin.settings.setupCompleted=!0,await this.plugin.saveSettings(),this.plugin.app.workspace.detachLeavesOfType(B),new u.Notice("You can complete setup anytime from Settings \u2192 Eudia Sync")}}let i=t.createEl("a",{text:"Advanced Settings",cls:"eudia-setup-settings-link"});i.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")}}},re=class extends u.ItemView{constructor(e,t){super(e);this.updateInterval=null;this.chatHistory=[];this.plugin=t}getViewType(){return L}getDisplayText(){return"Live Query"}getIcon(){return"message-circle"}async onOpen(){await this.render(),this.updateInterval=window.setInterval(()=>this.updateStatus(),5e3)}async onClose(){this.updateInterval&&window.clearInterval(this.updateInterval)}updateStatus(){let e=this.containerEl.querySelector(".eudia-lq-status");if(e)if(this.plugin.audioRecorder?.isRecording()){let t=Math.round((this.plugin.liveTranscript?.length||0)/5),n=this.plugin.audioRecorder.getState().duration,i=Math.floor(n/60),r=n%60;e.setText(`Recording ${i}:${r.toString().padStart(2,"0")} \u2014 ${t} words captured`),e.style.color="var(--text-success)"}else e.setText("Not recording. Start a recording to use Live Query."),e.style.color="var(--text-muted)"}async render(){let e=this.containerEl.children[1];e.empty(),e.addClass("eudia-live-query-view"),e.style.cssText="display:flex;flex-direction:column;height:100%;padding:12px;";let t=e.createDiv({cls:"eudia-lq-status"});t.style.cssText="font-size:12px;padding:8px 0;border-bottom:1px solid var(--background-modifier-border);margin-bottom:8px;",this.updateStatus();let n=e.createDiv({cls:"eudia-lq-quick-actions"});n.style.cssText="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;";let i=[{label:"Summarize so far",query:"Give me a concise summary of everything discussed so far."},{label:"Action items",query:"What action items or next steps have been discussed so far?"},{label:"Key concerns",query:"What concerns, objections, or risks have been raised?"}];for(let c of i){let d=n.createEl("button",{text:c.label});d.style.cssText="font-size:11px;padding:4px 10px;border-radius:12px;border:1px solid var(--background-modifier-border);cursor:pointer;background:var(--background-secondary);",d.onclick=()=>this.submitQuery(c.query,r,o)}let r=e.createDiv({cls:"eudia-lq-chat"});r.style.cssText="flex:1;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:8px;";for(let c of this.chatHistory)this.renderMessage(r,c.role,c.text);if(this.chatHistory.length===0){let c=r.createDiv();c.style.cssText="color:var(--text-muted);font-size:12px;text-align:center;padding:20px 0;",c.setText("Ask a question about the conversation while recording.")}let s=e.createDiv({cls:"eudia-lq-input-area"});s.style.cssText="display:flex;gap:8px;border-top:1px solid var(--background-modifier-border);padding-top:8px;";let o=s.createEl("textarea",{attr:{placeholder:"Ask about the conversation...",rows:"2"}});o.style.cssText="flex:1;resize:none;border-radius:8px;padding:8px;font-size:13px;border:1px solid var(--background-modifier-border);background:var(--background-primary);";let l=s.createEl("button",{text:"Ask"});l.style.cssText="padding:8px 16px;border-radius:8px;cursor:pointer;align-self:flex-end;font-weight:600;",l.addClass("mod-cta"),l.onclick=()=>this.submitQuery(o.value.trim(),r,o),o.addEventListener("keydown",c=>{c.key==="Enter"&&!c.shiftKey&&(c.preventDefault(),l.click())})}renderMessage(e,t,n){let i=e.querySelector(".eudia-lq-chat > div:only-child");i&&i.textContent?.includes("Ask a question")&&i.remove();let r=e.createDiv(),s=t==="user";r.style.cssText=`padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.5;max-width:90%;${s?"align-self:flex-end;background:var(--interactive-accent);color:var(--text-on-accent);":"align-self:flex-start;background:var(--background-secondary);"}`,r.setText(n)}async submitQuery(e,t,n){if(!e)return;if(!this.plugin.audioRecorder?.isRecording()){new u.Notice("Start a recording first to use Live Query.");return}let i=this.plugin.liveTranscript||"";if(i.length<50){new u.Notice("Not enough transcript captured yet. Keep recording for a few more minutes.");return}this.chatHistory.push({role:"user",text:e}),this.renderMessage(t,"user",e),n.value="";let r=t.createDiv();r.style.cssText="align-self:flex-start;padding:8px 12px;border-radius:10px;font-size:13px;background:var(--background-secondary);color:var(--text-muted);",r.setText("Thinking..."),t.scrollTop=t.scrollHeight;try{let s=await this.plugin.transcriptionService.liveQueryTranscript(e,i,this.plugin.getAccountNameFromActiveFile());r.remove();let o=s.success?s.answer:s.error||"Query failed";this.chatHistory.push({role:"assistant",text:o}),this.renderMessage(t,"assistant",o)}catch(s){r.remove();let o=`Error: ${s.message}`;this.chatHistory.push({role:"assistant",text:o}),this.renderMessage(t,"assistant",o)}t.scrollTop=t.scrollHeight}},oe=class b extends u.ItemView{constructor(e,t){super(e);this.refreshInterval=null;this.lastError=null;this.showExternalOnly=!0;this.weeksBack=2;this.plugin=t}getViewType(){return G}getDisplayText(){return"Calendar"}getIcon(){return"calendar"}async onOpen(){await this.render(),this.refreshInterval=window.setInterval(()=>this.render(),5*60*1e3)}async onClose(){this.refreshInterval&&window.clearInterval(this.refreshInterval)}async render(){let e=this.containerEl.children[1];if(e.empty(),e.addClass("eudia-calendar-view"),!this.plugin.settings.userEmail){this.renderSetupPanel(e);return}this.renderHeader(e),await this.renderCalendarContent(e)}static{this.INTERNAL_SUBJECT_PATTERNS=[/^block\b/i,/\bblock\s+for\b/i,/\bcommute\b/i,/\bpersonal\b/i,/\blunch\b/i,/\bOOO\b/i,/\bout of office\b/i,/\bfocus time\b/i,/\bno meetings?\b/i,/\bmeeting free\b/i,/\btravel\b/i,/\beye appt\b/i,/\bdoctor\b/i,/\bdentist\b/i,/\bgym\b/i,/\bworkout\b/i]}isExternalMeeting(e){if(e.isCustomerMeeting)return!0;if(!e.attendees||e.attendees.length===0)return!1;let t=this.plugin.settings.userEmail?.split("@")[1]||"eudia.com";if(e.attendees.some(i=>{if(i.isExternal===!0)return!0;if(i.isExternal===!1||!i.email)return!1;let r=i.email.split("@")[1]?.toLowerCase();return r&&r!==t.toLowerCase()}))return!0;for(let i of b.INTERNAL_SUBJECT_PATTERNS)if(i.test(e.subject))return!1;return!1}renderHeader(e){let t=e.createDiv({cls:"eudia-calendar-header"}),n=t.createDiv({cls:"eudia-calendar-title-row"});n.createEl("h4",{text:"Your Meetings"});let i=n.createDiv({cls:"eudia-calendar-actions"}),r=i.createEl("button",{cls:"eudia-btn-icon",text:"\u21BB"});r.title="Refresh",r.onclick=async()=>{r.addClass("spinning"),this._forceRefresh=!0,await this.render(),r.removeClass("spinning")};let s=i.createEl("button",{cls:"eudia-btn-icon",text:"\u2699"});s.title="Settings",s.onclick=()=>{this.app.setting.open(),this.app.setting.openTabById("eudia-sync")};let o=t.createDiv({cls:"eudia-status-bar"});this.renderConnectionStatus(o);let l=t.createDiv({cls:"eudia-calendar-filter-row"});l.style.cssText="display:flex;align-items:center;gap:8px;margin-top:6px;padding:4px 0;";let c=l.createEl("button",{text:this.showExternalOnly?"External Only":"All Meetings",cls:"eudia-filter-toggle"});c.style.cssText=`font-size:11px;padding:3px 10px;border-radius:12px;cursor:pointer;border:1px solid var(--background-modifier-border);background:${this.showExternalOnly?"var(--interactive-accent)":"var(--background-secondary)"};color:${this.showExternalOnly?"var(--text-on-accent)":"var(--text-muted)"};`,c.title=this.showExternalOnly?"Showing customer/external meetings only \u2014 click to show all":"Showing all meetings \u2014 click to filter to external only",c.onclick=async()=>{this.showExternalOnly=!this.showExternalOnly,await this.render()}}async renderConnectionStatus(e){let t={server:"connecting",calendar:"not_configured",salesforce:"not_configured"},n=this.plugin.settings.serverUrl,i=this.plugin.settings.userEmail;try{(await(0,u.requestUrl)({url:`${n}/api/health`,method:"GET",throw:!1})).status===200?(t.server="connected",t.serverMessage="Server online"):(t.server="error",t.serverMessage="Server unavailable")}catch{t.server="error",t.serverMessage="Cannot reach server"}if(i&&t.server==="connected")try{let d=await(0,u.requestUrl)({url:`${n}/api/calendar/validate/${encodeURIComponent(i)}`,method:"GET",throw:!1});d.status===200&&d.json?.authorized?(t.calendar="connected",t.calendarMessage="Calendar synced"):(t.calendar="not_authorized",t.calendarMessage="Not authorized")}catch{t.calendar="error",t.calendarMessage="Error checking access"}if(i&&t.server==="connected")try{let d=await(0,u.requestUrl)({url:`${n}/api/sf/auth/status?email=${encodeURIComponent(i)}`,method:"GET",throw:!1});d.status===200&&d.json?.connected?(t.salesforce="connected",t.salesforceMessage="Salesforce connected"):(t.salesforce="not_configured",t.salesforceMessage="Not connected")}catch{t.salesforce="not_configured"}let r=e.createDiv({cls:"eudia-status-indicators"}),s=r.createSpan({cls:`eudia-status-dot ${t.server}`});s.title=t.serverMessage||"Server";let o=r.createSpan({cls:`eudia-status-dot ${t.calendar}`});o.title=t.calendarMessage||"Calendar";let l=r.createSpan({cls:`eudia-status-dot ${t.salesforce}`});if(l.title=t.salesforceMessage||"Salesforce",e.createDiv({cls:"eudia-status-labels"}).createSpan({cls:"eudia-status-label",text:this.plugin.settings.userEmail}),t.calendar==="not_authorized"){let d=e.createDiv({cls:"eudia-status-warning"});d.innerHTML=`<strong>${i}</strong> is not authorized for calendar access. Contact your admin.`}}async renderCalendarContent(e){let t=e.createDiv({cls:"eudia-calendar-content"}),n=t.createDiv({cls:"eudia-calendar-loading"});n.innerHTML='<div class="eudia-spinner"></div><span>Loading meetings...</span>';try{let i=new F(this.plugin.settings.serverUrl,this.plugin.settings.userEmail,this.plugin.settings.timezone||"America/New_York"),r=this._forceRefresh||!1;this._forceRefresh=!1;let s=await i.getWeekMeetings(r);if(!s.success){n.remove(),this.renderError(t,s.error||"Failed to load calendar");return}let o=new Date,l=new Date(o);l.setDate(l.getDate()-this.weeksBack*7);let c=new Date(o);c.setDate(c.getDate()-1);let d=[];try{d=await i.getMeetingsInRange(l,c)}catch{console.log("[Calendar] Could not fetch past meetings")}n.remove();let p={};for(let f of d){let C=f.start.split("T")[0];p[C]||(p[C]=[]),p[C].push(f)}for(let[f,C]of Object.entries(s.byDay||{})){p[f]||(p[f]=[]);let v=new Set(p[f].map(h=>h.id));for(let h of C)v.has(h.id)||p[f].push(h)}let g={};for(let[f,C]of Object.entries(p)){let v=this.showExternalOnly?C.filter(h=>this.isExternalMeeting(h)):C;v.length>0&&(g[f]=v)}let y=Object.keys(g).sort();if(y.length===0){this.renderEmptyState(t);return}await this.renderCurrentMeeting(t,i);let m=t.createEl("button",{text:"\u2190 Load earlier meetings",cls:"eudia-load-earlier"});m.style.cssText="width:100%;padding:8px;margin-bottom:8px;font-size:12px;cursor:pointer;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-muted);",m.onclick=async()=>{this.weeksBack+=2,await this.render()};let w=o.toISOString().split("T")[0],O=null;for(let f of y){let C=g[f];if(!C||C.length===0)continue;let v=this.renderDaySection(t,f,C);f===w&&(O=v)}O&&setTimeout(()=>O.scrollIntoView({block:"start",behavior:"auto"}),100)}catch(i){n.remove(),this.renderError(t,i.message||"Failed to load calendar")}}async renderCurrentMeeting(e,t){try{let n=await t.getCurrentMeeting();if(n.meeting){let i=e.createDiv({cls:"eudia-now-card"});n.isNow?i.createDiv({cls:"eudia-now-badge",text:"\u25CF NOW"}):i.createDiv({cls:"eudia-now-badge soon",text:`In ${n.minutesUntilStart}m`});let r=i.createDiv({cls:"eudia-now-content"});r.createEl("div",{cls:"eudia-now-subject",text:n.meeting.subject}),n.meeting.accountName&&r.createEl("div",{cls:"eudia-now-account",text:n.meeting.accountName});let s=i.createEl("button",{cls:"eudia-now-action",text:"Create Note"});s.onclick=()=>this.createNoteForMeeting(n.meeting)}}catch{}}renderDaySection(e,t,n){let i=e.createDiv({cls:"eudia-calendar-day"}),r=new Date().toISOString().split("T")[0],s=t===r,o=t<r,l=s?"TODAY":F.getDayName(t),c=i.createEl("div",{cls:`eudia-calendar-day-header ${s?"today":""} ${o?"past":""}`,text:l});s?c.style.cssText="font-weight:700;color:var(--interactive-accent);":o&&(c.style.cssText="opacity:0.7;");for(let d of n){let p=i.createDiv({cls:`eudia-calendar-meeting ${d.isCustomerMeeting?"customer":"internal"} ${o?"past":""}`});o&&(p.style.cssText="opacity:0.85;"),p.createEl("div",{cls:"eudia-calendar-time",text:F.formatTime(d.start,this.plugin.settings.timezone)});let g=p.createDiv({cls:"eudia-calendar-details"});if(g.createEl("div",{cls:"eudia-calendar-subject",text:d.subject}),d.accountName)g.createEl("div",{cls:"eudia-calendar-account",text:d.accountName});else if(d.attendees&&d.attendees.length>0){let y=d.attendees.filter(m=>m.isExternal!==!1).slice(0,2).map(m=>m.name||m.email?.split("@")[0]||"Unknown").join(", ");y&&g.createEl("div",{cls:"eudia-calendar-attendees",text:y})}p.onclick=()=>this.createNoteForMeeting(d),p.title="Click to create meeting note"}return i}renderEmptyState(e){let t=e.createDiv({cls:"eudia-calendar-empty"});t.innerHTML=`
      <div class="eudia-empty-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <p class="eudia-empty-title">No meetings this week</p>
      <p class="eudia-empty-subtitle">Enjoy your focus time!</p>
    `}renderError(e,t){let n=e.createDiv({cls:"eudia-calendar-error"}),i="",r="Unable to load calendar",s="";t.includes("not authorized")||t.includes("403")?(i="\u{1F512}",r="Calendar Access Required",s="Contact your admin to be added to the authorized users list."):t.includes("network")||t.includes("fetch")?(i="\u{1F4E1}",r="Connection Issue",s="Check your internet connection and try again."):(t.includes("server")||t.includes("500"))&&(i="\u{1F527}",r="Server Unavailable",s="The server may be waking up. Try again in 30 seconds."),n.innerHTML=`
      <div class="eudia-error-icon">${i}</div>
      <p class="eudia-error-title">${r}</p>
      <p class="eudia-error-message">${t}</p>
      ${s?`<p class="eudia-error-action">${s}</p>`:""}
    `;let o=n.createEl("button",{cls:"eudia-btn-retry",text:"Try Again"});o.onclick=()=>this.render()}renderSetupPanel(e){let t=e.createDiv({cls:"eudia-calendar-setup-panel"});t.innerHTML=`
      <div class="eudia-setup-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <h3 class="eudia-setup-title">Connect Your Calendar</h3>
      <p class="eudia-setup-desc">Enter your Eudia email to see your meetings and create notes with one click.</p>
    `;let n=t.createDiv({cls:"eudia-setup-input-group"}),i=n.createEl("input",{type:"email",placeholder:"yourname@eudia.com"});i.addClass("eudia-setup-email");let r=n.createEl("button",{cls:"eudia-setup-connect",text:"Connect"}),s=t.createDiv({cls:"eudia-setup-status"});r.onclick=async()=>{let o=i.value.trim().toLowerCase();if(!o||!o.endsWith("@eudia.com")){s.textContent="Please use your @eudia.com email",s.className="eudia-setup-status error";return}r.disabled=!0,r.textContent="Connecting...",s.textContent="";try{if(!(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/calendar/validate/${o}`,method:"GET"})).json?.authorized){s.innerHTML=`<strong>${o}</strong> is not authorized. Contact your admin to be added.`,s.className="eudia-setup-status error",r.disabled=!1,r.textContent="Connect";return}this.plugin.settings.userEmail=o,this.plugin.settings.calendarConfigured=!0,await this.plugin.saveSettings(),s.textContent="Connected",s.className="eudia-setup-status success",this.plugin.scanLocalAccountFolders().catch(()=>{}),setTimeout(()=>this.render(),500)}catch(l){let c=l.message||"Connection failed";c.includes("403")?s.innerHTML=`<strong>${o}</strong> is not authorized for calendar access.`:s.textContent=c,s.className="eudia-setup-status error",r.disabled=!1,r.textContent="Connect"}},i.onkeydown=o=>{o.key==="Enter"&&r.click()},t.createEl("p",{cls:"eudia-setup-help",text:"Your calendar syncs automatically via Microsoft 365."})}extractCompanyFromDomain(e){let t=e.toLowerCase().split("."),n=["mail","email","app","portal","crm","www","smtp","sales","support","login","sso","auth","api","my"],i=["com","org","net","io","co","ai","gov","edu","uk","us","de","fr","jp","au","ca"],r=t.filter(o=>!i.includes(o)&&o.length>1);if(r.length===0)return t[0]||"";if(r.length>1&&n.includes(r[0]))return r[1].charAt(0).toUpperCase()+r[1].slice(1);let s=r[r.length-1];return s.charAt(0).toUpperCase()+s.slice(1)}getExternalDomainsFromAttendees(e){if(!e||e.length===0)return[];let t=["gmail.com","outlook.com","hotmail.com","yahoo.com","icloud.com","live.com","msn.com","aol.com","protonmail.com","googlemail.com","mail.com","zoho.com","ymail.com"],n=new Set,i=[];for(let r of e){if(!r.email)continue;let o=r.email.toLowerCase().match(/@([a-z0-9.-]+)/);if(o){let l=o[1];if(l.includes("eudia.com")||t.includes(l)||n.has(l))continue;n.add(l);let c=this.extractCompanyFromDomain(l);c.length>=2&&i.push({domain:l,company:c})}}return i}findBestAccountMatch(e,t,n){let i=this.plugin.settings.accountsFolder||"Accounts",r=this.app.vault.getAbstractFileByPath(i);if(!(r instanceof u.TFolder))return null;let s=[];for(let l of r.children)l instanceof u.TFolder&&s.push(l.name);if(s.length===0)return null;let o=[];for(let{domain:l,company:c}of e){let d=this.findAccountFolder(c),p=d?1:0;o.push({domain:l,company:c,folder:d,score:p})}if(o.sort((l,c)=>c.score-l.score),o.length>0&&o[0].folder){let l=o[0],c=l.folder.split("/").pop()||l.company;return console.log(`[Eudia Calendar] Best domain match: "${l.company}" from ${l.domain} -> ${l.folder}`),{folder:l.folder,accountName:c,source:"domain"}}if(t){let l=this.findAccountFolder(t);if(l){let c=l.split("/").pop()||t;return console.log(`[Eudia Calendar] Server account match: "${t}" -> ${l}`),{folder:l,accountName:c,source:"server"}}}if(n){let l=this.findAccountFolder(n);if(l){let c=l.split("/").pop()||n;return console.log(`[Eudia Calendar] Subject match: "${n}" -> ${l}`),{folder:l,accountName:c,source:"subject"}}}for(let{company:l}of e){let c=s.find(d=>{let p=d.toLowerCase(),g=l.toLowerCase();return p.includes(g)||g.includes(p)});if(c){let d=`${i}/${c}`;return console.log(`[Eudia Calendar] Partial domain match: "${l}" -> ${d}`),{folder:d,accountName:c,source:"domain-partial"}}}return null}extractAccountFromAttendees(e){let t=this.getExternalDomainsFromAttendees(e);if(t.length===0)return null;let n=t[0];return console.log(`[Eudia Calendar] Extracted company "${n.company}" from attendee domain ${n.domain}`),n.company}extractAccountFromSubject(e){if(!e)return null;let t=e.match(/^([^\/]+)\s*\/\s*Eudia|Eudia\s*\/\s*([^\/\-|]+)/i);if(t){let i=(t[1]||t[2]||"").trim();if(i.toLowerCase()!=="eudia")return i}let n=e.match(/^Eudia\s*[-–]\s*([^|]+)|^([^-–]+)\s*[-–]\s*Eudia/i);if(n){let r=(n[1]||n[2]||"").trim().replace(/\s+(Connect|Weekly|Call|Meeting|Intro|Demo|Check\s*in|Sync).*$/i,"").trim();if(r.toLowerCase()!=="eudia"&&r.length>0)return r}if(!e.toLowerCase().includes("eudia")){let i=e.match(/^([^-–|]+)/);if(i){let r=i[1].trim();if(r.length>2&&r.length<50)return r}}return null}findAccountFolder(e){if(!e)return null;let t=this.plugin.settings.accountsFolder||"Accounts",n=this.app.vault.getAbstractFileByPath(t);if(!(n instanceof u.TFolder))return console.log(`[Eudia Calendar] Accounts folder "${t}" not found`),null;let i=e.toLowerCase().trim(),r=[];for(let p of n.children)p instanceof u.TFolder&&r.push(p.name);console.log(`[Eudia Calendar] Searching for "${i}" in ${r.length} folders`);let s=r.find(p=>p.toLowerCase()===i);if(s)return console.log(`[Eudia Calendar] Exact match found: ${s}`),`${t}/${s}`;let o=r.find(p=>p.toLowerCase().startsWith(i));if(o)return console.log(`[Eudia Calendar] Folder starts with match: ${o}`),`${t}/${o}`;let l=r.find(p=>i.startsWith(p.toLowerCase()));if(l)return console.log(`[Eudia Calendar] Search starts with folder match: ${l}`),`${t}/${l}`;let c=r.find(p=>{let g=p.toLowerCase();return g.length<3||!i.includes(g)?!1:new RegExp(`\\b${g.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`).test(i)});if(c)return console.log(`[Eudia Calendar] Search contains folder match: ${c}`),`${t}/${c}`;let d=r.find(p=>{let g=p.toLowerCase();return i.length<3||!g.includes(i)?!1:new RegExp(`\\b${i.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`).test(g)});return d?(console.log(`[Eudia Calendar] Folder contains search match: ${d}`),`${t}/${d}`):(console.log(`[Eudia Calendar] No folder match found for "${i}"`),null)}async createNoteForMeeting(e){let t=e.start.split("T")[0],n=this.plugin.settings.eudiaEmail||"",i=M(n),r=(e.attendees||[]).map(v=>v.email).filter(Boolean),s=de(e.subject,r);if(i&&s.isPipelineMeeting&&s.confidence>=60){await this._createPipelineNote(e,t);return}let o=e.subject.replace(/[<>:"/\\|?*]/g,"_").substring(0,50),l=`${t} - ${o}.md`,c=null,d=e.accountName||null,p=null;console.log(`[Eudia Calendar] === Creating note for meeting: "${e.subject}" ===`),console.log(`[Eudia Calendar] Attendees: ${JSON.stringify(e.attendees?.map(v=>v.email)||[])}`);let g=this.getExternalDomainsFromAttendees(e.attendees||[]);console.log(`[Eudia Calendar] External domains found: ${JSON.stringify(g)}`);let y=this.extractAccountFromSubject(e.subject);console.log(`[Eudia Calendar] Subject-extracted name: "${y||"none"}"`);let m=this.findBestAccountMatch(g,e.accountName,y||void 0);if(m&&(c=m.folder,d=m.accountName,console.log(`[Eudia Calendar] Best match (${m.source}): "${d}" -> ${c}`)),!c){let v=this.plugin.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(v)instanceof u.TFolder&&(c=v,console.log(`[Eudia Calendar] No match found, using Accounts root: ${c}`))}if(d){let v=this.plugin.settings.cachedAccounts.find(h=>h.name.toLowerCase()===d?.toLowerCase());v&&(p=v.id,d=v.name,console.log(`[Eudia Calendar] Matched to cached account: ${v.name} (${v.id})`))}let w=c?`${c}/${l}`:l,O=this.app.vault.getAbstractFileByPath(w);if(O instanceof u.TFile){await this.app.workspace.getLeaf().openFile(O);try{let v=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;v?.revealInFolder&&v.revealInFolder(O)}catch{}new u.Notice(`Opened existing note: ${l}`);return}let f=(e.attendees||[]).map(v=>v.name||v.email?.split("@")[0]||"Unknown").slice(0,5).join(", "),C=`---
title: "${e.subject}"
date: ${t}
attendees: [${f}]
account: "${d||""}"
account_id: "${p||""}"
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

`;try{let v=await this.app.vault.create(w,C);await this.app.workspace.getLeaf().openFile(v);try{let h=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;h?.revealInFolder&&h.revealInFolder(v)}catch{}new u.Notice(`Created: ${w}`)}catch(v){console.error("[Eudia Calendar] Failed to create note:",v),new u.Notice(`Could not create note: ${v.message||"Unknown error"}`)}}async _createPipelineNote(e,t){let n=new Date(t+"T00:00:00"),i=String(n.getMonth()+1).padStart(2,"0"),r=String(n.getDate()).padStart(2,"0"),s=String(n.getFullYear()).slice(-2),o=`${i}.${r}.${s}`,l=`Team Pipeline Meeting - ${o}.md`,c="Pipeline Meetings";this.app.vault.getAbstractFileByPath(c)||await this.app.vault.createFolder(c);let p=`${c}/${l}`,g=this.app.vault.getAbstractFileByPath(p);if(g instanceof u.TFile){await this.app.workspace.getLeaf().openFile(g);try{let w=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;w?.revealInFolder&&w.revealInFolder(g)}catch{}new u.Notice(`Opened existing: ${l}`);return}let y=(e.attendees||[]).map(w=>w.name||w.email?.split("@")[0]||"Unknown"),m=`---
title: "Team Pipeline Meeting - ${o}"
date: ${t}
attendees: [${y.slice(0,10).join(", ")}]
meeting_type: pipeline_review
meeting_start: ${e.start}
transcribed: false
---

# Weekly Pipeline Review | ${n.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"})}

## Attendees
${y.map(w=>`- ${w}`).join(`
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

`;try{let w=await this.app.vault.create(p,m);await this.app.workspace.getLeaf().openFile(w);try{let O=this.app.internalPlugins?.getPluginById?.("file-explorer")?.instance;O?.revealInFolder&&O.revealInFolder(w)}catch{}new u.Notice(`Created pipeline note: ${l}`),console.log(`[Eudia Pipeline] Created pipeline meeting note: ${p}`)}catch(w){console.error("[Eudia Pipeline] Failed to create pipeline note:",w),new u.Notice(`Could not create pipeline note: ${w.message||"Unknown error"}`)}}},Q=class extends u.Plugin{constructor(){super(...arguments);this.audioRecorder=null;this.recordingStatusBar=null;this.micRibbonIcon=null;this.liveTranscript="";this.liveTranscriptChunkInterval=null;this.isTranscribingChunk=!1;this._updateRetryCount=0;this.sfSyncStatusBarEl=null;this.sfSyncIntervalId=null}async onload(){if(await this.loadSettings(),this.transcriptionService=new q(this.settings.serverUrl),this.calendarService=new F(this.settings.serverUrl,this.settings.userEmail,this.settings.timezone||"America/New_York"),this.smartTagService=new J,this.telemetry=new te(this.settings.serverUrl,this.settings.userEmail),W.setupDisplayMediaHandler().then(e=>{console.log(e?"[Eudia] System audio: loopback handler ready":"[Eudia] System audio: handler not available, will try other strategies on record")}).catch(()=>{}),this.checkForUpdateRollback().catch(e=>console.warn("[Eudia] Rollback check error:",e)),this.settings.pendingUpdateVersion){let e=this.settings.pendingUpdateVersion;this.settings.pendingUpdateVersion=null,this.saveSettings(),setTimeout(()=>{console.log(`[Eudia Update] Resuming deferred update to v${e}`),this.performAutoUpdate(this.settings.serverUrl||"https://gtm-wizard.onrender.com",e,this.manifest?.version||"0.0.0")},8e3)}setTimeout(()=>this.checkForPluginUpdate(),5e3),this.registerInterval(window.setInterval(()=>this.checkForPluginUpdate(),30*60*1e3)),setTimeout(()=>this.healFailedTranscriptions(),3e4),this.registerView(G,e=>new oe(e,this)),this.registerView(B,e=>new se(e,this)),this.registerView(L,e=>new re(e,this)),this.addRibbonIcon("calendar","Open Calendar",()=>this.activateCalendarView()),this.micRibbonIcon=this.addRibbonIcon("microphone","Transcribe Meeting",async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}),this.addRibbonIcon("message-circle","Ask GTM Brain",()=>{this.openIntelligenceQueryForCurrentNote()}),this.registerEvent(this.app.vault.on("create",async e=>{if(!(e instanceof u.TFile)||e.extension!=="md")return;let t=this.settings.accountsFolder||"Accounts";if(!e.path.startsWith(t+"/")||!e.basename.startsWith("Untitled"))return;let n=e.path.split("/");if(n.length<3)return;let i=n[1],r=n.slice(0,2).join("/"),s="",o=["Contacts.md","Note 1.md","Intelligence.md"];for(let O of o){let f=this.app.vault.getAbstractFileByPath(`${r}/${O}`);if(f instanceof u.TFile)try{let v=(await this.app.vault.read(f)).match(/account_id:\s*"?([^"\n]+)"?/);if(v){s=v[1].trim();break}}catch{}}let l=this.app.vault.getAbstractFileByPath(r),c=0;if(l&&l.children)for(let O of l.children){let f=O.name?.match(/^Note\s+(\d+)/i);f&&(c=Math.max(c,parseInt(f[1])))}let d=c+1,p=new Date,g=p.toLocaleDateString("en-US",{month:"short",day:"numeric"}),y=p.toISOString().split("T")[0],m=`Note ${d} - ${g}.md`,w=`---
account: "${i}"
account_id: "${s}"
type: meeting_note
sync_to_salesforce: false
created: ${y}
---

# ${i} - Meeting Note

**Date:** ${g}
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`;try{let O=`${r}/${m}`;await this.app.vault.modify(e,w),await this.app.fileManager.renameFile(e,O),console.log(`[Eudia] Auto-templated: ${O} (account_id: ${s})`)}catch(O){console.warn("[Eudia] Auto-template failed:",O)}})),this.addCommand({id:"transcribe-meeting",name:"Transcribe Meeting",callback:async()=>{this.audioRecorder?.isRecording()?await this.stopRecording():await this.startRecording()}}),this.addCommand({id:"open-calendar",name:"Open Calendar",callback:()=>this.activateCalendarView()}),this.addCommand({id:"sync-accounts",name:"Sync Salesforce Accounts",callback:()=>this.syncAccounts()}),this.addCommand({id:"sync-note",name:"Sync Note to Salesforce",callback:()=>this.syncNoteToSalesforce()}),this.addCommand({id:"new-meeting-note",name:"New Meeting Note",callback:()=>this.createMeetingNote()}),this.addCommand({id:"ask-gtm-brain",name:"Ask gtm-brain",callback:()=>this.openIntelligenceQueryForCurrentNote()}),this.addCommand({id:"copy-for-slack",name:"Copy Note for Slack",callback:()=>this.copyForSlack()}),this.addCommand({id:"check-for-updates",name:"Check for Eudia Updates",callback:async()=>{new u.Notice("Checking for updates...",3e3);let e=this.manifest?.version||"?";try{let t=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=await(0,u.requestUrl)({url:`${t}/api/plugin/version`}),i=n.json?.currentVersion||"?";if(n.json?.success&&i!==e){let r=i.split(".").map(Number),s=e.split(".").map(Number),o=!1;for(let l=0;l<3;l++){if((r[l]||0)>(s[l]||0)){o=!0;break}if((r[l]||0)<(s[l]||0))break}o?(new u.Notice(`Updating v${e} \u2192 v${i}...`,5e3),await this.performAutoUpdate(t,i,e)):new u.Notice(`Eudia is up to date (v${e}).`,5e3)}else new u.Notice(`Eudia is up to date (v${e}).`,5e3)}catch(t){new u.Notice(`Update check failed: ${t.message||"server unreachable"}. Current: v${e}`,8e3)}}}),this.addCommand({id:"test-system-audio",name:"Test System Audio Capture",callback:async()=>{new u.Notice("Probing system audio capabilities...",3e3);try{let e=await W.probeSystemAudioCapabilities(),t=[`Platform: ${e.platform}`,`Electron: ${e.electronVersion||"N/A"} | Chromium: ${e.chromiumVersion||"N/A"}`,`desktopCapturer: ${e.desktopCapturerAvailable?`YES (${e.desktopCapturerSources} sources)`:"no"}`,`@electron/remote: ${e.remoteAvailable?"YES":"no"} | session: ${e.remoteSessionAvailable?"YES":"no"}`,`ipcRenderer: ${e.ipcRendererAvailable?"YES":"no"}`,`getDisplayMedia: ${e.getDisplayMediaAvailable?"YES":"no"}`,`Handler setup: ${e.handlerSetupResult}`,"",`Best path: ${e.bestPath}`];new u.Notice(t.join(`
`),2e4),console.log("[Eudia] System audio probe:",JSON.stringify(e,null,2))}catch(e){new u.Notice(`Probe failed: ${e.message}`,5e3)}}}),this.addCommand({id:"enrich-accounts",name:"Enrich Account Folders with Salesforce Data",callback:async()=>{if(!this.settings.userEmail){new u.Notice("Please set up your email first.");return}let e=new H(this.settings.serverUrl),t;_(this.settings.userEmail)?t=await e.getCSAccounts(this.settings.userEmail):t=await e.getAccountsWithProspects(this.settings.userEmail);let n=[...t.accounts,...t.prospects];if(n.length===0){new u.Notice("No accounts found to enrich.");return}await this.enrichAccountFolders(n)}}),this.addCommand({id:"refresh-analytics",name:"Refresh Analytics Dashboard",callback:async()=>{let e=this.app.workspace.getActiveFile();e?await this.refreshAnalyticsDashboard(e):new u.Notice("No active file")}}),this.addCommand({id:"live-query-transcript",name:"Query Current Transcript (Live)",callback:async()=>{if(!this.audioRecorder?.isRecording()){new u.Notice("No active recording. Start recording first to use live query.");return}if(!this.liveTranscript||this.liveTranscript.length<50){new u.Notice("Not enough transcript captured yet. Keep recording for a few more minutes.");return}this.openLiveQueryModal()}}),this.addCommand({id:"retry-transcription",name:"Retry Transcription",callback:async()=>{await this.retryTranscriptionForCurrentNote()}}),this.sfSyncStatusBarEl=this.addStatusBarItem(),this.sfSyncStatusBarEl.setText("SF Sync: Idle"),this.sfSyncStatusBarEl.addClass("eudia-sf-sync-status"),this.addSettingTab(new ce(this.app,this)),this.registerEditorSuggest(new ne(this.app,this)),this.app.workspace.onLayoutReady(async()=>{if(this.settings.setupCompleted){if(this.settings.syncOnStartup){if(await this.scanLocalAccountFolders(),this.settings.userEmail&&this.settings.syncAccountsOnStartup){let e=new Date().toISOString().split("T")[0];this.settings.lastAccountRefreshDate!==e&&setTimeout(async()=>{try{console.log("[Eudia] Startup account sync - checking for changes...");let n=await this.syncAccountFolders();if(n.success){if(this.settings.lastAccountRefreshDate=e,await this.saveSettings(),n.added>0||n.archived>0){let i=[];n.added>0&&i.push(`${n.added} added`),n.archived>0&&i.push(`${n.archived} archived`),new u.Notice(`Account folders synced: ${i.join(", ")}`)}}else console.log("[Eudia] Sync failed:",n.error)}catch{console.log("[Eudia] Startup sync skipped (server unreachable), will retry tomorrow")}},2e3)}this.settings.showCalendarView&&this.settings.userEmail&&await this.activateCalendarView(),this.settings.userEmail&&this.settings.cachedAccounts.length>0&&setTimeout(async()=>{try{await this.checkAndAutoEnrich()}catch{console.log("[Eudia] Auto-enrich skipped (server unreachable)")}},5e3),this.settings.userEmail&&this.telemetry?setTimeout(async()=>{try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),t=0;e&&e instanceof u.TFolder&&(t=e.children.filter(s=>s instanceof u.TFolder&&!s.name.startsWith("_")).length);let n={salesforce:this.settings.salesforceConnected?"connected":"not_configured",calendar:this.settings.calendarConfigured?"connected":"not_configured"},i=await this.telemetry.sendHeartbeat(t,n);if(i?.latestVersion){let s=i.latestVersion.split(".").map(Number),o=(this.manifest?.version||"0.0.0").split(".").map(Number),l=!1;for(let c=0;c<3;c++){if((s[c]||0)>(o[c]||0)){l=!0;break}if((s[c]||0)<(o[c]||0))break}if(l){console.log(`[Eudia Update] Heartbeat detected update: v${this.manifest?.version} \u2192 v${i.latestVersion}`);let c=this.settings.serverUrl||"https://gtm-wizard.onrender.com";await this.performAutoUpdate(c,i.latestVersion,this.manifest?.version||"0.0.0")}}let r=await this.telemetry.checkForPushedConfig();if(r.length>0){let s=!1;for(let o of r)o.key&&this.settings.hasOwnProperty(o.key)&&(this.settings[o.key]=o.value,s=!0,console.log(`[Eudia] Applied pushed config: ${o.key} = ${o.value}`));s&&(await this.saveSettings(),new u.Notice("Settings updated by admin"))}await this.checkAndConsumeSyncFlags(),this.startSalesforceSyncScanner()}catch{console.log("[Eudia] Heartbeat/config check skipped"),this.startSalesforceSyncScanner()}},3e3):this.settings.sfAutoSyncEnabled&&this.settings.salesforceConnected&&setTimeout(()=>this.startSalesforceSyncScanner(),5e3)}}else{await new Promise(t=>setTimeout(t,100));let e=document.querySelector(".modal-container .modal");if(e){let t=e.querySelector(".modal-close-button");t&&t.click()}await this.activateSetupView()}this.app.workspace.on("file-open",async e=>{if(e&&(e.path.includes("_Analytics/")||e.path.includes("_Customer Health/")))try{let t=await this.app.vault.read(e);if(t.includes("type: analytics_dashboard")){let i=t.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/)?.[1],r=new Date().toISOString().split("T")[0];i!==r&&(console.log(`[Eudia] Auto-refreshing analytics: ${e.name}`),await this.refreshAnalyticsDashboard(e))}}catch{}})})}async onunload(){this.app.workspace.detachLeavesOfType(G),this.app.workspace.detachLeavesOfType(L)}static{this.MAX_UPDATE_RETRIES=3}static{this.UPDATE_RETRY_DELAYS=[15e3,45e3,9e4]}async checkForPluginUpdate(){let e=this.settings.serverUrl||"https://gtm-wizard.onrender.com",t=this.manifest?.version||"0.0.0";for(let n=0;n<=EudiaPlugin.MAX_UPDATE_RETRIES;n++)try{if(n>0){let c=EudiaPlugin.UPDATE_RETRY_DELAYS[n-1]||9e4;console.log(`[Eudia Update] Retry ${n}/${EudiaPlugin.MAX_UPDATE_RETRIES} in ${c/1e3}s...`),await new Promise(d=>setTimeout(d,c))}let i=await(0,u.requestUrl)({url:`${e}/api/plugin/version`,method:"GET",headers:{"Content-Type":"application/json"}});if(!i.json?.success||!i.json?.currentVersion){console.log("[Eudia Update] Version endpoint returned unexpected data:",i.json);continue}let r=i.json.currentVersion,s=r.split(".").map(Number),o=t.split(".").map(Number),l=!1;for(let c=0;c<3;c++){if((s[c]||0)>(o[c]||0)){l=!0;break}if((s[c]||0)<(o[c]||0))break}!l&&i.json.forceUpdate&&r!==t&&(l=!0,console.log(`[Eudia Update] Server flagged forceUpdate for v${r}`)),l?(console.log(`[Eudia Update] v${r} available (current: v${t})`),await this.performAutoUpdate(e,r,t)):console.log(`[Eudia Update] Up to date (v${t})`);return}catch(i){console.log(`[Eudia Update] Check failed (attempt ${n+1}):`,i.message||i)}console.log("[Eudia Update] All retry attempts exhausted \u2014 will try again on next cycle")}async sha256(e){let n=new TextEncoder().encode(e),i=await crypto.subtle.digest("SHA-256",n);return Array.from(new Uint8Array(i)).map(s=>s.toString(16).padStart(2,"0")).join("")}async checkForUpdateRollback(){if(!this.settings.lastUpdateTimestamp||!this.settings.lastUpdateVersion)return;let e=Date.now()-new Date(this.settings.lastUpdateTimestamp).getTime(),t=this.manifest?.version||"0.0.0";if(t===this.settings.lastUpdateVersion){this.settings.lastUpdateTimestamp=null,this.settings.pendingUpdateVersion=null,await this.saveSettings(),this.telemetry.reportUpdateCheck({localVersion:t,remoteVersion:this.settings.lastUpdateVersion,updateNeeded:!1,updateResult:"success"}),console.log(`[Eudia Update] Update to v${t} confirmed successful`);return}if(e<12e4){let n=this.manifest.dir;if(!n)return;let i=this.app.vault.adapter;try{if(await i.exists(`${n}/main.js.bak`)){let s=await i.read(`${n}/main.js.bak`);await i.write(`${n}/main.js`,s),console.log(`[Eudia Update] Rolled back to previous version (v${this.settings.lastUpdateVersion} may have failed)`),this.telemetry.reportUpdateCheck({localVersion:t,remoteVersion:this.settings.lastUpdateVersion||"unknown",updateNeeded:!1,updateResult:"failed"})}}catch(r){console.warn("[Eudia Update] Rollback check failed:",r.message)}this.settings.lastUpdateTimestamp=null,this.settings.lastUpdateVersion=null,this.settings.pendingUpdateVersion=null,await this.saveSettings()}}async performAutoUpdate(e,t,n){try{if(this.audioRecorder?.isRecording()){this.settings.pendingUpdateVersion=t,await this.saveSettings(),new u.Notice(`Eudia v${t} available \u2014 will update after your recording.`,8e3),this.telemetry.reportUpdateCheck({localVersion:n,remoteVersion:t,updateNeeded:!0,updateResult:"deferred"});return}let i=this.manifest.dir;if(!i){console.log("[Eudia Update] Cannot determine plugin directory");return}let r={};try{r=(await(0,u.requestUrl)({url:`${e}/api/plugin/version`,method:"GET",headers:{"Content-Type":"application/json"}})).json?.checksums||{}}catch{console.log("[Eudia Update] Could not fetch checksums \u2014 proceeding with size validation only")}let s=this.app.vault.adapter;console.log(`[Eudia Update] Downloading v${t}...`);let[o,l,c]=await Promise.all([(0,u.requestUrl)({url:`${e}/api/plugin/main.js`}),(0,u.requestUrl)({url:`${e}/api/plugin/manifest.json`}),(0,u.requestUrl)({url:`${e}/api/plugin/styles.css`})]),d=o.text,p=l.text,g=c.text,y=[["main.js",d,1e4,5*1024*1024],["manifest.json",p,50,1e4],["styles.css",g,100,5e5]];for(let[m,w,O,f]of y)if(!w||w.length<O||w.length>f){console.log(`[Eudia Update] ${m} validation failed (${w?.length??0} bytes, need ${O}-${f})`),this.telemetry.reportUpdateCheck({localVersion:n,remoteVersion:t,updateNeeded:!0,updateResult:"failed"});return}if(r.mainJs){let m=await this.sha256(d);if(m!==r.mainJs){console.log(`[Eudia Update] main.js checksum mismatch: expected ${r.mainJs.slice(0,12)}..., got ${m.slice(0,12)}...`),this.telemetry.reportUpdateCheck({localVersion:n,remoteVersion:t,updateNeeded:!0,updateResult:"failed"});return}console.log("[Eudia Update] main.js checksum verified")}if(r.styles&&await this.sha256(g)!==r.styles){console.log("[Eudia Update] styles.css checksum mismatch"),this.telemetry.reportUpdateCheck({localVersion:n,remoteVersion:t,updateNeeded:!0,updateResult:"failed"});return}try{let m=JSON.parse(p);if(m.version!==t){console.log(`[Eudia Update] Version mismatch: expected ${t}, got ${m.version}`);return}}catch{console.log("[Eudia Update] Downloaded manifest is not valid JSON");return}try{let m=await s.read(`${i}/main.js`);await s.write(`${i}/main.js.bak`,m)}catch{}try{let m=await s.read(`${i}/styles.css`);await s.write(`${i}/styles.css.bak`,m)}catch{}await s.write(`${i}/main.js`,d),await s.write(`${i}/manifest.json`,p),await s.write(`${i}/styles.css`,g),console.log(`[Eudia Update] Files written: v${n} \u2192 v${t}`),this.settings.lastUpdateVersion=t,this.settings.lastUpdateTimestamp=new Date().toISOString(),this.settings.pendingUpdateVersion=null,await this.saveSettings(),this.telemetry.reportUpdateCheck({localVersion:n,remoteVersion:t,updateNeeded:!0,updateResult:"success"}),this.audioRecorder?.isRecording()?new u.Notice(`Eudia v${t} downloaded \u2014 will apply after recording.`,1e4):(new u.Notice(`Eudia updating to v${t}...`,3e3),setTimeout(async()=>{try{let m=this.app.plugins;await m.disablePlugin(this.manifest.id),await m.enablePlugin(this.manifest.id),console.log(`[Eudia Update] Hot-reloaded: v${n} \u2192 v${t}`),new u.Notice(`Eudia v${t} active.`,5e3)}catch{new u.Notice(`Eudia updated to v${t}. Restart Obsidian to apply.`,1e4)}},1500))}catch(i){console.log("[Eudia Update] Update failed:",i.message||i),this.telemetry.reportUpdateCheck({localVersion:n,remoteVersion:t,updateNeeded:!0,updateResult:"failed"})}}resolveRecordingForNote(e,t,n){let i=t.match(/recording_path:\s*"?([^"\n]+)"?/);if(i){let c=this.app.vault.getAbstractFileByPath(i[1].trim());if(c&&c instanceof u.TFile)return c}let r=t.match(/saved to \*\*([^*]+)\*\*/);if(r){let c=this.app.vault.getAbstractFileByPath(r[1]);if(c&&c instanceof u.TFile)return c}let s=e.stat?.mtime||0,o=null,l=1/0;for(let c of n){if(!c.timestamp)continue;let d=Math.abs(s-c.timestamp.getTime());d<30*60*1e3&&d<l&&(l=d,o=c.file)}return o}async healSingleNote(e,t,n){let i=await this.app.vault.readBinary(n),r=n.extension==="mp4"||n.extension==="m4a"?"audio/mp4":"audio/webm",s=new Blob([i],{type:r}),o={},l=e.path.split("/"),c=this.settings.accountsFolder||"Accounts";l[0]===c&&l.length>=2&&(o.accountName=l[1]);let d=l[0]==="Pipeline Meetings"||/meeting_type:\s*pipeline_review/.test(t),p=await this.transcriptionService.transcribeAudio(s,{...o,captureMode:"full_call",meetingTemplate:this.settings.meetingTemplate||"meddic",meetingType:d?"pipeline_review":void 0}),g=f=>f?!!(f.summary?.trim()||f.nextSteps?.trim()):!1,y=p.sections;if(!g(y)&&p.text?.trim()&&(y=await this.transcriptionService.processTranscription(p.text,o)),!g(y)&&!p.text?.trim())return!1;let m=t.replace(/\n\n---\n\*\*Processing your recording\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,"").replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,"").replace(/\n\n\*\*Transcription failed:\*\*[^\n]*(\nYour recording was saved to[^\n]*)?\n/g,"").trim(),w;d?w=this.buildPipelineNoteContent(y,p,e.path):w=this.buildNoteContent(y,p);let O=m.indexOf("---",m.indexOf("---")+3);if(O>0){let f=m.substring(0,O+3);await this.app.vault.modify(e,f+`

`+w)}else await this.app.vault.modify(e,w);return!0}collectRecordingFiles(){let e=r=>r.children.filter(s=>s instanceof u.TFile&&/\.(webm|mp4|m4a|ogg)$/i.test(s.name)).map(s=>{let o=s.name.match(/recording-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/),l=o?new Date(`${o[1]}-${o[2]}-${o[3]}T${o[4]}:${o[5]}:${o[6]}Z`):null;return{file:s,timestamp:l}}).filter(s=>s.timestamp!==null),t=[],n=this.app.vault.getAbstractFileByPath(this.settings.recordingsFolder||"Recordings");n&&n instanceof u.TFolder&&t.push(...e(n));let i=this.app.vault.getAbstractFileByPath("_backups");return i&&i instanceof u.TFolder&&t.push(...e(i)),t.sort((r,s)=>s.timestamp.getTime()-r.timestamp.getTime()),t}async healFailedTranscriptions(){if(!this.audioRecorder?.isRecording())try{await this.processHealQueue();let e=this.app.vault.getMarkdownFiles(),t=[];for(let r of e)try{let s=await this.app.vault.read(r);s.includes("**Transcription failed:**")&&t.push({file:r,content:s})}catch{}if(t.length===0)return;console.log(`[Eudia AutoHeal] Found ${t.length} note(s) with failed transcriptions`);let n=this.collectRecordingFiles();if(n.length===0){console.log("[Eudia AutoHeal] No recordings found in Recordings or _backups");return}let i=0;for(let{file:r,content:s}of t)try{if(!s.includes("**Transcription failed:**")&&(s.includes("## Summary")||s.includes(`## Next Steps
-`)))continue;let l=this.resolveRecordingForNote(r,s,n);if(!l){console.log(`[Eudia AutoHeal] No matching recording for "${r.path}"`);continue}if(console.log(`[Eudia AutoHeal] Healing "${r.path}" with recording "${l.path}"`),!await this.healSingleNote(r,s,l)){console.log(`[Eudia AutoHeal] Re-transcription returned no content for "${r.path}" \u2014 adding to heal queue`),this.addToHealQueue(r.path,l.path,"Re-transcription returned no content");continue}this.removeFromHealQueue(r.path),i++,console.log(`[Eudia AutoHeal] Successfully healed "${r.path}"`)}catch(o){let l=o.message;console.error(`[Eudia AutoHeal] Failed to heal "${r.path}":`,l);let c=this.resolveRecordingForNote(r,s,n);c&&this.addToHealQueue(r.path,c.path,l)}this.telemetry.reportAutoHealScan({totalNotes:e.length,failedNotes:t.length,recordings:n.length,healed:i,failed:t.length-i,queueSize:this.settings.healQueue.length}),i>0&&(console.log(`[Eudia AutoHeal] Healed ${i}/${t.length} failed transcription(s)`),new u.Notice(`Recovered ${i} previously failed transcription${i>1?"s":""}.`,8e3))}catch(e){console.error("[Eudia AutoHeal] Error:",e.message)}}static{this.HEAL_BACKOFF_MS=[6e4,3e5,18e5,72e5,288e5]}addToHealQueue(e,t,n){let i=this.settings.healQueue.find(r=>r.notePath===e);i?(i.attemptCount++,i.lastAttempt=new Date().toISOString(),i.error=n):this.settings.healQueue.push({notePath:e,recordingPath:t,attemptCount:1,lastAttempt:new Date().toISOString(),error:n}),this.saveSettings()}removeFromHealQueue(e){this.settings.healQueue=this.settings.healQueue.filter(t=>t.notePath!==e),this.saveSettings()}async processHealQueue(){if(this.settings.healQueue.length===0)return;let e=Date.now(),t=0;for(let n of[...this.settings.healQueue]){let i=Math.min(n.attemptCount-1,EudiaPlugin.HEAL_BACKOFF_MS.length-1),r=EudiaPlugin.HEAL_BACKOFF_MS[i],s=new Date(n.lastAttempt).getTime();if(e-s<r)continue;let o=this.app.vault.getAbstractFileByPath(n.notePath),l=this.app.vault.getAbstractFileByPath(n.recordingPath);if(!o||!(o instanceof u.TFile)){this.removeFromHealQueue(n.notePath);continue}if(!l||!(l instanceof u.TFile)){console.log(`[Eudia AutoHeal Queue] Recording "${n.recordingPath}" no longer exists \u2014 removing from queue`),this.removeFromHealQueue(n.notePath);continue}console.log(`[Eudia AutoHeal Queue] Retry #${n.attemptCount+1} for "${n.notePath}"`);try{let c=await this.app.vault.read(o);await this.healSingleNote(o,c,l)?(this.removeFromHealQueue(n.notePath),t++,console.log(`[Eudia AutoHeal Queue] Successfully healed "${n.notePath}" on retry #${n.attemptCount+1}`)):this.addToHealQueue(n.notePath,n.recordingPath,"Re-transcription returned no content")}catch(c){this.addToHealQueue(n.notePath,n.recordingPath,c.message),console.error(`[Eudia AutoHeal Queue] Retry failed for "${n.notePath}":`,c.message)}}t>0&&new u.Notice(`Recovered ${t} previously failed transcription${t>1?"s":""} from retry queue.`,8e3)}async retryTranscriptionForCurrentNote(){let e=this.app.workspace.getActiveFile();if(!e){new u.Notice("No active note. Open the note you want to retry.");return}let t=await this.app.vault.read(e),n=this.collectRecordingFiles(),i=this.resolveRecordingForNote(e,t,n);if(!i){new u.Notice("No matching recording found for this note. Check Recordings or _backups folder.");return}new u.Notice(`Retrying transcription using ${i.name}...`,5e3);try{await this.healSingleNote(e,t,i)?(this.removeFromHealQueue(e.path),new u.Notice("Transcription recovered successfully.",8e3)):new u.Notice("Retry produced no content. The recording may be silent or corrupted.",1e4)}catch(r){let s=r.message;new u.Notice(`Retry failed: ${s}`,1e4),this.addToHealQueue(e.path,i.path,s)}}async loadSettings(){this.settings=Object.assign({},ze,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}async activateCalendarView(){let e=this.app.workspace,t=e.getLeavesOfType(G);if(t.length>0)e.revealLeaf(t[0]);else{let n=e.getRightLeaf(!1);n&&(await n.setViewState({type:G,active:!0}),e.revealLeaf(n))}}async openLiveQuerySidebar(){try{let e=this.app.workspace,t=e.getLeavesOfType(L);if(t.length>0){e.revealLeaf(t[0]);return}let n=e.getRightLeaf(!1);n&&(await n.setViewState({type:L,active:!0}),e.revealLeaf(n))}catch(e){console.log("[Eudia] Could not open live query sidebar:",e)}}closeLiveQuerySidebar(){try{this.app.workspace.detachLeavesOfType(L)}catch{}}async activateSetupView(){let e=this.app.workspace,t=e.getLeavesOfType(B);if(t.length>0)e.revealLeaf(t[0]);else{let n=e.getLeaf(!0);n&&(await n.setViewState({type:B,active:!0}),e.revealLeaf(n))}}async createTailoredAccountFolders(e,t){let n=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);let r=0,s=new Date().toISOString().split("T")[0],o=async c=>{let d=c.name.replace(/[<>:"/\\|?*]/g,"_").trim(),p=`${n}/${d}`;if(this.app.vault.getAbstractFileByPath(p)instanceof u.TFolder)return console.log(`[Eudia] Account folder already exists: ${d}`),!1;try{await this.app.vault.createFolder(p);let y=t?.[c.id],m=!!y,w=this.buildContactsContent(c,y,s),O=this.buildIntelligenceContent(c,y,s),f=this.buildMeetingNotesContent(c,y),C=this.buildNextStepsContent(c,y,s),v=[{name:"Note 1.md",content:`---
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

`},{name:"Meeting Notes.md",content:f},{name:"Contacts.md",content:w},{name:"Intelligence.md",content:O},{name:"Next Steps.md",content:C}];for(let S of v){let x=`${p}/${S.name}`;await this.app.vault.create(x,S.content)}return console.log(`[Eudia] Created account folder with subnotes${m?" (enriched)":""}: ${d}`),!0}catch(y){return console.error(`[Eudia] Failed to create folder for ${d}:`,y),!1}},l=5;for(let c=0;c<e.length;c+=l){let d=e.slice(c,c+l),p=await Promise.allSettled(d.map(g=>o(g)));r+=p.filter(g=>g.status==="fulfilled"&&g.value===!0).length}r>0?(this.settings.cachedAccounts=e.map(c=>({id:c.id,name:c.name})),await this.saveSettings(),new u.Notice(`Created ${r} account folders`)):console.warn(`[Eudia] createTailoredAccountFolders: 0 folders created out of ${e.length} accounts \u2014 not updating cachedAccounts`),await this.ensureNextStepsFolderExists()}buildContactsContent(e,t,n){let i=t?`
enriched_at: "${new Date().toISOString()}"`:"",r=`---
account: "${e.name}"
account_id: "${e.id}"
type: contacts
sync_to_salesforce: false${i}
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
`}buildIntelligenceContent(e,t,n){let i=t?`
enriched_at: "${new Date().toISOString()}"`:"",r=`---
account: "${e.name}"
account_id: "${e.id}"
type: intelligence
sync_to_salesforce: false${i}
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
enriched_at: "${new Date().toISOString()}"`:"",i=`---
account: "${e.name}"
account_id: "${e.id}"
type: meetings_index
sync_to_salesforce: false${n}
---`,r=[];return t?.opportunities&&r.push(t.opportunities),t?.recentActivity&&r.push(t.recentActivity),r.length>0?`${i}

# ${e.name} - Meeting Notes

${r.join(`

`)}

## Quick Start

1. Open **Note 1** for your next meeting
2. Click the **microphone** to record and transcribe
3. **Next Steps** are auto-extracted after transcription
4. Set \`sync_to_salesforce: true\` to sync to Salesforce
`:`${i}

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
`}buildNextStepsContent(e,t,n){let i=n||new Date().toISOString().split("T")[0],r=t?`
enriched_at: "${new Date().toISOString()}"`:"",s=`---
account: "${e.name}"
account_id: "${e.id}"
type: next_steps
auto_updated: true
last_updated: ${i}
sync_to_salesforce: false${r}
---`;return t?.nextSteps?`${s}

# ${e.name} - Next Steps

${t.nextSteps}

---

## History

*Previous next steps will be archived here.*
`:`${s}

# ${e.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}async fetchEnrichmentData(e){let t=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=e.filter(s=>s.id&&s.id.startsWith("001"));if(n.length===0)return{};let i={},r=20;console.log(`[Eudia Enrich] Fetching enrichment data for ${n.length} accounts`);for(let s=0;s<n.length;s+=r){let l=n.slice(s,s+r).map(c=>c.id);try{let c=await(0,u.requestUrl)({url:`${t}/api/accounts/enrich-batch`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountIds:l,userEmail:this.settings.userEmail})});c.json?.success&&c.json?.enrichments&&Object.assign(i,c.json.enrichments)}catch(c){console.error(`[Eudia Enrich] Batch fetch failed (batch ${s/r+1}):`,c)}s+r<n.length&&await new Promise(c=>setTimeout(c,100))}return console.log(`[Eudia Enrich] Got enrichment data for ${Object.keys(i).length}/${n.length} accounts`),i}async createProspectAccountFiles(e){if(!e||e.length===0)return 0;let t=this.settings.accountsFolder||"Accounts",n=`${t}/_Prospects`;if(!this.app.vault.getAbstractFileByPath(n))try{await this.app.vault.createFolder(n)}catch{}let r=0;for(let s of e){let o=s.name.replace(/[<>:"/\\|?*]/g,"_").trim(),l=`${n}/${o}`;if(this.app.vault.getAbstractFileByPath(l)instanceof u.TFolder)continue;let d=`${t}/${o}`;if(this.app.vault.getAbstractFileByPath(d)instanceof u.TFolder)continue;let g=`${n}/${o}.md`,y=this.app.vault.getAbstractFileByPath(g);if(y instanceof u.TFile)try{await this.app.vault.delete(y)}catch{}try{await this.app.vault.createFolder(l);let m=new Date().toISOString().split("T")[0],w=[{name:"Note 1.md",content:`---
account: "${s.name}"
account_id: "${s.id}"
type: meeting_note
tier: prospect
sync_to_salesforce: false
created: ${m}
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
created: ${m}
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
created: ${m}
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
last_updated: ${m}
sync_to_salesforce: false
---

# ${s.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`}];for(let O of w){let f=`${l}/${O.name}`;await this.app.vault.create(f,O.content)}r++}catch(m){console.log(`[Eudia] Failed to create prospect folder for ${s.name}:`,m)}}return r>0&&console.log(`[Eudia] Created ${r} prospect account folders in _Prospects/`),r}async createCSManagerDashboard(e,t){let n="CS Manager",i=new Date().toISOString().split("T")[0],r=ye(e);if(!this.app.vault.getAbstractFileByPath(n))try{await this.app.vault.createFolder(n)}catch{}let s={};for(let p of t){let g=p.ownerName||"Unassigned";s[g]||(s[g]=[]),s[g].push(p)}let o=`---
role: cs_manager
manager: "${e}"
direct_reports: ${r.length}
total_accounts: ${t.length}
created: ${i}
auto_refresh: true
---

# CS Manager Overview

**Manager:** ${e}
**Direct Reports:** ${r.join(", ")||"None configured"}
**Total CS Accounts:** ${t.length}
**Last Refreshed:** ${i}

---

## Account Distribution by Sales Rep

`,l=Object.keys(s).sort();for(let p of l){let g=s[p];o+=`### ${p} (${g.length} accounts)
`;for(let y of g.slice(0,10))o+=`- **${y.name}** \u2014 ${y.type||"Account"}
`;g.length>10&&(o+=`- _...and ${g.length-10} more_
`),o+=`
`}o+=`---

## CS Staffing Pipeline

| Account | Type | Owner | CSM |
|---------|------|-------|-----|
`;for(let p of t.slice(0,50))o+=`| ${p.name} | ${p.type||""} | ${p.ownerName||""} | ${p.csmName||""} |
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
`;let c=`${n}/CS Manager Overview.md`,d=this.app.vault.getAbstractFileByPath(c);d instanceof u.TFile?await this.app.vault.modify(d,o):await this.app.vault.create(c,o);for(let p of r){let g=p.split("@")[0].replace("."," ").replace(/\b\w/g,h=>h.toUpperCase()),y=p.split("@")[0].replace("."," ").toLowerCase(),m=y.split(" ")[0],w=y.split(" ").pop()||"",O=t.filter(h=>{let S=(h.csmName||"").toLowerCase();if(S&&(S.includes(m)||S.includes(w)))return!0;let x=(h.ownerName||"").toLowerCase();return x.includes(m)||x.includes(w)}),f=`---
rep: "${p}"
rep_name: "${g}"
role: cs_rep_summary
account_count: ${O.length}
created: ${i}
---

# ${g} \u2014 CS Account Summary

**Email:** ${p}
**CS Accounts:** ${O.length}

---

## Assigned Accounts

`;if(O.length>0){f+=`| Account | Type | Owner | Folder |
|---------|------|-------|--------|
`;for(let h of O){let S=h.name.replace(/[<>:"/\\|?*]/g,"_").trim();f+=`| ${h.name} | ${h.type||""} | ${h.ownerName||""} | [[Accounts/${S}/Contacts\\|View]] |
`}}else f+=`*No accounts currently matched to this rep. Accounts will populate after connecting to Salesforce (Step 2).*
`;f+=`
---

## Recent Activity

Meeting notes and activity for ${g}'s accounts sync through Salesforce:
- Notes appear in each account's **Meeting Notes** and **Intelligence** sub-notes
- Activity updates when the vault enriches (on open or Salesforce connect)
- Ensure ${g} is syncing their meeting notes to Salesforce for latest data

---

*Updates automatically as new CS-relevant accounts sync.*
`;let C=`${n}/${g}.md`,v=this.app.vault.getAbstractFileByPath(C);v instanceof u.TFile?await this.app.vault.modify(v,f):await this.app.vault.create(C,f)}console.log(`[Eudia] Created CS Manager dashboard for ${e} with ${t.length} accounts across ${l.length} reps`)}async createAdminAccountFolders(e){let t=this.settings.accountsFolder||"Accounts";this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t),await this.ensurePipelineFolderExists();let i=0,r=0,s=new Date().toISOString().split("T")[0],o=async c=>{let d=c.name.replace(/[<>:"/\\|?*]/g,"_").trim(),p=`${t}/${d}`;if(this.app.vault.getAbstractFileByPath(p)instanceof u.TFolder)return!1;try{return await this.app.vault.createFolder(p),await this.createExecAccountSubnotes(p,c,s),c.isOwned?i++:r++,console.log(`[Eudia Admin] Created ${c.isOwned?"owned":"view-only"} folder: ${d}`),!0}catch(y){return console.error(`[Eudia Admin] Failed to create folder for ${d}:`,y),!1}},l=5;for(let c=0;c<e.length;c+=l){let d=e.slice(c,c+l);await Promise.allSettled(d.map(p=>o(p)))}this.settings.cachedAccounts=e.map(c=>({id:c.id,name:c.name})),await this.saveSettings(),i+r>0&&new u.Notice(`Created ${i} owned + ${r} view-only account folders`),await this.ensureNextStepsFolderExists()}async createExecAccountSubnotes(e,t,n){let i=t.ownerName||"Unknown",r=[{name:"Note 1.md",content:`---
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
owner: "${i}"
sync_to_salesforce: false
---

# ${t.name} - Meeting Notes

**Account Owner:** ${i}

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
`}];for(let s of r){let o=`${e}/${s.name}`;await this.app.vault.create(o,s.content)}}async createFullAccountSubnotes(e,t,n){let i=[{name:"Note 1.md",content:`---
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
`}];for(let r of i){let s=`${e}/${r.name}`;await this.app.vault.create(s,r.content)}}async ensurePipelineFolderExists(){let e="Pipeline",t=`${e}/Pipeline Review Notes.md`;if(this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e),!this.app.vault.getAbstractFileByPath(t)){let s=`---
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
`;await this.app.vault.create(t,s)}}async ensureNextStepsFolderExists(){let e="Next Steps",t=`${e}/All Next Steps.md`;if(this.app.vault.getAbstractFileByPath(e)||await this.app.vault.createFolder(e),!this.app.vault.getAbstractFileByPath(t)){let r=new Date().toISOString().split("T")[0],s=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
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
`;await this.app.vault.create(t,o)}}async updateAccountNextSteps(e,t,n){try{console.log(`[Eudia] updateAccountNextSteps called for: ${e}`),console.log(`[Eudia] Content length: ${t?.length||0} chars`);let i=e.replace(/[<>:"/\\|?*]/g,"_").trim(),r=`${this.settings.accountsFolder}/${i}/Next Steps.md`;console.log(`[Eudia] Looking for Next Steps file at: ${r}`);let s=this.app.vault.getAbstractFileByPath(r);if(!s||!(s instanceof u.TFile)){console.log(`[Eudia] \u274C Next Steps file NOT FOUND at: ${r}`);let f=this.app.vault.getAbstractFileByPath(`${this.settings.accountsFolder}/${i}`);f&&f instanceof u.TFolder?console.log(`[Eudia] Files in ${i} folder:`,f.children.map(C=>C.name)):console.log(`[Eudia] Account folder also not found: ${this.settings.accountsFolder}/${i}`);return}console.log("[Eudia] Found Next Steps file, updating...");let o=new Date().toISOString().split("T")[0],l=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),c=n.split("/").pop()?.replace(".md","")||"Meeting",d=t;!t.includes("- [ ]")&&!t.includes("- [x]")&&(d=t.split(`
`).filter(f=>f.trim()).map(f=>{let C=f.replace(/^[-•*]\s*/,"").trim();return C?`- [ ] ${C}`:""}).filter(Boolean).join(`
`));let p=await this.app.vault.read(s),g="",y=p.match(/## History\n\n\*Previous next steps are archived below\.\*\n\n([\s\S]*?)$/);y&&y[1]&&(g=y[1].trim());let m=`### ${o} - ${c}
${d||"*None*"}`,w=g?`${m}

---

${g}`:m,O=`---
account: "${e}"
account_id: "${this.settings.cachedAccounts.find(f=>f.name===e)?.id||""}"
type: next_steps
auto_updated: true
last_updated: ${o}
sync_to_salesforce: false
---

# ${e} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*Last updated: ${o} ${l} from ${c}*

${d||"*No next steps identified*"}

---

## History

*Previous next steps are archived below.*

${w}
`;await this.app.vault.modify(s,O),console.log(`[Eudia] Updated Next Steps for ${e} (history preserved)`),await this.regenerateNextStepsDashboard()}catch(i){console.error(`[Eudia] Failed to update Next Steps for ${e}:`,i)}}async regenerateNextStepsDashboard(){try{let t=this.app.vault.getAbstractFileByPath("Next Steps/All Next Steps.md");if(!t||!(t instanceof u.TFile)){await this.ensureNextStepsFolderExists();return}let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!n||!(n instanceof u.TFolder))return;let i=[];for(let l of n.children)if(l instanceof u.TFolder){let c=`${l.path}/Next Steps.md`,d=this.app.vault.getAbstractFileByPath(c);if(d instanceof u.TFile){let p=await this.app.vault.read(d),g=p.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/),y=g?g[1]:"Unknown",m=p.split(`
`).filter(w=>w.match(/^- \[[ x]\]/)).slice(0,5);(m.length>0||y!=="Unknown")&&i.push({account:l.name,lastUpdated:y,nextSteps:m})}}i.sort((l,c)=>c.lastUpdated.localeCompare(l.lastUpdated));let r=new Date().toISOString().split("T")[0],s=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),o=`---
type: next_steps_dashboard
auto_updated: true
last_updated: ${r}
---

# All Next Steps Dashboard

*Last updated: ${r} ${s}*

---

`;if(i.length===0)o+=`## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;else{for(let l of i)o+=`## ${l.account}

`,l.nextSteps.length>0?o+=l.nextSteps.join(`
`)+`
`:o+=`*No current next steps*
`,o+=`
*Updated: ${l.lastUpdated}*

---

`;o+=`## Summary

`,o+=`| Account | Last Updated | Open Items |
`,o+=`|---------|--------------|------------|
`;for(let l of i){let c=l.nextSteps.filter(d=>d.includes("- [ ]")).length;o+=`| ${l.account} | ${l.lastUpdated} | ${c} |
`}}await this.app.vault.modify(t,o),console.log("[Eudia] Regenerated All Next Steps dashboard")}catch(e){console.error("[Eudia] Failed to regenerate Next Steps dashboard:",e)}}async startRecording(){if(!W.isSupported()){new u.Notice("Audio transcription is not supported in this environment.");return}try{(await navigator.mediaDevices.getUserMedia({audio:!0})).getTracks().forEach(r=>r.stop())}catch(i){this.showPermissionGuide(i);return}let e=this.settings.audioCaptureMode||"full_call";try{let r=(await W.getAvailableDevices()).find(s=>W.isHeadphoneDevice(s.label));r&&e==="full_call"&&(e="mic_only",console.log(`[Eudia] Headphones detected (${r.label}) \u2014 using mic_only for this recording`),new u.Notice(`${r.label} detected \u2014 recording your voice only.
For both sides of the call, switch to laptop speakers.`,8e3))}catch{}if(!this.settings.audioSystemDeviceId)try{let i=await W.detectVirtualAudioDevice();i&&(this.settings.audioSystemDeviceId=i.deviceId,await this.saveSettings(),console.log(`[Eudia] Virtual audio device found: ${i.label}`))}catch{}let t=await this.showTemplatePicker();if(!t)return;this.settings.meetingTemplate=t;let n=this.app.workspace.getActiveFile();if(n||(await this.createMeetingNote(),n=this.app.workspace.getActiveFile()),!n){new u.Notice("Please open or create a note first");return}this.audioRecorder=new W,this.recordingStatusBar=new ae(()=>this.audioRecorder?.pause(),()=>this.audioRecorder?.resume(),()=>this.stopRecording(),()=>this.cancelRecording());try{this.audioRecorder.onEvent(l=>{switch(l.type){case"deviceChanged":l.activeDeviceLost?new u.Notice("Recording device disconnected. Recording continues on available mic.",8e3):new u.Notice("Audio device changed. Recording continues.",4e3),console.log("[Eudia Telemetry] device_change",l);break;case"headphoneDetected":(this.settings.audioCaptureMode||"full_call")==="full_call"&&new u.Notice(`Headphones detected (${l.deviceLabel}). Call audio cannot be captured through headphones \u2014 recording your voice only. For both sides, switch to laptop speakers.`,12e3),console.log("[Eudia Telemetry] headphone_detected",l.deviceLabel);break;case"silenceDetected":{let c=this.settings.audioCaptureMode||"full_call",d="Check that your microphone is working.";c==="full_call"&&(d="Ensure your call audio is playing through speakers, not headphones."),new u.Notice(`No audio detected for ${l.durationSeconds}s. ${d}`,1e4),console.log("[Eudia Telemetry] silence_detected",l.durationSeconds);break}case"audioRestored":new u.Notice("Audio signal restored.",3e3),console.log("[Eudia Telemetry] audio_restored");break}});let i=e,r={captureMode:i,micDeviceId:this.settings.audioMicDeviceId||void 0,systemAudioDeviceId:this.settings.audioSystemDeviceId||void 0};if(await this.audioRecorder.start(r),console.log("[Eudia Telemetry] recording_start",{captureMode:i,systemAudio:this.audioRecorder.getSystemAudioMethod()}),this.telemetry.reportRecordingStart({captureMode:i,systemAudioMethod:this.audioRecorder.getSystemAudioMethod(),hasMicPermission:!0}),i==="full_call"&&this.audioRecorder.getState().isRecording){let l=this.audioRecorder.getSystemAudioMethod();l==="electron"||l==="display_media"?new u.Notice("Recording \u2014 capturing both sides of the call.",5e3):l==="virtual_device"?new u.Notice("Recording (Full Call + Virtual Device) \u2014 both sides captured.",5e3):new u.Notice(`Recording (Mic only) \u2014 headphones block call audio capture.

Use laptop speakers, or try Settings > Audio Capture > Test System Audio.`,1e4)}else i==="mic_only"&&new u.Notice("Recording (Mic Only \u2014 your voice only)",3e3);this.recordingStatusBar.show(),this.micRibbonIcon?.addClass("eudia-ribbon-recording");try{let l=await this.calendarService.getCurrentMeeting();if(l.isNow&&l.meeting?.end){let c=new Date(l.meeting.end),d=new Date,p=c.getTime()-d.getTime();if(p>6e4&&p<54e5){let g=Math.round(p/6e4);new u.Notice(`Recording aligned to meeting \u2014 auto-stops in ${g} min`),setTimeout(async()=>{this.audioRecorder?.isRecording()&&(new u.Notice("Meeting ended \u2014 generating summary."),await this.stopRecording())},p)}}}catch(l){console.log("[Eudia] Could not detect meeting duration for auto-stop:",l)}let s=!1,o=setInterval(()=>{if(this.audioRecorder?.isRecording()){let l=this.audioRecorder.getState();if(this.recordingStatusBar?.updateState(l),l.duration>=2700&&!s){s=!0;let c=new class extends u.Modal{constructor(){super(...arguments);this.result=!0}onOpen(){let{contentEl:g}=this;g.createEl("h2",{text:"Still recording?"}),g.createEl("p",{text:"You have been recording for 45 minutes. Are you still in this meeting?"}),g.createEl("p",{text:"Recording will auto-stop at 90 minutes.",cls:"mod-warning"});let y=g.createDiv({cls:"modal-button-container"});y.createEl("button",{text:"Keep Recording",cls:"mod-cta"}).onclick=()=>{this.close()},y.createEl("button",{text:"Stop Recording"}).onclick=()=>{this.result=!1,this.close()}}onClose(){this.result||d.stopRecording()}}(this.app),d=this;c.open()}l.duration>=5400&&(new u.Notice("Recording stopped \u2014 maximum 90 minutes reached."),this.stopRecording(),clearInterval(o))}else clearInterval(o)},100);this.liveTranscript="",this.startLiveTranscription(),this.openLiveQuerySidebar()}catch(i){this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null;let r=i.message||"Failed to start recording";console.error("[Eudia Telemetry] recording_start_error",r),r.includes("Permission")||r.includes("NotAllowed")||r.includes("permission")?this.showPermissionGuide(i):new u.Notice(`Recording failed: ${r}`,1e4)}}showPermissionGuide(e){new class extends u.Modal{onOpen(){let{contentEl:n}=this;n.empty(),n.createEl("h2",{text:"Microphone Access Required"}),n.createEl("p",{text:"Obsidian needs microphone permission to transcribe meetings."});let i=n.createDiv();i.style.cssText="margin:16px 0;padding:12px;background:var(--background-secondary);border-radius:8px;",i.createEl("p",{text:"1. Open System Settings \u2192 Privacy & Security \u2192 Microphone"}),i.createEl("p",{text:"2. Find Obsidian in the list and toggle it ON"}),i.createEl("p",{text:"3. You may need to restart Obsidian after granting access"});let r=n.createDiv({cls:"modal-button-container"});r.style.cssText="display:flex;gap:8px;margin-top:16px;";let s=r.createEl("button",{text:"Open System Settings",cls:"mod-cta"});s.onclick=()=>{try{let o=window.require?.("electron");o?.shell?.openExternal?o.shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"):window.open("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")}catch{window.open("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")}},r.createEl("button",{text:"Close"}).onclick=()=>this.close()}}(this.app).open()}async stopRecording(){if(!this.audioRecorder?.isRecording())return;let e=this.app.workspace.getActiveFile();if(!e){new u.Notice("No active file to save transcription"),this.cancelRecording();return}this.recordingStatusBar?.showProcessing();try{let t=await this.audioRecorder.stop(),n={hasAudio:!0,averageLevel:0,silentPercent:0};try{let i=await W.analyzeAudioBlob(t.audioBlob);if(n=i,!i.hasAudio){let r;t.systemAudioMethod==="electron"||t.systemAudioMethod==="display_media"?r="System audio capture was active but no sound was detected. Check that the call app is playing audio.":t.captureMode==="full_call"?r="Make sure your call audio is playing through laptop speakers (not headphones).":r="Check that your microphone is working and has permission.",new u.Notice(`Recording appears silent. ${r} Open Settings > Audio Capture to test your setup.`,12e3)}}catch(i){console.warn("[Eudia] Pre-transcription audio check failed:",i)}this.telemetry.reportRecordingStop({durationSec:t.duration,blobSizeMB:Math.round(t.audioBlob.size/1024/1024*100)/100,avgAudioLevel:n.averageLevel,silentPercent:n.silentPercent,hasAudio:n.hasAudio,captureMode:t.captureMode,systemAudioMethod:t.systemAudioMethod}),await this.processRecording(t,e)}catch(t){new u.Notice(`Transcription failed: ${t.message}`)}finally{this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.closeLiveQuerySidebar(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null}}showTemplatePicker(){return new Promise(e=>{new class extends u.Modal{constructor(){super(...arguments);this.result=null}onOpen(){let{contentEl:i}=this;i.empty(),i.createEl("h3",{text:"Meeting Type"}),i.createEl("p",{text:"Select the template for this recording:",cls:"setting-item-description"});let r=i.createDiv();r.style.cssText="display:flex;flex-direction:column;gap:8px;margin-top:12px;";let s=[{key:"meddic",label:"Sales Discovery (MEDDIC)",desc:"Pain points, decision process, metrics, champions, budget signals"},{key:"demo",label:"Demo / Presentation",desc:"Feature reactions, questions, objections, interest signals"},{key:"cs",label:"Customer Success",desc:"Health signals, feature requests, adoption, renewal/expansion"},{key:"general",label:"General Check-In",desc:"Relationship updates, action items, sentiment"},{key:"internal",label:"Internal Call",desc:"Team sync, pipeline review, strategy discussion"}];for(let o of s){let l=r.createEl("button",{text:o.label});l.style.cssText="padding:10px 16px;text-align:left;cursor:pointer;border-radius:6px;border:1px solid var(--background-modifier-border);";let c=r.createEl("div",{text:o.desc});c.style.cssText="font-size:11px;color:var(--text-muted);margin-top:-4px;margin-bottom:4px;padding-left:4px;",l.onclick=()=>{this.result=o.key,this.close()}}}onClose(){e(this.result)}}(this.app).open()})}async cancelRecording(){this.audioRecorder?.isRecording()&&this.audioRecorder.cancel(),this.micRibbonIcon?.removeClass("eudia-ribbon-recording"),this.stopLiveTranscription(),this.closeLiveQuerySidebar(),this.recordingStatusBar?.hide(),this.recordingStatusBar=null,this.audioRecorder=null,new u.Notice("Transcription cancelled")}startLiveTranscription(){this.stopLiveTranscription();let e=12e4;this.liveTranscriptChunkInterval=setInterval(async()=>{await this.transcribeCurrentChunk()},e),setTimeout(async()=>{this.audioRecorder?.isRecording()&&await this.transcribeCurrentChunk()},3e4),console.log("[Eudia] Live transcription started")}stopLiveTranscription(){this.liveTranscriptChunkInterval&&(clearInterval(this.liveTranscriptChunkInterval),this.liveTranscriptChunkInterval=null),console.log("[Eudia] Live transcription stopped")}async transcribeCurrentChunk(){if(!this.audioRecorder?.isRecording()||this.isTranscribingChunk)return;let e=this.audioRecorder.extractNewChunks();if(!(!e||e.size<5e3)){this.isTranscribingChunk=!0,console.log(`[Eudia] Transcribing chunk: ${e.size} bytes`);try{let t=new FileReader,i=await new Promise((o,l)=>{t.onload=()=>{let d=t.result.split(",")[1];o(d)},t.onerror=l,t.readAsDataURL(e)}),r=this.audioRecorder.getMimeType(),s=await this.transcriptionService.transcribeChunk(i,r);s.success&&s.text&&(this.liveTranscript+=(this.liveTranscript?`

`:"")+s.text,console.log(`[Eudia] Chunk transcribed, total transcript length: ${this.liveTranscript.length}`))}catch(t){console.error("[Eudia] Chunk transcription error:",t)}finally{this.isTranscribingChunk=!1}}}openLiveQueryModal(){let e=new u.Modal(this.app);e.titleEl.setText("Query Live Transcript");let t=e.contentEl;t.addClass("eudia-live-query-modal"),t.createDiv({cls:"eudia-live-query-instructions"}).setText(`Ask a question about what has been discussed so far (${Math.round(this.liveTranscript.length/4)} words captured):`);let i=t.createEl("textarea",{cls:"eudia-live-query-input",attr:{placeholder:'e.g., "What did Tom say about pricing?" or "What were the main concerns raised?"',rows:"3"}}),r=t.createDiv({cls:"eudia-live-query-response"});r.style.display="none";let s=t.createEl("button",{text:"Ask",cls:"eudia-btn-primary"});s.addEventListener("click",async()=>{let o=i.value.trim();if(!o){new u.Notice("Please enter a question");return}s.disabled=!0,s.setText("Searching..."),r.style.display="block",r.setText("Searching transcript..."),r.addClass("eudia-loading");try{let l=await this.transcriptionService.liveQueryTranscript(o,this.liveTranscript,this.getAccountNameFromActiveFile());r.removeClass("eudia-loading"),l.success?r.setText(l.answer):(r.setText(l.error||"Failed to query transcript"),r.addClass("eudia-error"))}catch(l){r.removeClass("eudia-loading"),r.setText(`Error: ${l.message}`),r.addClass("eudia-error")}finally{s.disabled=!1,s.setText("Ask")}}),i.addEventListener("keydown",o=>{o.key==="Enter"&&!o.shiftKey&&(o.preventDefault(),s.click())}),e.open(),i.focus()}getAccountNameFromActiveFile(){let e=this.app.workspace.getActiveFile();if(!e)return;let t=e.path.match(/Accounts\/([^\/]+)\//i);if(t)return t[1]}async processRecording(e,t){let n=e.audioBlob?.size||0;if(console.log(`[Eudia] Audio blob size: ${n} bytes, duration: ${e.duration}s`),n<1e3){new u.Notice("Recording too short or no audio captured. Please try again.");return}try{let h=await W.analyzeAudioBlob(e.audioBlob);console.log(`[Eudia] Audio diagnostic: hasAudio=${h.hasAudio}, peak=${h.peakLevel}, silent=${h.silentPercent}%`),h.warning&&(console.warn(`[Eudia] Audio warning: ${h.warning}`),h.hasAudio?new u.Notice(`Warning: ${h.warning.split(":")[0]}`,5e3):new u.Notice("Warning: Audio appears to be silent. Transcription may not work correctly. Check your microphone settings.",8e3))}catch(h){console.warn("[Eudia] Audio diagnostic failed, continuing anyway:",h)}let i=new Date().toISOString().replace(/[:.]/g,"-").slice(0,19),r=e.audioBlob.type?.includes("mp4")?"mp4":"webm",s=await e.audioBlob.arrayBuffer(),o=n/1024/1024,l=this.settings.recordingsFolder||"Recordings",c="_backups",d=`${l}/recording-${i}.${r}`,p=`${c}/recording-${i}.${r}`,g=!1,y=!1;for(let h of[l,c])if(!this.app.vault.getAbstractFileByPath(h))try{await this.app.vault.createFolder(h)}catch{}for(let h=0;h<3;h++)try{await this.app.vault.createBinary(d,s),g=!0,console.log(`[Eudia] Audio saved: ${d} (${o.toFixed(1)}MB)`);break}catch(S){console.warn(`[Eudia] Primary save attempt ${h+1}/3 failed: ${S.message}`),h<2&&await new Promise(x=>setTimeout(x,5e3))}try{await this.app.vault.createBinary(p,s),y=!0,console.log(`[Eudia] Backup audio saved: ${p}`)}catch(h){console.warn(`[Eudia] Backup save failed: ${h.message}`)}if(g||y){let h=g?d:p;e._savedAudioPath=h,new u.Notice(`Audio saved to ${h}`);try{let S=await this.app.vault.read(t),x=S.indexOf("---",S.indexOf("---")+3);if(x>0){let E=S.substring(0,x);if(!E.includes("recording_path:")){let k=E+`recording_path: "${h}"
`;await this.app.vault.modify(t,k+S.substring(x))}}}catch(S){console.warn("[Eudia] Failed to write recording_path to frontmatter:",S.message)}}else console.error("[Eudia] CRITICAL: All audio save attempts failed \u2014 recording may be lost"),new u.Notice("WARNING: Could not save recording to disk. Audio exists only in memory for this transcription attempt.",15e3),this.telemetry.reportSafetyNetFailure({blobSizeMB:Math.round(o*100)/100,error:"Both primary and backup save failed",retryAttempt:3});let m=e.duration||0,O=Math.max(1,Math.ceil(m/600))*30+30,f=O<60?`~${O} seconds`:`~${Math.ceil(O/60)} minute${Math.ceil(O/60)>1?"s":""}`;new u.Notice(`Processing ${Math.ceil(m/60)} min recording. Should take ${f}.`);let C=await this.app.vault.read(t),v=`

---
**Processing your recording...**
Started: ${new Date().toLocaleTimeString()}
Estimated: ${f}

*You can navigate away \u2014 the summary will appear here when ready.*
---
`;await this.app.vault.modify(t,C+v),this.processTranscriptionAsync(e,t).catch(h=>{console.error("Background transcription failed:",h),new u.Notice(`Transcription failed: ${h.message}`)})}async processTranscriptionAsync(e,t){try{let n={},i=t.path.split("/");console.log(`[Eudia] Processing transcription for: ${t.path}`),console.log(`[Eudia] Path parts: ${JSON.stringify(i)}, accountsFolder: ${this.settings.accountsFolder}`);let r=i[0]==="Pipeline Meetings",s=!1;try{let h=(await this.app.vault.read(t)).match(/^---\n([\s\S]*?)\n---/);h&&(s=/meeting_type:\s*pipeline_review/.test(h[1]))}catch{}if(!s&&r&&(s=!0),s){console.log("[Eudia Pipeline] Detected pipeline review meeting, using pipeline prompt");let v="";try{let h=await(0,u.requestUrl)({url:`${this.settings.serverUrl||"https://gtm-brain.onrender.com"}/api/pipeline-context`,method:"GET",headers:{"Content-Type":"application/json"}});h.json?.success&&h.json?.context&&(v=h.json.context,console.log(`[Eudia Pipeline] Loaded Salesforce pipeline context (${v.length} chars)`))}catch(h){console.warn("[Eudia Pipeline] Could not fetch pipeline context:",h)}n={meetingType:"pipeline_review",pipelineContext:v}}else if(i.length>=2&&i[0]===this.settings.accountsFolder){let v=i[1];console.log(`[Eudia] Detected account folder: ${v}`);let h=this.settings.cachedAccounts.find(S=>S.name.toLowerCase()===v.toLowerCase());h?(n={accountName:h.name,accountId:h.id,userEmail:this.settings.userEmail},console.log(`[Eudia] Found cached account: ${h.name} (${h.id})`)):(n={accountName:v,accountId:"",userEmail:this.settings.userEmail},console.log(`[Eudia] Account not in cache, using folder name: ${v}`))}else console.log("[Eudia] File not in Accounts folder, skipping account context");let o=[];try{let v=await this.calendarService.getCurrentMeeting();v.meeting?.attendees&&(o=v.meeting.attendees.map(h=>h.name||h.email.split("@")[0]).filter(Boolean).slice(0,10))}catch{}let l=Date.now(),c=await this.transcriptionService.transcribeAudio(e.audioBlob,{...n,speakerHints:o,captureMode:e.captureMode,hasVirtualDevice:e.hasVirtualDevice,meetingTemplate:this.settings.meetingTemplate||"meddic"}),d=Math.round(e.audioBlob.size/1024/1024*100)/100,p=d>15;this.telemetry.reportTranscriptionResult({success:!!c.text?.trim(),isChunked:p,totalSizeMB:d,transcriptLength:c.text?.length||0,processingTimeSec:Math.round((Date.now()-l)/1e3),error:c.error});let g=v=>v?!!(v.summary?.trim()||v.nextSteps?.trim()):!1,y=c.sections;if(g(y)||c.text?.trim()&&(y=await this.transcriptionService.processTranscription(c.text,n)),!g(y)&&!c.text?.trim()){let h=(await this.app.vault.read(t)).replace(/\n\n---\n\*\*Processing your recording\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,"").replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,""),S=c.error,E=!S||S.includes("audio")||S.includes("microphone")?"No audio detected. Check your microphone settings.":S,k=e._savedAudioPath,j=k?`
Your recording was saved to **${k}** \u2014 you can retry transcription from there.`:"";await this.app.vault.modify(t,h+`

**Transcription failed:** ${E}${j}
`),new u.Notice(`Transcription failed: ${E}`,1e4);return}let m=await this.app.vault.read(t),w="",O=Math.max(m.indexOf(`---
**Processing your recording`),m.indexOf(`---
**Transcription in progress`));if(O>0){let v=m.indexOf("---"),h=v>=0?m.indexOf("---",v+3):-1;h>0&&h+3<O&&(w=m.substring(h+3,O).trim())}else{let v=m.indexOf("---"),h=v>=0?m.indexOf("---",v+3):-1;if(h>0){let S=m.substring(h+3).trim();S.replace(/^#.*$/gm,"").replace(/Date:\s*\nAttendees:\s*/g,"").replace(/Add meeting notes here\.\.\./g,"").replace(/---/g,"").trim().length>10&&(w=S)}}try{let v="_backups";this.app.vault.getAbstractFileByPath(v)||await this.app.vault.createFolder(v);let h=new Date().toISOString().replace(/[:.]/g,"-").substring(0,19),S=`${v}/${t.name}_${h}.md`;await this.app.vault.create(S,m),console.log(`[Eudia] Backed up note to ${S}`)}catch(v){console.warn("[Eudia] Backup failed (non-critical):",v.message)}let f;if(s?f=this.buildPipelineNoteContent(y,c,t.path):f=this.buildNoteContent(y,c),w&&w.length>5){let v=f.indexOf("---",f.indexOf("---")+3);if(v>0){let h=f.substring(0,v+3),S=f.substring(v+3);f=h+`

## My Notes (captured during call)

`+w+`

---
`+S}}await this.app.vault.modify(t,f);let C=Math.floor(e.duration/60);if(new u.Notice(`Transcription complete (${C} min recording)`),!s){let v=y.nextSteps||y.actionItems;console.log(`[Eudia] Next Steps extraction - accountContext: ${n?.accountName||"undefined"}`),console.log(`[Eudia] Next Steps content found: ${v?"YES ("+v.length+" chars)":"NO"}`),console.log(`[Eudia] sections.nextSteps: ${y.nextSteps?"YES":"NO"}, sections.actionItems: ${y.actionItems?"YES":"NO"}`),v&&n?.accountName?(console.log(`[Eudia] Calling updateAccountNextSteps for ${n.accountName}`),await this.updateAccountNextSteps(n.accountName,v,t.path)):console.log("[Eudia] Skipping Next Steps update - missing content or account context")}this.settings.autoSyncAfterTranscription&&await this.syncNoteToSalesforce()}catch(n){try{let r=(await this.app.vault.read(t)).replace(/\n\n---\n\*\*Processing your recording\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,"").replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away[^*]*\*\n---\n/g,""),s=e?._savedAudioPath,o=s?`
Your recording was saved to **${s}** \u2014 you can retry transcription from there.`:"";await this.app.vault.modify(t,r+`

**Transcription failed:** ${n.message}${o}
`)}catch{}throw n}}buildPipelineNoteContent(e,t,n){let i=new Date,r=String(i.getMonth()+1).padStart(2,"0"),s=String(i.getDate()).padStart(2,"0"),o=String(i.getFullYear()).slice(-2),l=i.toISOString().split("T")[0],c=`${r}.${s}.${o}`,d=m=>m==null?"":Array.isArray(m)?m.map(String).join(`
`):typeof m=="object"?JSON.stringify(m,null,2):String(m),p=d(e.summary),g=t.transcript||t.text||"",y=`---
title: "Team Pipeline Meeting - ${c}"
date: ${l}
meeting_type: pipeline_review
transcribed: true
---

# Weekly Pipeline Review | ${i.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"})}

`;if(p)y+=p;else{let m=[e.painPoints,e.productInterest,e.nextSteps,e.actionItems].filter(Boolean).map(d).join(`

`);m?y+=m:y+="*Pipeline summary could not be generated. See transcript below.*"}return g&&(y+=`

---

<details>
<summary><strong>Full Transcript</strong> (${Math.ceil(g.length/1e3)}k chars)</summary>

${g}

</details>
`),y}buildNoteContent(e,t){let n=S=>S==null?"":Array.isArray(S)?S.map(x=>typeof x=="object"?x.category?`**${x.category}**: ${x.signal||x.insight||""}`:JSON.stringify(x):String(x)).join(`
`):typeof S=="object"?JSON.stringify(S):String(S),i=n(e.title)||"Meeting Notes",r=n(e.summary),s=n(e.discussionContext),o=n(e.keyQuotes),l=n(e.painPoints),c=n(e.productInterest),d=n(e.meddiccSignals),p=n(e.nextSteps),g=n(e.actionItems),y=n(e.keyDates),m=n(e.dealSignals),w=n(e.risksObjections),O=n(e.attendees||e.keyStakeholders),f=n(e.emailDraft),C=`---
title: "${i}"
date: ${new Date().toISOString().split("T")[0]}
transcribed: true
sync_to_salesforce: false
clo_meeting: false
source: ""
confidence: ${t.confidence}
---

# ${i}

## Summary

${r||"*AI summary will appear here*"}

`;s&&!s.includes("Not discussed")&&(C+=`## Discussion Context

${s}

`),o&&!o.includes("No significant quotes")&&!o.includes("Not discussed")&&(C+=`## Key Quotes

${o}

`),l&&!l.includes("None explicitly")&&!l.includes("Not discussed")&&(C+=`## Pain Points

${l}

`),c&&!c.includes("None identified")&&!c.includes("No specific products")&&(C+=`## Product Interest

${c}

`),d&&(C+=`## MEDDICC Signals

${d}

`),p&&(C+=`## Next Steps

${p}

`),g&&(C+=`## Action Items

${g}

`),y&&!y.includes("No specific dates")&&!y.includes("Not discussed")&&(C+=`## Key Dates

${y}

`),m&&!m.includes("No significant deal signals")&&!m.includes("Not discussed")&&(C+=`## Deal Signals

${m}

`),w&&!w.includes("None raised")&&!w.includes("No objections")&&!w.includes("Not discussed")&&(C+=`## Risks and Objections

${w}

`),O&&(C+=`## Attendees

${O}

`),f&&(C+=`---

## Draft Follow-Up Email

${f}

> *Edit this draft to match your voice, then send.*

`);let v=t.text||t.transcript||"",h=t.diarizedTranscript||"";return this.settings.appendTranscript&&(h||v)&&(C+=`---

## ${h?"Full Transcript (Speaker-Labeled)":"Full Transcript"}

${h||v}
`),C}openIntelligenceQuery(){new K(this.app,this).open()}openIntelligenceQueryForCurrentNote(){let e=this.app.workspace.getActiveFile(),t;if(e){let n=this.app.metadataCache.getFileCache(e)?.frontmatter;if(n?.account_id&&n?.account)t={id:n.account_id,name:n.account};else if(n?.account){let i=this.settings.cachedAccounts.find(r=>r.name.toLowerCase()===n.account.toLowerCase());i?t={id:i.id,name:i.name}:t={id:"",name:n.account}}else{let i=e.path.split("/");if(i.length>=2&&i[0]===this.settings.accountsFolder){let r=i[1],s=this.settings.cachedAccounts.find(o=>o.name.replace(/[<>:"/\\|?*]/g,"_").trim()===r);s?t={id:s.id,name:s.name}:t={id:"",name:r}}}}new K(this.app,this,t).open()}async syncAccounts(e=!1){e||new u.Notice("Syncing Salesforce accounts...");try{let n=(await(0,u.requestUrl)({url:`${this.settings.serverUrl}/api/accounts/obsidian`,method:"GET",headers:{Accept:"application/json"}})).json;if(!n.success||!n.accounts){e||new u.Notice("Failed to fetch accounts from server");return}this.settings.cachedAccounts=n.accounts.map(i=>({id:i.id,name:i.name})),this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings(),e||new u.Notice(`Synced ${n.accounts.length} accounts for matching`)}catch(t){e||new u.Notice(`Failed to sync accounts: ${t.message}`)}}async scanLocalAccountFolders(){try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!e||!(e instanceof u.TFolder))return;let t=[];for(let n of e.children)n instanceof u.TFolder&&t.push({id:`local-${n.name.replace(/\s+/g,"-").toLowerCase()}`,name:n.name});this.settings.cachedAccounts=t,this.settings.lastSyncTime=new Date().toISOString(),await this.saveSettings()}catch(e){console.error("Failed to scan local account folders:",e)}}async refreshAccountFolders(){if(!this.settings.userEmail)throw new Error("Please configure your email first");let e=new H(this.settings.serverUrl);if((await e.getAccountsForUser(this.settings.userEmail)).length===0)return console.log("[Eudia] No accounts found for user"),0;let n=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),i=[];if(n&&n instanceof u.TFolder)for(let o of n.children)o instanceof u.TFolder&&i.push(o.name);let r=await e.getNewAccounts(this.settings.userEmail,i);if(r.length===0)return console.log("[Eudia] All account folders exist"),0;console.log(`[Eudia] Creating ${r.length} new account folders`);let s=await this.fetchEnrichmentData(r);return await this.createTailoredAccountFolders(r,s),r.length}async checkAndConsumeSyncFlags(){if(!this.settings.userEmail)return;let e=encodeURIComponent(this.settings.userEmail.toLowerCase().trim()),t=this.settings.serverUrl||"https://gtm-wizard.onrender.com";try{let r=((await(0,u.requestUrl)({url:`${t}/api/admin/users/${e}/sync-flags`,method:"GET"})).json?.flags||[]).filter(o=>!o.consumed_at);if(r.length===0)return;console.log(`[Eudia] Found ${r.length} pending sync flag(s)`);let s=!1;for(let o of r)if(o.flag==="resync_accounts"){s=!0;let l=o.payload||{},c=l.added?.length||0,d=l.removed?.length||0;console.log(`[Eudia] Sync flag: resync_accounts (+${c} / -${d})`)}else o.flag==="update_plugin"?new u.Notice("A plugin update is available. Please download the latest vault."):o.flag==="reset_setup"&&(console.log("[Eudia] Sync flag: reset_setup received"),this.settings.setupCompleted=!1,await this.saveSettings(),new u.Notice("Setup has been reset by admin. Please re-run the setup wizard."));if(s){console.log("[Eudia] Triggering account folder resync from sync flag..."),new u.Notice("Syncing account updates...");let o=await this.syncAccountFolders();o.success?new u.Notice(`Account sync complete: ${o.added} new, ${o.archived} archived`):console.log(`[Eudia] Account resync error: ${o.error}`)}try{await(0,u.requestUrl)({url:`${t}/api/admin/users/${e}/sync-flags/consume`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({flagIds:r.map(o=>o.id)})}),console.log(`[Eudia] Consumed ${r.length} sync flag(s)`)}catch{console.log("[Eudia] Failed to consume sync flags (will retry next startup)")}}catch{console.log("[Eudia] Sync flag check skipped (endpoint not available)")}}async syncAccountFolders(){if(!this.settings.userEmail)return{success:!1,added:0,archived:0,error:"No email configured"};let e=this.settings.userEmail.toLowerCase().trim();console.log(`[Eudia] Syncing account folders for: ${e}`);try{let t=await fetch(`${this.settings.serverUrl}/api/bl-accounts/${encodeURIComponent(e)}`);if(!t.ok){let A=await t.json().catch(()=>({}));throw new Error(A.error||`Server returned ${t.status}`)}let n=await t.json();if(!n.success||!n.accounts)throw new Error(n.error||"Invalid response from server");let i=n.meta?.userGroup||"bl",r=n.meta?.queryDescription||"accounts",s=n.meta?.region||null;console.log(`[Eudia] User group: ${i}, accounts: ${n.accounts.length} (${r})`),s&&console.log(`[Eudia] Sales Leader region: ${s}`);let o=n.accounts||[],l=n.prospectAccounts||[],c=o.length+l.length;console.log(`[Eudia] Server returned: ${o.length} active + ${l.length} prospects = ${c} total`);let d=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder),p=new Map,g=`${this.settings.accountsFolder}/_Prospects`,y=this.app.vault.getAbstractFileByPath(g),m=new Map,w=new Map;if(d&&d instanceof u.TFolder)for(let A of d.children)A instanceof u.TFolder&&!A.name.startsWith("_")&&p.set(A.name.toLowerCase().trim(),A);if(y&&y instanceof u.TFolder)for(let A of y.children)A instanceof u.TFolder?m.set(A.name.toLowerCase().trim(),A):A instanceof u.TFile&&A.extension==="md"&&w.set(A.basename.toLowerCase().trim(),A);let O=new Set(o.map(A=>A.name.toLowerCase().trim())),f=o.filter(A=>{let I=A.name.toLowerCase().trim();return!p.has(I)}),C=l.filter(A=>{let I=A.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();return!m.has(I)&&!w.has(I)&&!p.has(A.name.toLowerCase().trim())}),v=[];for(let A of o){let I=A.name.replace(/[<>:"/\\|?*]/g,"_").trim().toLowerCase();(m.has(I)||w.has(I))&&!p.has(A.name.toLowerCase().trim())&&v.push(A)}let h=new Set([...o.map(A=>A.name.toLowerCase().trim()),...l.map(A=>A.name.toLowerCase().trim())]),S=[];if(i==="bl")for(let[A,I]of p.entries())h.has(A)||S.push(I);let x=0,E=0,k=0,j=0;if(v.length>0){console.log(`[Eudia] Promoting ${v.length} accounts from prospect to active`);for(let A of v){let I=A.name.replace(/[<>:"/\\|?*]/g,"_").trim(),T=m.get(I.toLowerCase()),$=w.get(I.toLowerCase());try{if(T){let R=`${this.settings.accountsFolder}/${I}`;await this.app.vault.rename(T,R),k++,new u.Notice(`${A.name} promoted to active`)}else if($){await this.app.vault.delete($);let R=[{id:A.id,name:A.name,type:A.customerType,isOwned:!0,hadOpportunity:!0}],ve=await this.fetchEnrichmentData(R);await this.createTailoredAccountFolders(R,ve),k++,new u.Notice(`${A.name} promoted to active -- full account folder created`)}}catch(R){console.error(`[Eudia] Failed to promote ${A.name}:`,R)}}}if(f.length>0){console.log(`[Eudia] Creating ${f.length} new active account folders for ${i}`);let A=new Set(v.map(T=>T.name.toLowerCase().trim())),I=f.filter(T=>!A.has(T.name.toLowerCase().trim()));if(I.length>0){let T=I.map($=>({id:$.id,name:$.name,type:$.customerType,isOwned:i==="bl",ownerName:$.ownerName,hadOpportunity:!0}));if(i==="admin"||i==="exec")await this.createAdminAccountFolders(T);else{let $=await this.fetchEnrichmentData(T);await this.createTailoredAccountFolders(T,$)}x=I.length}this.telemetry&&this.telemetry.reportInfo("Accounts synced - added",{count:x,userGroup:i,region:s||void 0})}return C.length>0&&i==="bl"&&(console.log(`[Eudia] Creating ${C.length} new prospect files`),j=await this.createProspectAccountFiles(C.map(A=>({id:A.id,name:A.name,type:"Prospect",hadOpportunity:!1,website:A.website,industry:A.industry})))),this.settings.archiveRemovedAccounts&&S.length>0&&(console.log(`[Eudia] Archiving ${S.length} removed account folders`),E=await this.archiveAccountFolders(S),this.telemetry&&this.telemetry.reportInfo("Accounts synced - archived",{count:E})),console.log(`[Eudia] Sync complete: ${x} active added, ${j} prospects added, ${k} promoted, ${E} archived (group: ${i})`),{success:!0,added:x+j+k,archived:E,userGroup:i}}catch(t){return console.error("[Eudia] Account sync error:",t),this.telemetry&&this.telemetry.reportError("Account sync failed",{error:t.message}),{success:!1,added:0,archived:0,error:t.message}}}async archiveAccountFolders(e){let t=0,n=`${this.settings.accountsFolder}/_Archived`;this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n);for(let r of e)try{let s=`${n}/${r.name}`;if(this.app.vault.getAbstractFileByPath(s)){let d=new Date().toISOString().split("T")[0];await this.app.fileManager.renameFile(r,`${n}/${r.name}_${d}`)}else await this.app.fileManager.renameFile(r,s);let l=`${n}/${r.name}/_archived.md`,c=`---
archived_date: ${new Date().toISOString()}
reason: Account no longer in book of business
---

This account folder was archived because it no longer appears in your Salesforce book of business.

To restore, move this folder back to the Accounts directory.
`;try{await this.app.vault.create(l,c)}catch{}t++,console.log(`[Eudia] Archived: ${r.name}`)}catch(s){console.error(`[Eudia] Failed to archive ${r.name}:`,s)}return t}async syncSpecificNoteToSalesforce(e){let t=await this.app.vault.read(e),n=this.app.metadataCache.getFileCache(e)?.frontmatter;if(!n?.sync_to_salesforce)return{success:!1,error:"sync_to_salesforce not enabled"};let i=n.account_id,r=n.account;if(!i&&r){let s=this.settings.cachedAccounts.find(o=>o.name.toLowerCase()===r.toLowerCase());s&&(i=s.id)}if(!i){let s=e.path.split("/");if(s.length>=2&&s[0]===this.settings.accountsFolder){let o=s[1]==="_Prospects"&&s.length>=3?s[2]:s[1],l=this.settings.cachedAccounts.find(c=>c.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);l&&(i=l.id,r=l.name)}}if(!i)return{success:!1,error:`Could not determine account for ${e.path}`};try{let s=await(0,u.requestUrl)({url:`${this.settings.serverUrl}/api/notes/sync`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountId:i,accountName:r,noteTitle:e.basename,notePath:e.path,content:t,frontmatter:n,syncedAt:new Date().toISOString(),userEmail:this.settings.userEmail})});return s.json?.success?{success:!0}:{success:!1,error:s.json?.error||"Unknown error",authRequired:s.json?.authRequired}}catch(s){return{success:!1,error:s.message}}}async copyForSlack(){let e=this.app.workspace.getActiveFile();if(!e){new u.Notice("No note open to copy");return}try{let t=await this.app.vault.read(e),i=t.match(/^account:\s*"?([^"\n]+)"?/m)?.[1]||e.parent?.name||"Meeting",s=t.match(/^last_updated:\s*(\S+)/m)?.[1]||new Date().toISOString().split("T")[0],o="",l=t.match(/## Summary\n([\s\S]*?)(?=\n## |\n---|\Z)/);l&&(o=l[1].trim().split(`
`).filter(w=>w.startsWith("-")||w.startsWith("\u2022")).slice(0,3).map(w=>w.replace(/^[-•]\s*/,"").trim()).join(`
`));let c="",d=t.match(/## Next Steps\n([\s\S]*?)(?=\n## |\n---|\Z)/);d&&(c=d[1].trim().split(`
`).filter(w=>w.startsWith("-")||w.startsWith("\u2022")).slice(0,3).map(w=>w.replace(/^[-•\s[\]x]*/,"").trim()).join(`
\u2022 `));let p="",g=t.match(/"([^"]{20,120})"/);g&&(p=g[1]);let y=`*${i} \u2014 ${s}*
`;o&&(y+=`${o}
`),c&&(y+=`
*Next Steps:*
\u2022 ${c}
`),p&&(y+=`
> _"${p}"_
`),await navigator.clipboard.writeText(y),new u.Notice("Copied for Slack \u2713",3e3)}catch(t){new u.Notice("Failed to copy: "+(t.message||""))}}async syncNoteToSalesforce(){let e=this.app.workspace.getActiveFile();if(!e){new u.Notice("No active file to sync");return}if(!this.app.metadataCache.getFileCache(e)?.frontmatter?.sync_to_salesforce){new u.Notice("Set sync_to_salesforce: true in frontmatter to enable sync");return}new u.Notice("Syncing to Salesforce...");let n=await this.syncSpecificNoteToSalesforce(e);n.success?new u.Notice("Synced to Salesforce"):n.authRequired?new u.Notice("Salesforce authentication required. Please reconnect."):new u.Notice("Failed to sync: "+(n.error||"Unknown error"))}async checkAndAutoEnrich(){let e=this.settings.accountsFolder||"Accounts",t=this.app.vault.getAbstractFileByPath(e);if(!t||!(t instanceof u.TFolder))return;let n=[];for(let i of t.children){if(!(i instanceof u.TFolder)||i.name.startsWith("_"))continue;let r=`${i.path}/Contacts.md`,s=this.app.vault.getAbstractFileByPath(r);if(!(!s||!(s instanceof u.TFile))){if(this.app.metadataCache.getFileCache(s)?.frontmatter?.enriched_at)continue}let o=i.name,l=this.settings.cachedAccounts.find(c=>c.name.replace(/[<>:"/\\|?*]/g,"_").trim()===o);l&&l.id&&n.push({id:l.id,name:l.name,owner:"",ownerEmail:""})}if(n.length===0){console.log("[Eudia] Auto-enrich: all account folders already enriched");return}console.log(`[Eudia] Auto-enrich: ${n.length} accounts need enrichment`);try{await this.enrichAccountFolders(n)}catch(i){console.error("[Eudia] Auto-enrich failed:",i)}}async enrichAccountFolders(e){if(!e||e.length===0)return;let t=this.settings.serverUrl||"https://gtm-wizard.onrender.com",n=this.settings.accountsFolder||"Accounts",i=e.filter(d=>d.id&&d.id.startsWith("001"));if(i.length===0)return;let r=i.length,s=0,o=0;console.log(`[Eudia Enrich] Starting enrichment for ${r} accounts`),new u.Notice(`Enriching account data: 0/${r}...`);let l=20;for(let d=0;d<i.length;d+=l){let p=i.slice(d,d+l),g=p.map(m=>m.id);try{let m=await(0,u.requestUrl)({url:`${t}/api/accounts/enrich-batch`,method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accountIds:g,userEmail:this.settings.userEmail})});if(m.json?.success&&m.json?.enrichments){let w=m.json.enrichments;for(let O of p){let f=w[O.id];if(f)try{await this.writeEnrichmentToAccount(O,f,n),s++}catch(C){o++,console.error(`[Eudia Enrich] Write failed for ${O.name}:`,C)}}}}catch(m){o+=p.length,console.error("[Eudia Enrich] Batch fetch failed:",m)}let y=Math.min(d+l,r);new u.Notice(`Enriching account data: ${y}/${r}...`),d+l<i.length&&await new Promise(m=>setTimeout(m,100))}let c=o>0?`Enrichment complete: ${s} enriched, ${o} skipped`:`Enrichment complete: ${s} accounts enriched with Salesforce data`;console.log(`[Eudia Enrich] ${c}`),new u.Notice(c)}async writeEnrichmentToAccount(e,t,n){let i=e.name.replace(/[<>:"/\\|?*]/g,"_").trim(),r=`${n}/${i}`,s=this.app.vault.getAbstractFileByPath(r);if(s instanceof u.TFolder||(r=`${n}/_Prospects/${i}`,s=this.app.vault.getAbstractFileByPath(r)),!(s instanceof u.TFolder))return;let o=new Date().toISOString(),l=async(c,d)=>{let p=`${r}/${c}`,g=this.app.vault.getAbstractFileByPath(p);if(!(g instanceof u.TFile))return;let y=await this.app.vault.read(g),m="",w=y;if(y.startsWith("---")){let v=y.indexOf("---",3);v!==-1&&(m=y.substring(0,v+3),w=y.substring(v+3),m.includes("enriched_at:")?m=m.replace(/enriched_at:.*/,`enriched_at: "${o}"`):m=m.substring(0,v)+`enriched_at: "${o}"
---`)}let O=w.match(/^(\s*#[^\n]+)/),C=`${O?O[1]:""}

${d}
`;await this.app.vault.modify(g,`${m}
${C}`)};if(t.contacts&&await l("Contacts.md",`${t.contacts}

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*`),t.intelligence&&await l("Intelligence.md",t.intelligence),t.nextSteps&&await l("Next Steps.md",t.nextSteps),t.opportunities||t.recentActivity){let c=`${r}/Meeting Notes.md`,d=this.app.vault.getAbstractFileByPath(c);if(d instanceof u.TFile){let p=await this.app.vault.read(d),g="",y=p;if(p.startsWith("---")){let f=p.indexOf("---",3);f!==-1&&(g=p.substring(0,f+3),y=p.substring(f+3),g.includes("enriched_at:")?g=g.replace(/enriched_at:.*/,`enriched_at: "${o}"`):g=g.substring(0,f)+`enriched_at: "${o}"
---`)}let m=y.match(/^(\s*#[^\n]+)/),O=[m?m[1]:`
# ${e.name} - Meeting Notes`,""];t.opportunities&&O.push(t.opportunities,""),t.recentActivity&&O.push(t.recentActivity,""),O.push("## Quick Start","","1. Open **Note 1** for your next meeting","2. Click the **microphone** to record and transcribe","3. **Next Steps** are auto-extracted after transcription","4. Set `sync_to_salesforce: true` to sync to Salesforce"),await this.app.vault.modify(d,`${g}
${O.join(`
`)}
`)}}}startSalesforceSyncScanner(){if(!this.settings.sfAutoSyncEnabled){console.log("[Eudia SF Sync] Auto-sync is disabled in settings"),this.updateSfSyncStatusBar("SF Sync: Off");return}let e=(this.settings.sfAutoSyncIntervalMinutes||15)*60*1e3;console.log(`[Eudia SF Sync] Starting scanner \u2014 interval: ${this.settings.sfAutoSyncIntervalMinutes}min`),this.updateSfSyncStatusBar("SF Sync: Idle");let t=window.setTimeout(()=>{this.runSalesforceSyncScan()},3e4);this.registerInterval(t),this.sfSyncIntervalId=window.setInterval(()=>{this.runSalesforceSyncScan()},e),this.registerInterval(this.sfSyncIntervalId)}async runSalesforceSyncScan(){if(!(!this.settings.sfAutoSyncEnabled||!this.settings.userEmail)){console.log("[Eudia SF Sync] Running scan...");try{let e=this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);if(!(e instanceof u.TFolder)){console.log("[Eudia SF Sync] Accounts folder not found");return}let t=[],n=d=>{for(let p of d.children)p instanceof u.TFile&&p.extension==="md"?t.push(p):p instanceof u.TFolder&&n(p)};n(e);let i=[];for(let d of t){let g=this.app.metadataCache.getFileCache(d)?.frontmatter;if(!g?.sync_to_salesforce)continue;let y=g.last_sf_sync?new Date(g.last_sf_sync).getTime():0;d.stat.mtime>y&&i.push(d)}if(i.length===0){console.log("[Eudia SF Sync] No flagged notes need syncing"),this.updateSfSyncStatusBar("SF Sync: Idle");return}console.log(`[Eudia SF Sync] ${i.length} note(s) queued for sync`),this.updateSfSyncStatusBar(`SF Sync: Syncing ${i.length}...`);let r=0,s=0;for(let d of i){let p=await this.syncSpecificNoteToSalesforce(d);if(p.success)r++,await this.updateNoteSyncTimestamp(d);else if(s++,console.log(`[Eudia SF Sync] Failed to sync ${d.path}: ${p.error}`),p.authRequired){new u.Notice("Salesforce authentication expired. Please reconnect to resume auto-sync."),this.updateSfSyncStatusBar("SF Sync: Auth required");return}}let l=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}),c=s>0?`SF Sync: ${r} synced, ${s} failed at ${l}`:`SF Sync: ${r} note${r!==1?"s":""} synced at ${l}`;console.log(`[Eudia SF Sync] ${c}`),this.updateSfSyncStatusBar(c),r>0&&new u.Notice(c)}catch(e){console.error("[Eudia SF Sync] Scan error:",e),this.updateSfSyncStatusBar("SF Sync: Error")}}}async updateNoteSyncTimestamp(e){try{let t=await this.app.vault.read(e),n=new Date().toISOString();if(t.startsWith("---")){let i=t.indexOf("---",3);if(i!==-1){let r=t.substring(0,i),s=t.substring(i);if(r.includes("last_sf_sync:")){let o=r.replace(/last_sf_sync:.*/,`last_sf_sync: "${n}"`)+s;await this.app.vault.modify(e,o)}else{let o=r+`last_sf_sync: "${n}"
`+s;await this.app.vault.modify(e,o)}}}}catch(t){console.error(`[Eudia SF Sync] Failed to update sync timestamp for ${e.path}:`,t)}}updateSfSyncStatusBar(e){this.sfSyncStatusBarEl&&this.sfSyncStatusBarEl.setText(e)}async createMeetingNote(){return new Promise(e=>{new ie(this.app,this,async n=>{if(!n){e();return}let i=new Date().toISOString().split("T")[0],r=n.name.replace(/[<>:"/\\|?*]/g,"_").trim(),s=`${this.settings.accountsFolder}/${r}`,o=`${i} Meeting.md`,l=`${s}/${o}`;this.app.vault.getAbstractFileByPath(s)||await this.app.vault.createFolder(s);let c=`---
title: "Meeting with ${n.name}"
date: ${i}
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

`,d=await this.app.vault.create(l,c);await this.app.workspace.getLeaf().openFile(d),new u.Notice(`Created meeting note for ${n.name}`),e()}).open()})}async fetchAndInsertContext(){new u.Notice("Fetching pre-call context...")}async refreshAnalyticsDashboard(e){if(!this.settings.userEmail){console.log("[Eudia] Cannot refresh analytics - no email configured");return}let n=(await this.app.vault.read(e)).match(/^---\n([\s\S]*?)\n---/);if(!n)return;let i=n[1];if(!i.includes("type: analytics_dashboard"))return;let r=i.match(/category:\s*(\w+)/)?.[1]||"team";console.log(`[Eudia] Refreshing analytics dashboard: ${e.name} (${r})`);try{let s=null,o=this.settings.serverUrl,l=encodeURIComponent(this.settings.userEmail);switch(r){case"pain_points":s=(await(0,u.requestUrl)({url:`${o}/api/analytics/pain-points?days=30`,method:"GET"})).json,s.success&&await this.updatePainPointNote(e,s.painPoints);break;case"objections":s=(await(0,u.requestUrl)({url:`${o}/api/analytics/objection-playbook?days=90`,method:"GET"})).json,s.success&&await this.updateObjectionNote(e,s);break;case"coaching":case"team":default:s=(await(0,u.requestUrl)({url:`${o}/api/analytics/team-trends?managerId=${l}`,method:"GET"})).json,s.success&&await this.updateTeamPerformanceNote(e,s.trends);break}s?.success&&new u.Notice(`Analytics refreshed: ${e.name}`)}catch(s){console.error("[Eudia] Analytics refresh error:",s)}}async updatePainPointNote(e,t){if(!t||t.length===0)return;let n=new Date().toISOString().split("T")[0],i=t.slice(0,10).map(c=>`| ${c.painPoint||"--"} | ${c.count||0} | ${c.category||"--"} | ${c.averageSeverity||"medium"} |`).join(`
`),r={};for(let c of t){let d=c.category||"other";r[d]||(r[d]=[]),r[d].push(c)}let s="";for(let[c,d]of Object.entries(r)){s+=`
### ${c.charAt(0).toUpperCase()+c.slice(1)}
`;for(let p of d.slice(0,3))s+=`- ${p.painPoint}
`}let o=t.filter(c=>c.exampleQuotes&&c.exampleQuotes.length>0).slice(0,5).map(c=>`> "${c.exampleQuotes[0]}" - on ${c.painPoint}`).join(`

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
${i}

---

## By Category
${s}

---

## Example Quotes

${o||"*No quotes available*"}

---

> **Tip:** Use these pain points to prepare for customer calls.
`;await this.app.vault.modify(e,l)}async updateObjectionNote(e,t){if(!t.objections||t.objections.length===0)return;let n=new Date().toISOString().split("T")[0],i=t.objections.slice(0,10).map(o=>{let l=o.handleRatePercent>=75?"\u2705 Strong":o.handleRatePercent>=50?"\u26A0\uFE0F Moderate":"\u274C Needs Work";return`| ${o.objection?.substring(0,40)||"--"}... | ${o.count||0} | ${o.handleRatePercent||0}% | ${l} |`}).join(`
`),r="";for(let o of t.objections.slice(0,5))if(o.bestResponses&&o.bestResponses.length>0){r+=`
### Objection: "${o.objection?.substring(0,50)}..."

`,r+=`**Frequency:** ${o.count} times  
`,r+=`**Handle Rate:** ${o.handleRatePercent}%

`,r+=`**Best Responses:**
`;for(let l of o.bestResponses.slice(0,2))r+=`1. *"${l.response}"* - ${l.rep||"Team member"}
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
${i}

---

## Best Practices
${r||"*No best practices available yet*"}

---

## Coaching Notes

*Objections with <50% handle rate need training focus*

Average handle rate: ${t.avgHandleRate||0}%

---

> **Tip:** Review this playbook before important calls.
`;await this.app.vault.modify(e,s)}async updateTeamPerformanceNote(e,t){if(!t)return;let n=new Date().toISOString().split("T")[0],i=s=>s>0?`\u2191 ${Math.abs(s).toFixed(1)}%`:s<0?`\u2193 ${Math.abs(s).toFixed(1)}%`:"--",r=`---
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
| Avg Score | ${t.avgScore?.toFixed(1)||"--"} | ${i(t.scoreTrend)} |
| Talk Ratio | ${t.avgTalkRatio?Math.round(t.avgTalkRatio*100):"--"}% | ${i(t.talkRatioTrend)} |
| Value Score | ${t.avgValueScore?.toFixed(1)||"--"} | ${i(t.valueScoreTrend)} |
| Next Step Rate | ${t.nextStepRate?Math.round(t.nextStepRate*100):"--"}% | -- |

---

## Top Pain Points

${t.topPainPoints?.slice(0,5).map(s=>`- **${s.painPoint}** (${s.count} mentions)`).join(`
`)||"*No pain points captured yet*"}

---

## Trending Topics

${t.trendingTopics?.slice(0,8).map(s=>`- ${s.topic} (${s.count})`).join(`
`)||"*No topics captured yet*"}

---

## Top Objections

${t.topObjections?.slice(0,5).map(s=>`- ${s.objection} - ${s.handleRatePercent}% handled`).join(`
`)||"*No objections captured yet*"}

---

> **Note:** This dashboard refreshes automatically when you open it.
> Data is aggregated from all analyzed calls in your region.
`;await this.app.vault.modify(e,r)}};var ce=class extends u.PluginSettingTab{constructor(a,e){super(a,e),this.plugin=e}display(){let{containerEl:a}=this;a.empty(),a.createEl("h2",{text:"Eudia Sync & Scribe"}),a.createEl("h3",{text:"Your Profile"});let e=a.createDiv();e.style.cssText="padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px; margin-top: 16px;";let t=e.createDiv();t.style.cssText="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";let n=t.createSpan(),i=t.createSpan(),r=e.createDiv();r.style.cssText="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;",r.setText("Connect with Salesforce to sync notes with your user attribution.");let s=e.createEl("button");s.style.cssText="padding: 10px 20px; cursor: pointer; border-radius: 6px;";let o=null,l=async()=>{if(!this.plugin.settings.userEmail)return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);",i.setText("Enter email above first"),s.setText("Setup Required"),s.disabled=!0,s.style.opacity="0.5",s.style.cursor="not-allowed",!1;s.disabled=!1,s.style.opacity="1",s.style.cursor="pointer";try{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); animation: pulse 1s infinite;",i.setText("Checking..."),(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,method:"GET",throw:!1})).json?.authenticated===!0?(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;",i.setText("Connected to Salesforce"),s.setText("Reconnect"),this.plugin.settings.salesforceConnected=!0,await this.plugin.saveSettings(),!0):(n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;",i.setText("Not connected"),s.setText("Connect to Salesforce"),!1)}catch{return n.style.cssText="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;",i.setText("Status unavailable"),s.setText("Connect to Salesforce"),!1}};new u.Setting(a).setName("Eudia Email").setDesc("Your @eudia.com email address for calendar and Salesforce sync").addText(h=>h.setPlaceholder("yourname@eudia.com").setValue(this.plugin.settings.userEmail).onChange(async S=>{let x=S.trim().toLowerCase();this.plugin.settings.userEmail=x,await this.plugin.saveSettings(),await l()})),new u.Setting(a).setName("Timezone").setDesc("Your local timezone for calendar event display").addDropdown(h=>{fe.forEach(S=>{h.addOption(S.value,S.label)}),h.setValue(this.plugin.settings.timezone),h.onChange(async S=>{this.plugin.settings.timezone=S,await this.plugin.saveSettings(),this.plugin.calendarService?.setTimezone(S),new u.Notice(`Timezone set to ${fe.find(x=>x.value===S)?.label||S}`)})}),a.createEl("h3",{text:"Salesforce Connection"}),a.appendChild(e);let c=()=>{o&&window.clearInterval(o);let h=0,S=30;o=window.setInterval(async()=>{h++,await l()?(o&&(window.clearInterval(o),o=null),new u.Notice("Salesforce connected successfully!")):h>=S&&o&&(window.clearInterval(o),o=null)},5e3)};s.onclick=async()=>{if(!this.plugin.settings.userEmail){new u.Notice("Please enter your email first");return}let h=`${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;window.open(h,"_blank"),new u.Notice("Complete the Salesforce login in the popup window",5e3),c()},l(),a.createEl("h3",{text:"Server"}),new u.Setting(a).setName("GTM Brain Server").setDesc("Server URL for calendar, accounts, and sync").addText(h=>h.setValue(this.plugin.settings.serverUrl).onChange(async S=>{this.plugin.settings.serverUrl=S,await this.plugin.saveSettings()}));let d=a.createDiv({cls:"settings-advanced-collapsed"}),p=d.createDiv({cls:"eudia-transcription-status"});p.style.cssText="padding: 12px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;",p.innerHTML='<span style="color: var(--text-muted);">Checking server transcription status...</span>',(async()=>{try{(await(0,u.requestUrl)({url:`${this.plugin.settings.serverUrl}/api/plugin/config`,method:"GET"})).json?.capabilities?.serverTranscription?p.innerHTML='<span class="eudia-check-icon"></span> Server transcription is available. No local API key needed.':p.innerHTML='<span class="eudia-warn-icon"></span> Server transcription unavailable. Add a local API key below.'}catch{p.innerHTML='<span style="color: #f59e0b;">\u26A0</span> Could not check server status. Local API key recommended as backup.'}})();let g=new u.Setting(a).setName("Advanced Options").setDesc("Show fallback API key (usually not needed)").addToggle(h=>h.setValue(!1).onChange(S=>{d.style.display=S?"block":"none"}));d.style.display="none",a.createEl("h3",{text:"Audio Capture"});let y=a.createDiv();y.style.cssText="font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5;",y.setText(`Full Call mode automatically captures both sides of the call (your mic + the other person's audio). No extra software needed \u2014 the plugin uses native system audio capture. Run "Test System Audio Capture" from the command palette (Cmd+P) to verify your setup.`),new u.Setting(a).setName("Capture Mode").setDesc("Full Call captures both sides; Mic Only captures your voice only.").addDropdown(h=>{h.addOption("full_call","Full Call (Both Sides)"),h.addOption("mic_only","Mic Only"),h.setValue(this.plugin.settings.audioCaptureMode||"full_call"),h.onChange(async S=>{this.plugin.settings.audioCaptureMode=S,await this.plugin.saveSettings()})});let m=a.createDiv();m.style.cssText="padding: 10px 14px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;",m.setText("Checking system audio capabilities...");let w=new u.Setting(a).setName("Microphone").setDesc("Select your physical microphone"),O=new u.Setting(a).setName("System Audio Device").setDesc("Override for system audio source (auto-detected \u2014 most users should leave this on Auto)"),f=a.createDiv();f.style.cssText="margin-bottom: 16px;";let C=f.createEl("button",{text:"Test Audio (3 seconds)"});C.style.cssText="padding: 8px 16px; cursor: pointer; border-radius: 6px;";let v=f.createDiv();v.style.cssText="font-size: 12px; margin-top: 6px; color: var(--text-muted);",(async()=>{try{try{(await navigator.mediaDevices.getUserMedia({audio:!0})).getTracks().forEach(k=>k.stop())}catch{}let h=await W.getAvailableDevices(),S=h.find(E=>E.isVirtual);if(S)m.innerHTML=`<span style="color:#22c55e;">&#10003;</span> System audio device detected: <strong>${S.label}</strong>`,this.plugin.settings.audioSystemDeviceId||(this.plugin.settings.audioSystemDeviceId=S.deviceId,await this.plugin.saveSettings());else{let E=await W.probeSystemAudioCapabilities();E.desktopCapturerAvailable||W.isHandlerReady()?m.innerHTML='<span style="color:#22c55e;">&#10003;</span> Native system audio capture available. Both sides of calls will be recorded automatically.':E.getDisplayMediaAvailable?m.innerHTML=`<span style="color:#3b82f6;">&#8505;</span> System audio capture ready. On first recording, macOS may ask for Screen Recording permission \u2014 this is how the plugin captures the other person's audio.`:m.innerHTML=`<span style="color:#f59e0b;">&#9888;</span> System audio not available (Electron ${E.electronVersion||"?"}). Run "Test System Audio Capture" from Cmd+P for details.`}let x=h.filter(E=>!E.isVirtual);w.addDropdown(E=>{E.addOption("","Default Microphone"),x.forEach(k=>E.addOption(k.deviceId,k.label)),E.setValue(this.plugin.settings.audioMicDeviceId||""),E.onChange(async k=>{this.plugin.settings.audioMicDeviceId=k,await this.plugin.saveSettings()})}),O.addDropdown(E=>{E.addOption("","Auto-detect / None"),h.filter(k=>k.isVirtual).forEach(k=>E.addOption(k.deviceId,k.label)),h.filter(k=>!k.isVirtual).forEach(k=>E.addOption(k.deviceId,`(mic) ${k.label}`)),E.setValue(this.plugin.settings.audioSystemDeviceId||""),E.onChange(async k=>{this.plugin.settings.audioSystemDeviceId=k,await this.plugin.saveSettings()})})}catch(h){m.setText("Could not enumerate audio devices."),console.warn("[Eudia Settings] Device enumeration failed:",h)}})(),C.onclick=async()=>{C.disabled=!0,C.setText("Recording..."),v.setText("");try{let h=new W;await h.start({captureMode:this.plugin.settings.audioCaptureMode||"full_call",micDeviceId:this.plugin.settings.audioMicDeviceId||void 0,systemAudioDeviceId:this.plugin.settings.audioSystemDeviceId||void 0}),await new Promise(j=>setTimeout(j,3e3));let S=await h.stop(),x=await W.analyzeAudioBlob(S.audioBlob),E={electron:"System Audio (Electron)",display_media:"System Audio (Screen Share)",virtual_device:"Virtual Device + Mic"},k=S.systemAudioMethod?E[S.systemAudioMethod]||"System Audio":S.captureMode==="full_call"?"Speaker Mode":"Mic Only";v.innerHTML=`<strong>${k}</strong> | Peak: ${x.peakLevel}% | Avg: ${x.averageLevel}% | Silent: ${x.silentPercent}%`+(x.warning?`<br><span style="color:#ef4444;">${x.warning}</span>`:'<br><span style="color:#22c55e;">Audio detected \u2014 recording should work.</span>')}catch(h){v.innerHTML=`<span style="color:#ef4444;">Test failed: ${h.message}</span>`}finally{C.disabled=!1,C.setText("Test Audio (3 seconds)")}},a.createEl("h3",{text:"Transcription"}),new u.Setting(a).setName("Save Audio Files").setDesc("Keep original audio recordings").addToggle(h=>h.setValue(this.plugin.settings.saveAudioFiles).onChange(async S=>{this.plugin.settings.saveAudioFiles=S,await this.plugin.saveSettings()})),new u.Setting(a).setName("Append Full Transcript").setDesc("Include complete transcript in notes").addToggle(h=>h.setValue(this.plugin.settings.appendTranscript).onChange(async S=>{this.plugin.settings.appendTranscript=S,await this.plugin.saveSettings()})),a.createEl("h3",{text:"Sync"}),new u.Setting(a).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle(h=>h.setValue(this.plugin.settings.syncOnStartup).onChange(async S=>{this.plugin.settings.syncOnStartup=S,await this.plugin.saveSettings()})),new u.Setting(a).setName("Auto-Sync After Transcription").setDesc("Push notes to Salesforce after transcription").addToggle(h=>h.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async S=>{this.plugin.settings.autoSyncAfterTranscription=S,await this.plugin.saveSettings()})),new u.Setting(a).setName("Auto-Sync Flagged Notes").setDesc("Periodically push notes with sync_to_salesforce: true to Salesforce").addToggle(h=>h.setValue(this.plugin.settings.sfAutoSyncEnabled).onChange(async S=>{this.plugin.settings.sfAutoSyncEnabled=S,await this.plugin.saveSettings(),S?this.plugin.startSalesforceSyncScanner():this.plugin.updateSfSyncStatusBar("SF Sync: Off")})),new u.Setting(a).setName("Auto-Sync Interval").setDesc("How often to scan for flagged notes (in minutes)").addDropdown(h=>{h.addOption("5","Every 5 minutes"),h.addOption("15","Every 15 minutes"),h.addOption("30","Every 30 minutes"),h.setValue(String(this.plugin.settings.sfAutoSyncIntervalMinutes)),h.onChange(async S=>{this.plugin.settings.sfAutoSyncIntervalMinutes=parseInt(S),await this.plugin.saveSettings(),new u.Notice(`SF auto-sync interval set to ${S} minutes. Restart Obsidian for changes to take effect.`)})}),a.createEl("h3",{text:"Folders"}),new u.Setting(a).setName("Accounts Folder").setDesc("Where account folders are stored").addText(h=>h.setValue(this.plugin.settings.accountsFolder).onChange(async S=>{this.plugin.settings.accountsFolder=S||"Accounts",await this.plugin.saveSettings()})),new u.Setting(a).setName("Recordings Folder").setDesc("Where audio files are saved").addText(h=>h.setValue(this.plugin.settings.recordingsFolder).onChange(async S=>{this.plugin.settings.recordingsFolder=S||"Recordings",await this.plugin.saveSettings()})),a.createEl("h3",{text:"Actions"}),new u.Setting(a).setName("Sync Accounts Now").setDesc(`${this.plugin.settings.cachedAccounts.length} accounts available for matching`).addButton(h=>h.setButtonText("Sync").setCta().onClick(async()=>{await this.plugin.syncAccounts(),this.display()})),new u.Setting(a).setName("Refresh Account Folders").setDesc("Check for new account assignments and create folders for them").addButton(h=>h.setButtonText("Refresh Folders").onClick(async()=>{h.setButtonText("Checking..."),h.setDisabled(!0);try{let S=await this.plugin.refreshAccountFolders();S>0?new u.Notice(`Created ${S} new account folder${S>1?"s":""}`):new u.Notice("All account folders are up to date")}catch(S){new u.Notice("Failed to refresh folders: "+S.message)}h.setButtonText("Refresh Folders"),h.setDisabled(!1),this.display()})),this.plugin.settings.lastSyncTime&&a.createEl("p",{text:`Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()}`,cls:"setting-item-description"}),a.createEl("p",{text:`Audio transcription: ${W.isSupported()?"Supported":"Not supported"}`,cls:"setting-item-description"})}};
