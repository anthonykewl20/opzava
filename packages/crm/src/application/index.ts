export type {
  CrmAccountDto,
  CrmActivityDto,
  CrmActor,
  CrmApplicationContext,
  CrmApplicationDependencies,
  CrmContactDto,
  CrmDealDto,
  CrmDealStageColumnDto,
  CrmPipelineDto,
  CrmPipelineStageDto,
  CrmPipelineWithStagesDto,
  CrmTicketDto,
} from "./shared.js";
export type {
  CreateAccountInput,
  GetAccountInput,
  ListAccountsInput,
  UpdateAccountInput,
} from "./accounts.js";
export { createAccount, getAccount, listAccounts, updateAccount } from "./accounts.js";
export type {
  CreateContactInput,
  GetContactInput,
  ListContactsInput,
  ListContactTimelineInput,
  UpdateContactInput,
} from "./contacts.js";
export {
  createContact,
  getContact,
  listContacts,
  listContactTimeline,
  updateContact,
} from "./contacts.js";
export type {
  CloseDealInput,
  CreateDealInput,
  EnsureDefaultPipelineInput,
  ListDealsInput,
  MoveDealStageInput,
  ReopenDealInput,
  UpdateDealInput,
} from "./deals.js";
export {
  closeDeal,
  createDeal,
  ensureDefaultPipeline,
  listDeals,
  moveDealStage,
  reopenDeal,
  updateDeal,
} from "./deals.js";
export type {
  CreateTicketInput,
  GetTicketInput,
  ListTicketsInput,
  UpdateTicketInput,
  UpdateTicketStatusInput,
} from "./tickets.js";
export {
  createTicket,
  getTicket,
  listTickets,
  updateTicket,
  updateTicketStatus,
} from "./tickets.js";
export type { AddNoteInput } from "./activities.js";
export { addNote } from "./activities.js";
export { RoleKeyCrmAuthorizationPort, defaultCrmAuthorizationPort } from "./authorization.js";
