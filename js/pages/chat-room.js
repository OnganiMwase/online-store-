/**
 * ShopEasy Chat Room Redirect Controller (Legacy Forwarder)
 * Forwards any legacy navigation calls to the new high-fidelity /chat.html page.
 */
window.location.replace(`/chat.html${window.location.search}`);
