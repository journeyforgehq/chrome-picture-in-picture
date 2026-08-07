// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Form, Input, Button, Alert } from "antd";
import type { RestoreResult } from "../billing/entitlement";

export interface RestoreFormProps {
  onRestore: (email: string) => void;
  result: RestoreResult | undefined;
  loading?: boolean;
}

interface FormValues {
  email: string;
}

/** Renders the status-aware message for a RestoreResult, or null if idle. */
function renderStatus(result: RestoreResult | undefined): React.ReactNode {
  if (!result) return null;

  if (result.ok) {
    return <Alert type="success" role="alert" message="Purchase restored — you're Pro again." />;
  }

  const status = result.error?.status;
  // A restore MISS is HTTP 404 on legacy backends and HTTP 200 {ok:false} on
  // normalized ones (restore-normalization spec §7); entitlement.restore() surfaces
  // both as error.status 404 or 200. 429 = rate-limited, 5xx = server error.
  if (status === 404 || status === 200) {
    return (
      <Alert type="warning" role="alert" message="No active purchase found for that email" />
    );
  }
  if (status === 429) {
    return <Alert type="warning" role="alert" message="Too many attempts, try again later" />;
  }
  return (
    <Alert
      type="error"
      role="alert"
      message={result.error?.message ?? "Something went wrong. Please try again."}
    />
  );
}

/**
 * Email restore form. Calls onRestore(email) on submit; renders a
 * status-aware message from `result` (spec §11A: RestoreForm).
 */
export function RestoreForm({ onRestore, result, loading = false }: RestoreFormProps) {
  const [form] = Form.useForm<FormValues>();

  const handleFinish = (values: FormValues) => {
    onRestore(values.email);
  };

  return (
    <div>
      <Form form={form} layout="inline" onFinish={handleFinish}>
        <Form.Item
          name="email"
          label="Email"
          rules={[{ required: true, type: "email", message: "Enter a valid email" }]}
        >
          <Input type="email" aria-label="Email" placeholder="you@example.com" />
        </Form.Item>
        <Form.Item>
          <Button htmlType="submit" type="primary" loading={loading} disabled={loading}>
            Restore purchase
          </Button>
        </Form.Item>
      </Form>
      {renderStatus(result)}
    </div>
  );
}
