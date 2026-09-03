import { useState, useRef, useEffect } from "react";
import { Mic, Square, Pause, Play, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VoiceRecorder({
  onFinish,
  onCancel,
}: {
  onFinish: (base64: string, mimeType: string) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "paused" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isCancelledRef = useRef(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (state === "recording") {
      interval = setInterval(() => {
        setElapsed((e) => {
          if (e >= 300) {
            handleStop();
            return e;
          }
          return e + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleStart = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        if (isCancelledRef.current) return;
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const base64 = base64data.split(",")[1];
          if (base64) {
            onFinish(base64, mimeType);
          }
        };
        reader.readAsDataURL(blob);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }
      };

      mediaRecorder.start();
      setState("recording");
      setElapsed(0);
    } catch (err: any) {
      setState("error");
      setErrorMsg(err.message || "Erro ao acessar o microfone.");
    }
  };

  const handlePause = () => {
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.pause();
      setState("paused");
    }
  };

  const handleResume = () => {
    if (mediaRecorderRef.current && state === "paused") {
      mediaRecorderRef.current.resume();
      setState("recording");
    }
  };

  const handleStop = () => {
    if (mediaRecorderRef.current && (state === "recording" || state === "paused")) {
      mediaRecorderRef.current.stop();
      setState("idle");
    }
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    onCancel();
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6 w-full max-w-sm mx-auto">
      {state === "error" ? (
        <div className="flex flex-col items-center text-destructive text-center">
          <AlertCircle className="w-12 h-12 mb-4" />
          <p className="font-medium text-lg mb-2">Microfone bloqueado</p>
          <p className="text-sm opacity-80">{errorMsg}</p>
          <Button variant="outline" className="mt-6" onClick={handleCancel}>
            Voltar
          </Button>
        </div>
      ) : state === "idle" ? (
        <div className="flex flex-col items-center">
          <div className="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
            <Mic className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold mb-2">Gravar Despesas</h2>
          <p className="text-center text-muted-foreground mb-8 text-sm px-4">
            Relate os gastos. Ex: "Paguei 50 reais de cerveja pra mim e pro João."
          </p>
          <div className="flex flex-col gap-3 w-full">
            <Button size="lg" onClick={handleStart} className="gap-2 h-14 text-base w-full shadow-lg shadow-primary/20">
              <Mic className="w-5 h-5" /> Começar a gravar
            </Button>
            <Button variant="ghost" onClick={handleCancel} className="w-full">
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full">
          <div className="text-5xl font-mono tabular-nums mb-8 font-light text-primary tracking-tight">
            {formatTime(elapsed)}
          </div>
          <p className="text-sm text-muted-foreground mb-12">Max 5:00</p>
          
          <div className="flex items-center justify-center gap-6">
            {state === "recording" ? (
              <Button variant="outline" size="icon" className="w-16 h-16 rounded-full border-2" onClick={handlePause}>
                <Pause className="w-6 h-6" />
              </Button>
            ) : (
              <Button variant="outline" size="icon" className="w-16 h-16 rounded-full border-2" onClick={handleResume}>
                <Play className="w-6 h-6 ml-1" />
              </Button>
            )}
            
            <Button variant="default" size="icon" className="w-20 h-20 rounded-full shadow-xl shadow-primary/30" onClick={handleStop}>
              <Square className="w-8 h-8 fill-current" />
            </Button>
          </div>
          
          <Button variant="ghost" className="mt-12 text-muted-foreground" onClick={handleCancel}>
            Cancelar gravação
          </Button>
        </div>
      )}
    </div>
  );
}
