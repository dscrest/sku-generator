"use strict";

/**
 * The pluggable seam between reserve actions and real Zoho documents: one
 * function per action, called after our ReservationLine mutation validates.
 * Which Zoho document each action creates (transfer order? adjustment?
 * package?) is pending the reference tables — RESERVE-TASKS.md open item 1.
 * Each returns { docType, docId } for the ReservationLine.zohoDocs audit trail.
 */
function pending(action) {
  return async (_catalyst, _payload) => {
    const err = new Error(`Zoho document mapping for "${action}" pending — see RESERVE-TASKS.md`);
    err.status = 501;
    throw err;
  };
}

module.exports = {
  reserve: pending("reserve"),
  dereserve: pending("dereserve"),
  issue: pending("issue"),
  return: pending("return"),
  transfer: pending("transfer"),
};
