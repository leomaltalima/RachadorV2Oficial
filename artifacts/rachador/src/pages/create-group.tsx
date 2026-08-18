import { useState } from "react"
import { useLocation } from "wouter"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useCreateGrupo } from "@workspace/api-client-react"
import { useQuery } from "@tanstack/react-query"
import { getSession, setSession } from "@/lib/session"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Plus, Trash2, ArrowLeft, Users, ChevronRight } from "lucide-react"

interface MeuGrupo {
  grupo: { id: number; nome: string; participantes: { id: number; nome: string; chavePix: string | null }[] }
  participante: { id: number; nome: string }
}

const participantSchema = z.object({
  nome: z.string().min(1, "O nome é obrigatório"),
  chavePix: z.string().min(1, "A chave Pix é obrigatória"),
})

const formSchema = z.object({
  nome: z.string().min(1, "O nome do grupo é obrigatório"),
  participantes: z.array(participantSchema).min(1, "Adicione pelo menos um participante"),
})

export default function CreateGroup() {
  const [, setLocation] = useLocation()
  const createGrupo = useCreateGrupo()

  const { data: meusGrupos, isLoading: loadingGrupos } = useQuery<MeuGrupo[]>({
    queryKey: ["me/grupos"],
    queryFn: async () => {
      const res = await fetch("/api/me/grupos", { credentials: "include" })
      if (!res.ok) throw new Error("Erro ao buscar grupos")
      return res.json()
    },
  })

  const handleEnterGroup = (g: MeuGrupo) => {
    setSession(g.grupo.id, g.participante.id)
    setLocation(`/g/${g.grupo.id}`)
  }

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      participantes: [{ nome: "", chavePix: "" }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "participantes",
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    createGrupo.mutate({
      data: {
        nome: values.nome,
        participantes: values.participantes.map(p => ({
          nome: p.nome,
          chavePix: p.chavePix,
        }))
      }
    }, {
      onSuccess: (grupo) => {
        setLocation(`/g/${grupo.id}/entrar`)
      }
    })
  }

  return (
    <div className="min-h-[100dvh] flex flex-col p-4 sm:p-8 max-w-2xl mx-auto w-full">
      <Button 
        variant="ghost" 
        className="w-fit mb-6 -ml-4 text-muted-foreground hover:text-foreground"
        onClick={() => setLocation("/")}
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
      </Button>

      <div className="space-y-6">

        {/* Existing groups */}
        {(loadingGrupos || (meusGrupos && meusGrupos.length > 0)) && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">
              Seus grupos
            </p>
            {loadingGrupos ? (
              <p className="text-sm text-muted-foreground px-1">Carregando…</p>
            ) : (
              <div className="space-y-2">
                {meusGrupos!.map(g => (
                  <button
                    key={g.grupo.id}
                    type="button"
                    onClick={() => handleEnterGroup(g)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{g.grupo.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        Como {g.participante.nome} · {g.grupo.participantes.length} participantes
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            )}
            <div className="relative pt-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase font-bold tracking-wider">
                <span className="bg-background px-4 text-muted-foreground">ou crie um novo</span>
              </div>
            </div>
          </div>
        )}

        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Novo Grupo</h1>
          <p className="text-muted-foreground text-lg">Quem vai participar da conta?</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <Card className="border-border/50 shadow-md">
              <CardContent className="pt-6">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Nome do grupo</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Viagem para Ubatuba" className="h-12 text-lg" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight text-foreground">Participantes</h2>
              </div>
              
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <Card key={field.id} className="border-border/50 shadow-sm relative overflow-hidden group">
                    {index > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                    <CardContent className="p-4 pt-5 grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name={`participantes.${index}.nome`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome</FormLabel>
                            <FormControl>
                              <Input placeholder="Nome" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`participantes.${index}.chavePix`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Chave Pix</FormLabel>
                            <FormControl>
                              <Input placeholder="CPF, Celular, E-mail..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full h-12 border-dashed border-2"
                onClick={() => append({ nome: "", chavePix: "" })}
              >
                <Plus className="w-4 h-4 mr-2" /> Adicionar participante
              </Button>
            </div>

            <Button 
              type="submit" 
              size="lg" 
              className="w-full h-14 text-lg shadow-primary/20 shadow-lg"
              disabled={createGrupo.isPending}
            >
              {createGrupo.isPending ? "Criando..." : "Criar Grupo"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
