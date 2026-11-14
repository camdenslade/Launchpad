import { useEffect, useState } from "react";
import type { CloudAccount } from "@launchpad/contracts";
import { deleteCloudAccount, listCloudAccounts } from "../../api/cloud.js";
import { PlusIcon } from "../icons.js";
import { ConnectAwsPanel } from "./ConnectAwsPanel.js";
import { ProviderLogo } from "./ProviderLogo.js";

const STATUS_LABEL: Record<CloudAccount["status"], string> = {
  connected: "Connected",
  pending: "Setup incomplete",
  error: "Needs attention"
};

export function CloudAccountsPage() {
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** null = closed, "new" = fresh connect, or an account to resume. */
  const [panel, setPanel] = useState<"new" | CloudAccount | null>(null);

  useEffect(() => {
    listCloudAccounts()
      .then(setAccounts)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  /** Insert or replace an account in the list after the panel changes it. */
  function upsert(account: CloudAccount) {
    setAccounts((current) =>
      current.some((a) => a.id === account.id)
        ? current.map((a) => (a.id === account.id ? account : a))
        : [account, ...current]
    );
  }

  async function handleRemove(account: CloudAccount) {
    if (!window.confirm(`Disconnect "${account.name}"? You can delete the IAM role in AWS afterwards.`)) return;
    try {
      await deleteCloudAccount(account.id);
      setAccounts((current) => current.filter((a) => a.id !== account.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Cloud accounts</h1>
          <p>AWS accounts your infrastructure and deployments run in. They stay yours.</p>
        </div>
        {!panel && accounts.length > 0 && (
          <button type="button" className="button" onClick={() => setPanel("new")}>
            <PlusIcon />
            Connect AWS account
          </button>
        )}
      </div>

      {error && <div className="banner">{error}</div>}

      {panel && (
        <ConnectAwsPanel
          key={panel === "new" ? "new" : panel.id}
          {...(panel === "new" ? {} : { resume: panel })}
          onChanged={upsert}
          onClose={() => setPanel(null)}
        />
      )}

      {loading ? (
        <div className="project-list" aria-busy="true">
          <div className="skeleton" />
        </div>
      ) : accounts.length === 0 ? (
        !panel && (
          <div className="empty-state">
            <h2>No cloud accounts yet</h2>
            <p>Connect an AWS account to provision infrastructure and deploy your projects into it.</p>
            <button type="button" className="button" onClick={() => setPanel("new")}>
              <PlusIcon />
              Connect AWS account
            </button>
          </div>
        )
      ) : (
        <ul className="project-list">
          {accounts.map((account) => (
            <li key={account.id} className="project-row">
              <ProviderLogo provider={account.provider} />
              <div style={{ minWidth: 0 }}>
                <h3 className="project-row__name">
                  {account.name}{" "}
                  <span className={`status-pill status-pill--${account.status}`}>{STATUS_LABEL[account.status]}</span>
                </h3>
                <div className="project-row__meta">
                  <span>{account.accountId ? `Account ${account.accountId}` : "Account not verified"}</span>
                  <span>{account.region}</span>
                  {account.lastVerifiedAt && (
                    <span>Verified {new Date(account.lastVerifiedAt).toLocaleDateString()}</span>
                  )}
                </div>
                {account.status === "error" && account.lastError && (
                  <p className="error" style={{ marginTop: 6 }}>{account.lastError}</p>
                )}
              </div>
              <div className="row-actions">
                {account.status !== "connected" && (
                  <button type="button" className="button button--secondary button--sm" onClick={() => setPanel(account)}>
                    Finish setup
                  </button>
                )}
                <button type="button" className="button button--ghost button--danger" onClick={() => handleRemove(account)}>
                  Disconnect
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
