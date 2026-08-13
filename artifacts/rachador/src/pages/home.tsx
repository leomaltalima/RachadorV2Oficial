import { Link, useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useGetGrupoByCodigo } from "@workspace/api-client-react"
import { useState } from "react"
import { ArrowRight, PlusCircle, UsersRound } from "lucide-react"

export default function Home() {
  const [, setLocation] = useLocation()
  const [codigo, setCodigo] = useState("")

  const { data: grupo, isError, error } = useGetGrupoByCodigo(codigo, {
    query: {
      enabled: codigo.length === 6,
    }
  })

  // Whenever a group is found by code, we navigate.
  if (grupo) {
    setLocation(`/g/${grupo.id}`)
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
        
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <UsersRound className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Rachador</h1>
          <p className="text-muted-foreground text-lg">Divida as contas, não as amizades.</p>
        </div>

        <Card className="border-border/50 shadow-xl shadow-primary/5">
          <CardHeader>
            <CardTitle>Entrar em um grupo</CardTitle>
            <CardDescription>
              Digite o código de 6 letras que seu amigo enviou.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Input 
                  placeholder="Ex: ABCDEF"
                  className="h-14 text-center text-xl font-bold uppercase tracking-widest"
                  maxLength={6}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  data-testid="input-invite-code"
                />
                {codigo.length === 6 && !grupo && !isError && (
                  <div className="absolute right-4 top-4">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {isError && (
                <p className="text-sm text-destructive text-center font-medium" data-testid="error-invite-code">
                  Grupo não encontrado. Verifique o código.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase font-bold tracking-wider">
            <span className="bg-background px-4 text-muted-foreground">ou</span>
          </div>
        </div>

        <Button 
          variant="outline" 
          size="lg" 
          className="w-full h-14 border-2 border-dashed"
          onClick={() => setLocation("/criar")}
          data-testid="button-create-group"
        >
          <PlusCircle className="mr-2 h-5 w-5" />
          Criar novo grupo
        </Button>
        
      </div>
    </div>
  )
}
