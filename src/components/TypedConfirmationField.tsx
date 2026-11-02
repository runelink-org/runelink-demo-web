import { useId } from "react";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type TypedConfirmationFieldProps = {
  phrase: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function TypedConfirmationField({
  phrase,
  value,
  disabled,
  onChange,
  onSubmit,
}: TypedConfirmationFieldProps) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id} className="block font-normal">
        Type <span className="font-mono font-semibold">{phrase}</span> to
        confirm.
      </FieldLabel>
      <FieldContent>
        <Input
          id={id}
          value={value}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
      </FieldContent>
    </Field>
  );
}
