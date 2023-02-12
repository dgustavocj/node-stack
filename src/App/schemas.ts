import Joi from 'joi';
import messages from './messages';

export const metaData = Joi.object({
  meta: Joi.object({
    originId: Joi.string().optional(),
    sessionId: Joi.string().optional(),
    serviceId: Joi.string().required(),
    timestamp: Joi.string().required(),
    request: Joi.alternatives()
      .try(
        Joi.object({
          traceId: Joi.string().required(),
          ipAddress: Joi.string().ip().required(),
          userId: Joi.string().required(),
          host: Joi.string().optional(),
          userAgent: Joi.string().optional(),
          method: Joi.string().optional(),
        }),
        Joi.object({
          traceId: Joi.string().required(),
          ipAddress: Joi.string().ip().required(),
          publicKey: Joi.string().required(),
          host: Joi.string().optional(),
          userAgent: Joi.string().optional(),
          method: Joi.string().optional(),
        }),
        Joi.object({
          traceId: Joi.string().required(),
          ipAddress: Joi.string().ip().required(),
          secretKey: Joi.string().required(),
          host: Joi.string().optional(),
          userAgent: Joi.string().optional(),
          method: Joi.string().optional(),
        }),
        Joi.object({
          traceId: Joi.string().required(),
          ipAddress: Joi.string().ip().required(),
          ticketId: Joi.string().required(),
          host: Joi.string().optional(),
          userAgent: Joi.string().optional(),
          method: Joi.string().optional(),
        }),
        Joi.object({
          traceId: Joi.string().required(),
          ipAddress: Joi.string().ip().required(),
          source: Joi.string().required(),
          host: Joi.string().optional(),
          userAgent: Joi.string().optional(),
          method: Joi.string().optional(),
        }),
      )
      .required(),
  }),
  data: Joi.object().required(),
}).messages(messages);
