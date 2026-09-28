import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquarePlus, Plus } from "lucide-react";
import { sessionService } from "@/services/apiService";
import { queryKeys } from "@/lib/queryKeys";
import { Alert, errorMessage } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";

/**
 * "New session" form.
 *
 * A real `<form>` replaces the previous pair of `onKeyDown === "Enter"`
 * handlers — pressing Enter in either field now submits, for free.
 */
export function CreateSessionForm() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [label, setLabel] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const createMutation = useMutation({
    mutationFn: sessionService.createSession,
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      setLabel("");
      setPhoneNumber("");

      // A session is only ever created in order to pair it, so the user is sent
      // straight into its dashboard page rather than left on the list.
      await navigate({ to: "/sessions/$sessionId", params: { sessionId: session.id } });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate({
      label: label.trim() || undefined,
      phoneNumber: phoneNumber.trim() || undefined,
    });
  };

  return (
    <Card>
      <CardHeader
        icon={<MessageSquarePlus className="h-4 w-4 text-brand-600" />}
        title="New session"
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <Input
          type="text"
          placeholder="Label, e.g. Support line"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={createMutation.isPending}
          className="flex-1"
        />
        <Input
          type="tel"
          placeholder="Phone (optional), 628123456789"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
          disabled={createMutation.isPending}
          className="flex-1"
        />
        <Button
          type="submit"
          loading={createMutation.isPending}
          icon={<Plus className="h-4 w-4" />}
          className="px-5"
        >
          Create
        </Button>
      </form>

      {createMutation.isError && (
        <Alert tone="error" className="mt-3">
          {errorMessage(createMutation.error)}
        </Alert>
      )}
    </Card>
  );
}
