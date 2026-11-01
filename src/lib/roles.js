// Roles (Users → Role). Admin-level roles run the documents, formats, workflow and folders of
// every office; they differ only in Users and Settings:
//   superadmin       everything, and gives the admin-level roles
//   admin            everything, Settings included
//   itadmin          IT Admin: as admin (adds and manages users), no Settings
//   records          Records Officer: as admin (keeps the records and the archive), no Users, no Settings
//   user / payee     LGU personnel / a third party (supplier, payee)
export const ROLE_NAMES = {
  superadmin: 'Superadmin', admin: 'Admin', itadmin: 'IT Admin', records: 'Records Officer', user: 'User', payee: 'Third Party',
};
export const ADMIN_ROLES = ['superadmin', 'admin', 'itadmin', 'records'];
export const USER_MANAGER_ROLES = ['superadmin', 'admin', 'itadmin'];
export const isAdminRole = (role) => ADMIN_ROLES.includes(role);
export const managesUsers = (role) => USER_MANAGER_ROLES.includes(role);
// Settings: the superadmin and Admin.
export const managesSettings = (role) => ['superadmin', 'admin'].includes(role);
// The superadmin gives every role; an Admin gives IT Admin and Records Officer.
export const ELEVATED_ROLES = ['admin', 'itadmin', 'records'];
