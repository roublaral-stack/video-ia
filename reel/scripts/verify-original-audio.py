"""Compare imported voice with decoded MP4 locally; do not process its voice."""
import sys,json,tempfile,subprocess,wave,hashlib
from pathlib import Path
import numpy as np

def read_pcm(file):
 with wave.open(str(file)) as w:
  if (w.getframerate(),w.getnchannels(),w.getsampwidth())!=(48000,1,2):raise ValueError('Analyse : WAV mono PCM16 48 kHz requis.')
  return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float64)/32768

def compare(original,normalized,decoded):
 with tempfile.TemporaryDirectory(prefix='video-ia-verify-') as temp:
  ref=Path(temp)/'reference.wav';subprocess.run(['ffmpeg','-v','error','-y','-i',str(original),'-ar','48000','-ac','1','-c:a','pcm_s16le',str(ref)],check=True);x=read_pcm(ref)
 y=read_pcm(decoded);technical=read_pcm(normalized)
 if len(technical)!=len(x) or not np.array_equal(technical,x):raise ValueError('Le WAV importé a subi une transformation non technique ou une substitution.')
 if len(y)<len(x):raise ValueError('La piste finale est plus courte que le WAV source.')
 # AAC priming is removed by the decoder. Measure any remaining clock offset.
 n=min(len(x),len(y));size=1<<(2*n-1).bit_length();corr=np.fft.irfft(np.fft.rfft(y[:n],size)*np.conj(np.fft.rfft(x[:n],size)),size)
 limit=2400;window=np.concatenate((corr[-limit:],corr[:limit+1]));lag=int(np.argmax(window)-limit)
 if abs(lag)>240:raise ValueError(f'Décalage vocal inattendu : {lag/48000:.4f} s.')
 if lag>=0:a=x[:min(len(x),len(y)-lag)];b=y[lag:lag+len(a)]
 else:b=y[:min(len(y),len(x)+lag)];a=x[-lag:-lag+len(b)]
 power=np.dot(a,a);gain=float(np.dot(a,b)/power);gain_db=20*np.log10(max(gain,1e-12));correlation=float(np.corrcoef(a,b)[0,1]);error=np.dot(b-a,b-a);snr=float(10*np.log10(power/max(error,1e-18)))
 if abs(gain_db)>.2 or correlation<.995 or snr<25:raise ValueError(f'Fidélité insuffisante : gain {gain_db:.3f} dB, corrélation {correlation:.6f}, SNR {snr:.2f} dB.')
 block_checks=[]
 for start in range(0,len(a),24000):
  aa=a[start:start+24000];bb=b[start:start+24000]
  if np.sqrt(np.mean(aa**2))<.003:continue
  local=float(np.corrcoef(aa,bb)[0,1]);block_checks.append(local)
  if not np.isfinite(local) or local<.98:raise ValueError('Une partie vocale manque ou a été modifiée dans le MP4.')
 return {'passed':True,'engine':'files','voiceSubstitution':False,'originalSha256':hashlib.sha256(original.read_bytes()).hexdigest(),'technicalPcmExact':True,'residualOffsetSamples':lag,'residualOffsetMs':lag/48,'correlation':correlation,'gainDb':float(gain_db),'signalToNoiseDb':snr,'minimumVoicedBlockCorrelation':min(block_checks),'originalSamplesAt48k':len(x),'decodedSamplesAt48k':len(y),'codecNote':'AAC is lossy; the source WAV remains unmodified. No gain, fade, loop, tempo, pitch or trim is applied.'}
if __name__=='__main__':
 try:
  original,normalized,decoded,out=map(Path,sys.argv[1:5]);report=compare(original,normalized,decoded);out.write_text(json.dumps(report,indent=2)+'\n');print('Voix originale vérifiée : corrélation %.6f, gain %.3f dB, décalage %.3f ms.'%(report['correlation'],report['gainDb'],report['residualOffsetMs']))
 except Exception as e:raise SystemExit('Vérification de la voix refusée : '+str(e))
