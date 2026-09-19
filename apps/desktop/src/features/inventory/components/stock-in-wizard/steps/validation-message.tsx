export function ValidationMessage({ message }: { message: string }) {
  return (
    <span className="mt-1 block text-caption text-destructive">{message}</span>
  );
}
