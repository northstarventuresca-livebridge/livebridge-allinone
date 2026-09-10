import liveBridgeWorker, {
  LiveBridgeRoom
} from "./worker.js";

import {
  handlePromoterRequest
} from "./promoter.js";


export {
  LiveBridgeRoom
};


export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    const promoterResponse =
      await handlePromoterRequest(
        request,
        env
      );

    if(
      promoterResponse
    ) {
      return promoterResponse;
    }

    return liveBridgeWorker.fetch(
      request,
      env,
      ctx
    );
  }
};
