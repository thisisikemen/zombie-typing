import {createActivityGateway} from './activity-gateway.mjs';
const gateway=createActivityGateway();
export default {fetch(request,env){return gateway.fetch(request,env)}};
