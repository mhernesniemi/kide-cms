import "virtual:kide/admin-css";

// The entry is served under a fixed, query-busted URL, so lazily loaded chunks must never
// import from it (they'd load a second copy). Everything else lives behind this import.
void import("./boot");
