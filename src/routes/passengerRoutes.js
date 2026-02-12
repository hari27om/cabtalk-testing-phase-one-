import express from 'express';
import { getPassengers, insertPassenger, updatePassenger, deletePassenger } from '../controllers/PassengersController.js';
const passengerRoutes = express.Router();
passengerRoutes.use(express.json());
passengerRoutes.post('/passenger', insertPassenger);
passengerRoutes.get('/passenger', getPassengers);
passengerRoutes.put('/passenger/:id', updatePassenger);
passengerRoutes.delete('/passenger/:id', deletePassenger);
export default passengerRoutes;