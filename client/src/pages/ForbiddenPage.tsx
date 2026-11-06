import { MessagePage } from "../components/MessagePage";

export function ForbiddenPage() {
  return (
    <MessagePage icon="shield-lock" title="Forbidden">
      You do not have permission to do this.
    </MessagePage>
  );
}
