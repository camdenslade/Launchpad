import type {
  CloudAccount,
  CloudAccountSetup,
  CreateCloudAccount,
  VerifyCloudAccount
} from "@launchpad/contracts";
import { request } from "./client.js";

export function listCloudAccounts(): Promise<CloudAccount[]> {
  return request<CloudAccount[]>("/cloud/accounts");
}

export function createCloudAccount(input: CreateCloudAccount): Promise<CloudAccount> {
  return request<CloudAccount>("/cloud/accounts", { method: "POST", body: input });
}

export function getCloudAccountSetup(id: string): Promise<CloudAccountSetup> {
  return request<CloudAccountSetup>(`/cloud/accounts/${id}/setup`);
}

/**
 * Resolves with the account; check `status`. With `{ quiet: true }` (polling),
 * a failed check leaves the account unchanged instead of recording an error.
 */
export function verifyCloudAccount(id: string, body: VerifyCloudAccount = {}): Promise<CloudAccount> {
  return request<CloudAccount>(`/cloud/accounts/${id}/verify`, { method: "POST", body });
}

export function deleteCloudAccount(id: string): Promise<void> {
  return request<void>(`/cloud/accounts/${id}`, { method: "DELETE" });
}
