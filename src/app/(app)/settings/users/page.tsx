import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Checkbox, Field, Input, Select } from "@/components/ui";
import { FieldError } from "../_components/ActionForm";
import { DialogForm } from "../_components/DialogForm";
import { DeleteForm } from "../_components/DeleteForm";
import { deleteUser, saveUser } from "../actions";
import { ROLES } from "../validation";
import { date } from "@/lib/format";
import { providerLabel } from "@/lib/user-resolution";

export const metadata = { title: "Users · Settings" };

type User = typeof schema.users.$inferSelect;

const ROLE_HINT: Record<string, string> = {
  Owner: "Full access including settings and billing",
  Admin: "Full access to records and settings",
  Estimator: "Leads, estimates, quotes and catalogues",
  "Project Manager": "Jobs, schedules, orders and invoices",
  "Site Supervisor": "Assigned jobs, schedule and timesheets",
  "Read Only": "Can view but not change anything",
};

function UserFields({ u }: { u?: User }) {
  return (
    <>
      {u && <input type="hidden" name="id" value={u.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name *">
          <Input name="firstName" defaultValue={u?.firstName ?? ""} autoFocus />
          <FieldError name="firstName" />
        </Field>
        <Field label="Surname">
          <Input name="surname" defaultValue={u?.surname ?? ""} />
          <FieldError name="surname" />
        </Field>
        <Field label="Email *" hint={u?.clerkUserId ? undefined : "They sign in with Google or Apple using this email."}>
          <Input name="email" type="email" defaultValue={u?.email ?? ""} />
          <FieldError name="email" />
        </Field>
        <Field label="Mobile">
          <Input name="mobile" defaultValue={u?.mobile ?? ""} />
          <FieldError name="mobile" />
        </Field>
      </div>
      <Field label="Role">
        <Select name="role" defaultValue={u?.role ?? "Estimator"} options={ROLES.map((r) => ({ value: r, label: `${r} — ${ROLE_HINT[r]}` }))} />
        <FieldError name="role" />
      </Field>
      <Checkbox name="active" defaultChecked={u ? u.active : true} label="Active (can sign in and be assigned work)" />
      {!u && (
        <p className="text-xs text-ink-500">
          Adding someone invites them: once added, they open this site and choose <strong>Continue with Google</strong> or{" "}
          <strong>Continue with Apple</strong> using the email above. No password needed.
        </p>
      )}
    </>
  );
}

export default async function UsersSettingsPage() {
  const users = await db.select().from(schema.users).orderBy(asc(schema.users.firstName), asc(schema.users.surname));
  const activeCount = users.filter((u) => u.active).length;
  return (
    <section className="rounded-lg border border-ink-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Users</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            {activeCount} active of {users.length}. Add someone by email to invite them — they sign in with Google or Apple
            using that email. Roles describe what each person is responsible for.
          </p>
        </div>
        <DialogForm action={saveUser} title="Add user" triggerLabel="+ Add user" submitLabel="Add user">
          <UserFields />
        </DialogForm>
      </header>
      {users.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-500">No users yet. Add yourself as the Owner to get started.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" aria-label="Users">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="hidden px-3 py-2 font-semibold md:table-cell">Email</th>
                <th className="hidden px-3 py-2 font-semibold lg:table-cell">Mobile</th>
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="hidden px-3 py-2 font-semibold sm:table-cell">Login</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const name = [u.firstName, u.surname].filter(Boolean).join(" ");
                return (
                  <tr key={u.id} data-user={u.email} className="border-t border-ink-100 align-middle">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800" aria-hidden>
                          {(u.firstName[0] ?? "") + (u.surname?.[0] ?? "")}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-ink-900">{name}</div>
                          <div className="truncate text-xs text-ink-500 md:hidden">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2 text-ink-700 md:table-cell">{u.email}</td>
                    <td className="hidden px-3 py-2 text-ink-700 lg:table-cell">{u.mobile || <span className="text-ink-300">—</span>}</td>
                    <td className="px-3 py-2">
                      <Badge tone={u.role === "Owner" ? "purple" : u.role === "Admin" ? "blue" : "grey"}>{u.role}</Badge>
                    </td>
                    <td className="hidden px-3 py-2 text-xs sm:table-cell" data-testid="login-status">
                      {u.clerkUserId ? (
                        <span className="text-ink-700">
                          Signed in via {providerLabel(u.signInProvider)}
                          {u.linkedAt && <> on {date(u.linkedAt)}</>}
                        </span>
                      ) : (
                        <span className="text-ink-500">Invited — not signed in yet</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{u.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <DialogForm action={saveUser} title={`Edit ${name}`} triggerLabel="Edit" trigger="small" submitLabel="Save user">
                          <UserFields u={u} />
                        </DialogForm>
                        <DeleteForm action={deleteUser} id={u.id} confirmText="Delete user?" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
