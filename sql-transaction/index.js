const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const knex = require('knex')({
    client: 'mysql2',
    connection: {
        host: 'localhost',
        user: 'api-server',
        password: 'hello-world',
        database: 'online-transaction'
    },
    acquireConnectionTimeout: 60000,
    pool: {
        min: 5,
        max: 10
    }
});

const app = express();

app.use(bodyParser.json())
app.use(morgan('short'));

app.use((req, res, error, next) => {
    console.error(error);
    return res.status(500).send({ error })
})

app.post('/product/:productId', async (req, res) => {
    try {
        const {
            userId,
            amount
        } = req.body;

        const {
            productId
        } = req.params;

        const trx = await knex.transaction();
        // trx.raw('set transaction isolation level serializable;');
        try {
            const product = await trx('products').first(['total', 'price', 'sold']).where('id', productId).forUpdate();
            if (product.total - product.sold <= 0) {
                console.log('sold out');
                return res.status(400).json();
            }

            const account = await trx('bank_accounts').first(['balance']).where('user_id', userId).forUpdate();

            const cost = product.price * amount;
            const canPurchase = cost <= account.balance;
            if (!canPurchase) {
                console.log('not have enough money', account, cost, amount, product);
                return res.status(400).json();
            }

            await trx('orders').insert({
                user_id: userId,
                product_id: productId,
                amount,
                cost
            });

            await trx('bank_accounts').update({
                balance: account.balance - cost
            }).where({
                user_id: userId
            })

            await trx('products').update({
                sold: product.sold + amount,
            }).where({
                id: productId
            });

            await trx.commit();

            res.send();
        } catch (err) {
            console.error(err);
            await trx.rollback();
            res.status(500).send();
        } finally {
            if (trx && !trx.isCompleted()) {
                await trx.rollback();
            }
        }
    } catch (err) {
        console.error(err);
        res.status(500).send();
    }
});

app.listen(3001, () => {
    console.log('server started')
})